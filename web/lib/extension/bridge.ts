"use client";
/**
 * Web app ↔ Chrome extension messaging (§9.4, §F27). The real extension is reached with
 * chrome.runtime.sendMessage(EXTENSION_ID, …) via externally_connectable. When it is not
 * connected the actions report that clearly instead of failing silently.
 */
import { EXTENSION_ID } from "@/lib/api/config";
import { toast } from "@/lib/toast";
import { useExtensionStore } from "@/stores/extension";

type ExtMessage =
  | { type: "FOCUS_TAB"; url: string }
  | { type: "OPEN_URLS_AS_GROUP"; title: string; color: string; urls: string[] }
  | { type: "CLOSE_SAVED_TABS"; urls: string[] }
  | { type: "REQUEST_LIVE_VIDEO"; url: string }
  | { type: "ENABLE_INTERACTIVE_EMBED"; url: string }
  | { type: "START_TRACKING"; workspace_id: string }
  | { type: "STOP_TRACKING" };

interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, cb?: (res: unknown) => void) => void;
}
function chromeRuntime(): ChromeRuntime | null {
  const c = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime?.sendMessage ? c.runtime : null;
}

export function detectExtension(): Promise<boolean> {
  return new Promise((resolve) => {
    const rt = chromeRuntime();
    if (!rt || !EXTENSION_ID) return resolve(false);
    const t = setTimeout(() => resolve(false), 800);
    try {
      rt.sendMessage(EXTENSION_ID, { type: "PING" }, (res) => {
        clearTimeout(t);
        resolve(!!res);
      });
    } catch {
      clearTimeout(t);
      resolve(false);
    }
  });
}

function send(msg: ExtMessage, simulatedMessage: string): boolean {
  const { connected, simulated } = useExtensionStore.getState();
  const rt = chromeRuntime();
  if (connected && rt && EXTENSION_ID) {
    rt.sendMessage(EXTENSION_ID, msg);
    return true;
  }
  toast.warning("Chrome extension connection required.", {
    description: simulated ? `Demo mode: ${simulatedMessage}` : "Install and connect the extension in Settings.",
  });
  return false;
}

export const extensionBridge = {
  goToTab: (url: string) => send({ type: "FOCUS_TAB", url }, "would switch Chrome to this tab."),
  openAsTabGroup: (title: string, color: string, urls: string[]) =>
    send({ type: "OPEN_URLS_AS_GROUP", title, color, urls }, `would open ${urls.length} tabs as the group “${title}”.`),
  closeSavedTabs: (urls: string[]) => send({ type: "CLOSE_SAVED_TABS", urls }, `would close ${urls.length} saved tabs.`),
  requestLive: (url: string) => send({ type: "REQUEST_LIVE_VIDEO", url }, "press Alt+Shift+L on the tab to stream it."),
  openUrl: (url: string) => window.open(url, "_blank", "noopener,noreferrer"),
};
