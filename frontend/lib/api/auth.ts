import type { ApiToken, AuthResponse, CreatedToken, LoginRequest, RegisterRequest, TokenKind, User } from "@/types/api";
import { apiClient } from "./client";

export const authApi = {
  register: (body: RegisterRequest) => apiClient.post<AuthResponse>("/auth/register", body),
  login: (body: LoginRequest) => apiClient.post<AuthResponse>("/auth/login", body),
  logout: () => apiClient.post<void>("/auth/logout"),
  me: () => apiClient.get<User>("/me"),
};

export const tokensApi = {
  list: () => apiClient.get<ApiToken[]>("/tokens"),
  create: (kind: TokenKind, name: string) => apiClient.post<CreatedToken>("/tokens", { kind, name }),
  revoke: (id: string) => apiClient.delete(`/tokens/${id}`),
};
