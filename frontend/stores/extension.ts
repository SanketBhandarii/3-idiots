"use client";
/**
 * Chrome extension bridge state (§9.4). Real messages (TABS_STATE, LIVE_STREAM_ID…) arrive via
 * chrome.runtime ports; in demo mode the browsing simulator fills this store instead.
 */
import { create } from "zustand";
import type { TabState } from "@/types/api";

export type PreviewMode = "snapshot" | "live" | "interactive";

interface ExtensionState {
  /** Real extension connected through externally_connectable. */
  connected: boolean;
  /** Demo simulator is standing in for the extension. */
  simulated: boolean;
  /** url_normalized → tab state */
  tabs: Record<string, Exclude<TabState, "closed" | "live">>;
  previewMode: Record<string, PreviewMode>;
  setConnected: (c: boolean) => void;
  setSimulated: (s: boolean) => void;
  setTabs: (t: ExtensionState["tabs"]) => void;
  setPreviewMode: (nodeId: string, m: PreviewMode) => void;
}

export const useExtensionStore = create<ExtensionState>((set) => ({
  connected: false,
  simulated: true,
  tabs: {},
  previewMode: {},
  setConnected: (connected) => set({ connected }),
  setSimulated: (simulated) => set({ simulated }),
  setTabs: (tabs) => set({ tabs }),
  setPreviewMode: (nodeId, m) =>
    set((s) => {
      const next = { ...s.previewMode, [nodeId]: m };
      // limits from §13.1: max 4 live videos, max 3 interactive
      const count = (mode: PreviewMode) => Object.values(next).filter((x) => x === mode).length;
      if (m === "live" && count("live") > 4) return s;
      if (m === "interactive" && count("interactive") > 3) return s;
      return { previewMode: next };
    }),
}));
