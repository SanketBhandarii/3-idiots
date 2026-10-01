"use client";
/**
 * Web app ↔ Chrome extension messaging (§9.4, §F27).
 * Web → extension: chrome.runtime.sendMessage(EXTENSION_ID, …) via externally_connectable.
 * Extension → web: a long-lived port (chrome.runtime.connect) carrying TABS_STATE, SNAPSHOT, LIVE_STREAM_ID, TRACKING_STATE.
 */
import { API_MODE, EXTENSION_ID } from "@/lib/api/config";
import { tokensApi } from "@/lib/api/auth";
import { toast } from "@/lib/toast";
import { useExtensionStore } from "@/stores/extension";

type ExtMessage =
  | { type: "PING" }
  | { type: "CONNECT_TOKEN"; token: string; api_base: string }
  | { type: "FOCUS_TAB"; url: string }
  | { type: "OPEN_URLS_AS_GROUP"; title: string; color: string; urls: string[] }
  | { type: "CLOSE_SAVED_TABS"; urls: string[] }
  | { type: "REQUEST_LIVE_VIDEO"; url: string }
  | { type: "ENABLE_INTERACTIVE_EMBED"; url: string }
  | { type: "START_TRACKING"; workspace_id: string; session_id: string }
  | { type: "PAUSE_TRACKING" }
  | { type: "RESUME_TRACKING" }
  | { type: "STOP_TRACKING" }
  | { type: "GET_OPEN_TABS" };

interface Port {
  onMessage: { addListener: (fn: (m: Record<string, unknown>) => void) => void };
  onDisconnect: { addListener: (fn: () => void) => void };
}
interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, cb?: (res: unknown) => void) => void;
  connect?: (id: string) => Port;
}
function chromeRuntime(): ChromeRuntime | null {
  const c = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime?.sendMessage ? c.runtime : null;
}

function call<T = Record<string, unknown>>(msg: ExtMessage, timeoutMs = 1500): Promise<T | null> {
  return new Promise((resolve) => {
    const rt = chromeRuntime();
    if (!rt || !EXTENSION_ID) return resolve(null);
    const t = setTimeout(() => resolve(null), timeoutMs);
    try {
      rt.sendMessage(EXTENSION_ID, msg, (res) => {
        clearTimeout(t);
        resolve((res as T) ?? null);
      });
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

export async function detectExtension(): Promise<boolean> {
  return !!(await call({ type: "PING" }, 800));
}

let portOpen = false;
function openPort() {
  const rt = chromeRuntime();
  if (portOpen || !rt?.connect || !EXTENSION_ID) return;
  const port = rt.connect(EXTENSION_ID);
  portOpen = true;
  const st = useExtensionStore.getState();
  port.onMessage.addListener((m) => {
    switch (m.type) {
      case "TABS_STATE":
        st.setTabs(m.tabs as Record<string, "active" | "open">);
        break;
      case "SNAPSHOT":
        st.setSnapshot(String(m.url), String(m.image));
        break;
      case "LIVE_STREAM_ID":
        st.setLiveStream(String(m.url), String(m.stream_id));
        break;
      case "TRACKING_STATE":
        st.setTracking({ tracking: !!m.tracking, paused: !!m.paused, workspace_id: (m.workspace_id as string) ?? null });
        break;
    }
  });
  port.onDisconnect.addListener(() => {
    portOpen = false;
    useExtensionStore.getState().setConnected(false);
  });
}

/** Detects the extension, gives it an extension token if it has none, and opens the message port. */
export async function connectExtension(opts: { forceNewToken?: boolean } = {}): Promise<boolean> {
  if (API_MODE !== "http") return detectExtension();
  const ping = await call<{ ok: boolean; connected: boolean }>({ type: "PING" }, 800);
  if (!ping) {
    useExtensionStore.getState().setConnected(false);
    return false;
  }
  if (!ping.connected || opts.forceNewToken) {
    const t = await tokensApi.create("extension", "Chrome extension");
    const apiBase = `${window.location.protocol}//${window.location.hostname}:8080/api/v1`;
    await call({ type: "CONNECT_TOKEN", token: t.token, api_base: process.env.NEXT_PUBLIC_EXTENSION_API_BASE || apiBase });
  }
  openPort();
  useExtensionStore.getState().setConnected(true);
  return true;
}

function send(msg: ExtMessage, simulatedMessage: string): boolean {
  const { connected, simulated } = useExtensionStore.getState();
  const rt = chromeRuntime();
  if (connected && rt && EXTENSION_ID) {
    rt.sendMessage(EXTENSION_ID, msg);
    return true;
  }
  toast.warning("Chrome extension connection required.", {
    description: simulated ? `Demo mode: ${simulatedMessage}` : "Install the extension and click Connect extension in Settings.",
  });
  return false;
}

export const extensionBridge = {
  goToTab: (url: string) => send({ type: "FOCUS_TAB", url }, "would switch Chrome to this tab."),
  openAsTabGroup: (title: string, color: string, urls: string[]) =>
    send({ type: "OPEN_URLS_AS_GROUP", title, color, urls }, `would open ${urls.length} tabs as the group “${title}”.`),
  closeSavedTabs: (urls: string[]) => send({ type: "CLOSE_SAVED_TABS", urls }, `would close ${urls.length} saved tabs.`),
  requestLive: (url: string) => {
    const ok = send({ type: "REQUEST_LIVE_VIDEO", url }, "press Alt+Shift+L on the tab to stream it.");
    if (ok) toast.info("Switched to the tab", { description: "Press Alt+Shift+L there to stream it live into this node." });
    return ok;
  },
  enableEmbed: (url: string) => (useExtensionStore.getState().connected ? void call({ type: "ENABLE_INTERACTIVE_EMBED", url }) : undefined),
  startTracking: (workspaceId: string, sessionId: string) =>
    send({ type: "START_TRACKING", workspace_id: workspaceId, session_id: sessionId }, "tracking started."),
  pauseTracking: () => void call({ type: "PAUSE_TRACKING" }),
  resumeTracking: () => void call({ type: "RESUME_TRACKING" }),
  stopTracking: () => void call({ type: "STOP_TRACKING" }),
  /** Open http(s) tabs as reported by the extension (normalized URLs); null when the extension is not reachable. */
  getOpenTabs: async (): Promise<string[] | null> => {
    const res = await call<{ ok: boolean; tabs: { url_normalized: string }[] }>({ type: "GET_OPEN_TABS" });
    return res?.ok ? res.tabs.map((t) => t.url_normalized) : null;
  },
  openUrl: (url: string) => window.open(url, "_blank", "noopener,noreferrer"),
};
