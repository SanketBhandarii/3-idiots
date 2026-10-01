package app

import (
	"context"
	"encoding/json"
	"html"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// seedClient is the name shown on sources the server adds by itself (instead of the AI assistant's name).
const seedClient = "Research Map (Wikipedia)"

var htmlTag = regexp.MustCompile(`<[^>]+>`)

// seedWikipedia adds the top Wikipedia articles for a research topic as sources in the AI Agent branch. The AI
// pipeline then reads each full article (summary, topics, claims, connections), so a workspace started over MCP fills
// with real, reviewable sources even when the assistant's own web search is rate-limited.
func (a *App) seedWikipedia(u *User, wsID, topic string, session *Session) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	results, err := wikipediaSearch(ctx, topic, 4)
	if err != nil {
		slog.Warn("[MCP] wikipedia seed failed", "topic", topic, "err", err)
		return
	}
	added := 0
	for _, r := range results {
		res, err := a.ingestPage(ctx, u, capturePageReq{URL: r.url, Title: r.title, ContentText: r.snippet, Transition: "manual",
			WorkspaceID: wsID, SearchQuery: &topic, ClientName: seedClient}, session, "mcp")
		if err != nil {
			slog.Warn("[MCP] wikipedia seed: add source failed", "url", r.url, "err", err)
			continue
		}
		if res["is_new"] == true {
			added++
			a.logEvent(ctx, wsID, &u.ID, "source_added", gin.H{"node_id": res["node_id"], "url": r.url, "via": "mcp", "client": seedClient})
		}
		time.Sleep(400 * time.Millisecond) // let the nodes pop in one by one on the canvas
	}
	slog.Info("[MCP] wikipedia sources seeded", "workspace_id", wsID, "topic", topic, "added", added)
}

type wikiResult struct{ title, url, snippet string }

func wikipediaSearch(ctx context.Context, q string, limit int) ([]wikiResult, error) {
	api := "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&srprop=snippet&srlimit=" +
		strconv.Itoa(limit) + "&srsearch=" + url.QueryEscape(q)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, api, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "ResearchMap/1.0 (research workspace; MCP background sources)") // required by Wikimedia
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var body struct {
		Query struct {
			Search []struct {
				Title   string `json:"title"`
				Snippet string `json:"snippet"`
			} `json:"search"`
		} `json:"query"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	out := []wikiResult{}
	for _, s := range body.Query.Search {
		snippet := strings.Join(strings.Fields(html.UnescapeString(htmlTag.ReplaceAllString(s.Snippet, ""))), " ")
		out = append(out, wikiResult{title: s.Title, snippet: snippet,
			url: "https://en.wikipedia.org/wiki/" + url.PathEscape(strings.ReplaceAll(s.Title, " ", "_"))})
	}
	return out, nil
}
