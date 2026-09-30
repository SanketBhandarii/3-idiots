import type { JourneyResponse, ReferenceFormat, ReferencesResponse, Session, SessionStats } from "@/types/api";
import { apiClient } from "./client";

export const sessionApi = {
  start: (workspaceId: string) => apiClient.post<Session>(`/workspaces/${workspaceId}/sessions/start`),
  stop: (sessionId: string, openTabs: string[] = []) =>
    apiClient.post<Session>(`/sessions/${sessionId}/stop`, { open_tabs: openTabs }),
  /** (frontend addition) pause / resume, matches extension shortcut Alt+Shift+P */
  pause: (sessionId: string) => apiClient.post<Session>(`/sessions/${sessionId}/pause`),
  resume: (sessionId: string) => apiClient.post<Session>(`/sessions/${sessionId}/resume`),
  list: (workspaceId: string) => apiClient.get<Session[]>(`/workspaces/${workspaceId}/sessions`),
  stats: (sessionId: string) => apiClient.get<SessionStats>(`/sessions/${sessionId}/stats`),
  references: (sessionId: string, format: ReferenceFormat = "json") =>
    apiClient.get<ReferencesResponse>(`/sessions/${sessionId}/references`, { format }),
  journey: (workspaceId: string, sessionId?: string) =>
    apiClient.get<JourneyResponse>(`/workspaces/${workspaceId}/journey`, { session: sessionId }),
};
