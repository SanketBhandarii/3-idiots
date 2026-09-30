package app

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"sync"
	"time"

	"github.com/SanketBhandarii/3-idiots/backend/internal/httpx"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

const cookieName = "rm_session"
const sessionTTL = 7 * 24 * time.Hour

type User struct {
	ID          string    `json:"id" db:"id"`
	Email       string    `json:"email" db:"email"`
	Name        string    `json:"name" db:"name"`
	AvatarColor string    `json:"avatar_color" db:"avatar_color"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	// set when the request used an API token (extension / MCP)
	TokenKind string `json:"-" db:"-"`
}

func currentUser(c *gin.Context) *User {
	u, _ := c.Get("user")
	return u.(*User)
}

var avatarColors = []string{"#7b5cf0", "#f08a6c", "#3f8a2e", "#2f6fbf", "#c9544f", "#a86f00"}

func (a *App) setSessionCookie(c *gin.Context, userID string) error {
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject: userID, IssuedAt: jwt.NewNumericDate(time.Now()), ExpiresAt: jwt.NewNumericDate(time.Now().Add(sessionTTL)),
	}).SignedString([]byte(a.cfg.JWTSecret))
	if err != nil {
		return err
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: cookieName, Value: tok, Path: "/", HttpOnly: true,
		Secure: a.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: int(sessionTTL.Seconds())})
	return nil
}

func (a *App) register(c *gin.Context) error {
	if !a.limiter.allow("reg:" + c.ClientIP()) {
		return httpx.RateLimited("Too many attempts. Try again in a minute.")
	}
	var b struct{ Name, Email, Password string }
	if err := bind(c, &b); err != nil {
		return err
	}
	b.Name, b.Email = strings.TrimSpace(b.Name), strings.ToLower(strings.TrimSpace(b.Email))
	if _, err := mail.ParseAddress(b.Email); b.Name == "" || err != nil || len(b.Name) > 80 {
		return httpx.Validation("Enter your name and a valid email")
	}
	if len(b.Password) < 8 || len(b.Password) > 72 {
		return httpx.Validation("Password must be 8 to 72 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(b.Password), 12)
	if err != nil {
		return err
	}
	var n int
	_ = a.db.QueryRow(c, `SELECT count(*) FROM users`).Scan(&n)
	var u User
	err = a.db.QueryRow(c, `INSERT INTO users (email,name,password_hash,avatar_color) VALUES ($1,$2,$3,$4)
		RETURNING id,email,name,avatar_color,created_at`, b.Email, b.Name, string(hash), avatarColors[n%len(avatarColors)]).
		Scan(&u.ID, &u.Email, &u.Name, &u.AvatarColor, &u.CreatedAt)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return httpx.NewError(409, httpx.CodeConflict, "An account with this email already exists")
	}
	if err != nil {
		return err
	}
	if err := a.setSessionCookie(c, u.ID); err != nil {
		return err
	}
	c.JSON(201, gin.H{"user": u})
	return nil
}

func (a *App) login(c *gin.Context) error {
	var b struct{ Email, Password string }
	if err := bind(c, &b); err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(b.Email))
	if !a.limiter.allow("login:"+c.ClientIP()) || !a.limiter.allow("login:"+email) {
		return httpx.RateLimited("Too many login attempts. Try again in a minute.")
	}
	var u User
	var hash string
	err := a.db.QueryRow(c, `SELECT id,email,name,avatar_color,created_at,password_hash FROM users WHERE email=$1`, email).
		Scan(&u.ID, &u.Email, &u.Name, &u.AvatarColor, &u.CreatedAt, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$12$C6UzMDM.H6dfI/f/IKcEeO5wHn1nZ9O1mGhTPe6u6vW3c3rB6J6nW"), []byte(b.Password)) // equal timing
		return httpx.Unauthorized("Email or password is incorrect")
	}
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(b.Password)) != nil {
		return httpx.Unauthorized("Email or password is incorrect")
	}
	if err := a.setSessionCookie(c, u.ID); err != nil {
		return err
	}
	c.JSON(200, gin.H{"user": u})
	return nil
}

func (a *App) logout(c *gin.Context) error {
	http.SetCookie(c.Writer, &http.Cookie{Name: cookieName, Value: "", Path: "/", HttpOnly: true, MaxAge: -1,
		Secure: a.cfg.IsProduction(), SameSite: http.SameSiteLaxMode})
	c.Status(204)
	return nil
}

func (a *App) me(c *gin.Context) error {
	c.JSON(200, currentUser(c))
	return nil
}

// userFromRequest accepts the session cookie (web app) or a Bearer API token (extension, MCP).
func (a *App) userFromRequest(c *gin.Context) (*User, error) {
	if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") {
		sum := sha256.Sum256([]byte(strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))))
		var u User
		err := a.db.QueryRow(c, `UPDATE api_tokens t SET last_used_at=now() FROM users u
			WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND u.id=t.user_id
			RETURNING u.id,u.email,u.name,u.avatar_color,u.created_at,t.kind`, hex.EncodeToString(sum[:])).
			Scan(&u.ID, &u.Email, &u.Name, &u.AvatarColor, &u.CreatedAt, &u.TokenKind)
		if err != nil {
			return nil, httpx.Unauthorized("Invalid or revoked token")
		}
		return &u, nil
	}
	ck, err := c.Cookie(cookieName)
	if err != nil || ck == "" {
		return nil, httpx.Unauthorized("Please sign in")
	}
	claims := &jwt.RegisteredClaims{}
	_, err = jwt.ParseWithClaims(ck, claims, func(t *jwt.Token) (any, error) { return []byte(a.cfg.JWTSecret), nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
	if err != nil {
		return nil, httpx.Unauthorized("Session expired. Please sign in again.")
	}
	var u User
	err = a.db.QueryRow(c, `SELECT id,email,name,avatar_color,created_at FROM users WHERE id=$1`, claims.Subject).
		Scan(&u.ID, &u.Email, &u.Name, &u.AvatarColor, &u.CreatedAt)
	if err != nil {
		return nil, httpx.Unauthorized("Please sign in")
	}
	return &u, nil
}

func (a *App) authMiddleware(c *gin.Context) {
	u, err := a.userFromRequest(c)
	if err != nil {
		httpx.WriteError(c, err)
		return
	}
	// API tokens may only reach the endpoints their kind needs.
	if (u.TokenKind == "extension" && !extensionAllowed(c.Request.Method, c.FullPath())) || u.TokenKind == "mcp" {
		httpx.WriteError(c, httpx.Forbidden("This token cannot be used here"))
		return
	}
	c.Set("user", u)
	c.Next()
}

func extensionAllowed(method, route string) bool {
	switch {
	case strings.HasPrefix(route, "/api/v1/capture/"), route == "/api/v1/pages/:id/preview", route == "/api/v1/me",
		route == "/api/v1/extension/state", route == "/api/v1/workspaces" && method == "GET":
		return true
	}
	return false
}

/* ---------------------------------------------------------------- API tokens */

type ApiToken struct {
	ID         string     `json:"id" db:"id"`
	Name       string     `json:"name" db:"name"`
	Kind       string     `json:"kind" db:"kind"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at" db:"last_used_at"`
	RevokedAt  *time.Time `json:"revoked_at" db:"revoked_at"`
}

func (a *App) listTokens(c *gin.Context) error {
	rows, _ := a.db.Query(c, `SELECT id,name,kind,created_at,last_used_at,revoked_at FROM api_tokens
		WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC`, currentUser(c).ID)
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[ApiToken])
	if err != nil {
		return err
	}
	c.JSON(200, out)
	return nil
}

func (a *App) createToken(c *gin.Context) error {
	var b struct{ Kind, Name string }
	if err := bind(c, &b); err != nil {
		return err
	}
	if b.Kind != "extension" && b.Kind != "mcp" {
		return httpx.Validation("kind must be extension or mcp")
	}
	if b.Name = strings.TrimSpace(b.Name); b.Name == "" || len(b.Name) > 60 {
		b.Name = b.Kind
	}
	raw := make([]byte, 24)
	_, _ = rand.Read(raw)
	plain := "rm_" + b.Kind[:3] + "_" + hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(plain))
	rows, _ := a.db.Query(c, `INSERT INTO api_tokens (user_id,name,kind,token_hash) VALUES ($1,$2,$3,$4)
		RETURNING id,name,kind,created_at,last_used_at,revoked_at`, currentUser(c).ID, b.Name, b.Kind, hex.EncodeToString(sum[:]))
	t, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[ApiToken])
	if err != nil {
		return err
	}
	c.JSON(201, gin.H{"id": t.ID, "name": t.Name, "kind": t.Kind, "created_at": t.CreatedAt,
		"last_used_at": nil, "revoked_at": nil, "token": plain})
	return nil
}

func (a *App) revokeToken(c *gin.Context) error {
	tag, err := a.db.Exec(c, `UPDATE api_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`,
		c.Param("id"), currentUser(c).ID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return httpx.NotFound("Token")
	}
	c.Status(204)
	return nil
}

/* ---------------------------------------------------------------- rate limiter */

type rateLimiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   map[string][]time.Time
}

func newRateLimiter(max int, window time.Duration) *rateLimiter {
	return &rateLimiter{max: max, window: window, hits: map[string][]time.Time{}}
}

func (r *rateLimiter) allow(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	h := r.hits[key][:0]
	for _, t := range r.hits[key] {
		if now.Sub(t) < r.window {
			h = append(h, t)
		}
	}
	if len(h) >= r.max {
		r.hits[key] = h
		return false
	}
	r.hits[key] = append(h, now)
	return true
}
