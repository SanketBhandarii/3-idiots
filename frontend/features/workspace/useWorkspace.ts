"use client";
/**
 * Loads a workspace (graph + signals + session), connects the WebSocket and wires every
 * server event into the stores. Also persists the view state for exact resume (§F3).
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WsClientMessage, WsServerMessage } from "@/types/api";
import { conflictApi, radarApi, workspaceApi } from "@/lib/api";
import { debounce } from "@/lib/utils/debounce";
import { connectWorkspaceSocket, type WorkspaceSocket } from "@/lib/ws/socket";
import { toast } from "@/lib/toast";
import { browsingSimulator } from "@/lib/extension/simulator";
import { API_MODE } from "@/lib/api/config";
import { connectExtension, extensionBridge } from "@/lib/extension/bridge";
import { useGraphStore } from "@/stores/graph";
import { useUiStore } from "@/stores/ui";
import { useSessionStore } from "@/stores/session";
import { useCollabStore, useSignalsStore } from "@/stores/collab";
import { useAuthStore } from "@/stores/auth";
import { qk } from "@/features/workspaces/hooks";

let socket: WorkspaceSocket | null = null;
export function sendSocket(msg: WsClientMessage) {
  socket?.send(msg);
}

export function useWorkspace(workspaceId: string) {
  const branch = useUiStore((s) => s.branch);
  const qc = useQueryClient();
  const restored = useRef<string | null>(null);

  const graph = useQuery({
    queryKey: ["graph", workspaceId, branch],
    queryFn: () => workspaceApi.getGraph(workspaceId, branch),
    staleTime: Infinity,
  });

  // Hydrate stores from GET /graph
  useEffect(() => {
    if (!graph.data) return;
    useGraphStore.getState().hydrate(graph.data);
    if (restored.current !== workspaceId) {
      restored.current = workspaceId;
      const vs = graph.data.view_state;
      useUiStore.getState().restore(vs);
      if (vs && vs.branch !== branch) useUiStore.getState().setBranch(vs.branch);
      const active = graph.data.workspace.active_session;
      useSessionStore.getState().setSession(active);
      if (API_MODE === "mock" && active?.state === "active" && !browsingSimulator.isRunning(workspaceId)) browsingSimulator.start(workspaceId, active.id);
      if (API_MODE === "http") void connectExtension().then((ok) => ok && active && active.state !== "stopped" && extensionBridge.startTracking(workspaceId, active.id, false));
      const jumpTo = new URLSearchParams(window.location.search).get("node");
      if (jumpTo) {
        useUiStore.getState().setViewMode("graph");
        useUiStore.getState().selectNode(jumpTo);
        setTimeout(() => useUiStore.getState().requestFocus(jumpTo), 400);
      }
    }
  }, [graph.data, workspaceId, branch]);

  // Signals
  const conflicts = useQuery({ queryKey: qk.conflicts(workspaceId), queryFn: () => conflictApi.list(workspaceId) });
  const radar = useQuery({ queryKey: qk.radar(workspaceId), queryFn: () => radarApi.get(workspaceId) });
  useEffect(() => void (conflicts.data && useSignalsStore.getState().setConflicts(conflicts.data)), [conflicts.data]);
  useEffect(() => void (radar.data && useSignalsStore.getState().setRadar(radar.data)), [radar.data]);

  // WebSocket
  useEffect(() => {
    const myId = () => useAuthStore.getState().user?.id;
    const onMessage = (msg: WsServerMessage) => {
      useGraphStore.getState().applyMessage(msg);
      switch (msg.type) {
        case "job.status":
          useSessionStore.getState().pushJob(msg.data);
          if (msg.data.kind === "report") void qc.invalidateQueries({ queryKey: ["report"] });
          break;
        case "presence":
          useCollabStore.getState().setPresence(msg.data.users);
          break;
        case "session.updated":
          if (msg.data.user_id === myId()) useSessionStore.getState().setSession(msg.data.state === "stopped" ? null : msg.data);
          void qc.invalidateQueries({ queryKey: qk.sessions(workspaceId) });
          break;
        case "conflict.detected":
          useSignalsStore.getState().upsertConflict(msg.data);
          toast.warning("Potential conflict detected", {
            description: msg.data.analysis.topic,
            action: { label: "Review", onClick: () => useUiStore.getState().openPanel("conflicts") },
          });
          void qc.invalidateQueries({ queryKey: qk.conflicts(workspaceId) });
          break;
        case "conflict.updated":
          useSignalsStore.getState().upsertConflict(msg.data);
          break;
        case "radar.updated":
          useSignalsStore.getState().setRadar(msg.data);
          qc.setQueryData(qk.radar(workspaceId), msg.data);
          break;
        case "annotation.created":
          if (msg.by && msg.by !== myId() && msg.data.kind === "comment") {
            toast.info(`${msg.data.author_name} commented`, {
              description: msg.data.body,
              action: { label: "View", onClick: () => { useUiStore.getState().selectNode(msg.data.node_id); useUiStore.getState().requestFocus(msg.data.node_id); } },
            });
          }
          break;
        case "node.created":
          if (msg.data.type === "page" && msg.data.created_via !== "manual") void qc.invalidateQueries({ queryKey: qk.journey(workspaceId) });
          break;
      }
    };
    socket = connectWorkspaceSocket(workspaceId, {
      onMessage,
      onStatus: (s) => {
        const prev = useCollabStore.getState().socketStatus;
        useCollabStore.getState().setSocketStatus(s);
        // The hub drops frames for disconnected/slow clients; refetch so nodes captured during the gap appear.
        if (s === "open" && prev === "reconnecting") void qc.invalidateQueries({ queryKey: ["graph", workspaceId] });
      },
    });
    return () => {
      socket?.close();
      socket = null;
    };
  }, [workspaceId, qc]);

  // Presence: broadcast my selection
  useEffect(
    () =>
      useUiStore.subscribe((s, prev) => {
        if (s.selectedNodeId !== prev.selectedNodeId) sendSocket({ type: "presence.update", data: { selected_node_id: s.selectedNodeId } });
      }),
    [],
  );

  // Persist view state (debounced)
  useEffect(() => {
    const save = debounce(() => {
      if (!useGraphStore.getState().loaded) return;
      void workspaceApi.saveViewState(workspaceId, useUiStore.getState().snapshot()).catch(() => undefined);
    }, 800);
    const unsub = useUiStore.subscribe((s, p) => {
      if (
        s.viewport !== p.viewport || s.viewMode !== p.viewMode || s.panel !== p.panel || s.selectedNodeId !== p.selectedNodeId ||
        s.branch !== p.branch || s.filters !== p.filters || s.colorBy !== p.colorBy || s.focusNodeId !== p.focusNodeId
      )
        save();
    });
    return () => {
      unsub();
      save.cancel();
    };
  }, [workspaceId]);

  // Cleanup on leave
  useEffect(
    () => () => {
      browsingSimulator.stop();
      useGraphStore.getState().reset();
      useSessionStore.getState().setSession(null);
      useSessionStore.getState().clearJobs();
      useCollabStore.getState().setPresence([]);
      useSignalsStore.setState({ conflicts: [], radar: null });
      useUiStore.getState().reset();
      restored.current = null;
    },
    [workspaceId],
  );

  return graph;
}
