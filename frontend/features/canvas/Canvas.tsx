"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnBeforeDelete,
} from "@xyflow/react";
import {
  ArrowSquareOut,
  CornersOut,
  Crosshair,
  Lightbulb,
  Minus,
  NotePencil,
  Plus,
  Question,
  SquaresFour,
  Tag as TagIcon,
  Trash,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { NodeType, Relation } from "@/types/api";
import { sessionApi } from "@/lib/api";
import { RELATIONS, USER_SELECTABLE_RELATIONS } from "@/lib/domain/meta";
import { extensionBridge } from "@/lib/extension/bridge";
import { cn } from "@/lib/utils/cn";
import { useGraphStore, type RFEdge, type RFNode } from "@/stores/graph";
import { useUiStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/primitives";
import { commitDrag, connectNodes, createNode, deleteEdge, deleteNodes, rejectEdge } from "@/features/graph/actions";
import { qk } from "@/features/workspaces/hooks";
import { nodeTypes } from "./nodes";
import { EdgeMarkers, edgeTypes } from "./ExplainedEdge";

function absolute(n: RFNode, all: RFNode[]) {
  const p = n.parentId ? all.find((x) => x.id === n.parentId) : undefined;
  return p ? { x: p.position.x + n.position.x, y: p.position.y + n.position.y } : n.position;
}

/** Nodes within `depth` hops of `id` (Focus view, §F13). */
function neighbourhood(id: string, edges: RFEdge[], nodes: RFNode[], depth = 2) {
  const set = new Set([id]);
  const focus = nodes.find((n) => n.id === id);
  if (focus?.type === "topic") nodes.filter((n) => n.parentId === id).forEach((n) => set.add(n.id));
  for (let i = 0; i < depth; i++) {
    edges.forEach((e) => {
      if (e.hidden) return;
      if (set.has(e.source)) set.add(e.target);
      if (set.has(e.target)) set.add(e.source);
    });
  }
  nodes.forEach((n) => n.parentId && set.has(n.id) && set.add(n.parentId));
  return set;
}

function useVisibleGraph() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const pages = useGraphStore((s) => s.pages);
  const filters = useUiStore((s) => s.filters);
  const viewMode = useUiStore((s) => s.viewMode);
  const focusId = useUiStore((s) => s.focusNodeId);
  const journeyOn = useUiStore((s) => s.journeyOverlay);
  const workspaceId = useGraphStore((s) => s.workspaceId);
  const journey = useQuery({
    queryKey: qk.journey(workspaceId ?? "", undefined),
    queryFn: () => sessionApi.journey(workspaceId!),
    enabled: !!workspaceId && journeyOn,
  });

  // Nodes recompute on every drag frame; edges only when node *visibility* changes (keeps dragging fast).
  const { vNodes, focusSet, hiddenKey } = useMemo(() => {
    const f = filters;
    const hasNodeFilter = f.tag_ids.length || f.category_ids.length || f.domains.length || f.page_types.length || f.collaborator_ids.length;
    const pass = (n: RFNode) => {
      const d = n.data.node;
      if (d.type === "topic") return true;
      if (d.status === "inbox") return false;
      if (!hasNodeFilter) return true;
      const p = d.page_id ? pages[d.page_id] : undefined;
      if (f.tag_ids.length && !d.tag_ids.some((t) => f.tag_ids.includes(t))) return false;
      if (f.category_ids.length && (!d.category_id || !f.category_ids.includes(d.category_id))) return false;
      if (f.domains.length && (!p || !f.domains.includes(p.domain))) return false;
      if (f.page_types.length && (!p?.page_type || !f.page_types.includes(p.page_type))) return false;
      if (f.collaborator_ids.length && (!d.created_by || !f.collaborator_ids.includes(d.created_by))) return false;
      return true;
    };
    const focusSet = viewMode === "focus" && focusId ? neighbourhood(focusId, edges, nodes) : null;
    const vNodes = nodes.map((n) => {
      const hidden = n.hidden || !pass(n);
      const faded = focusSet ? !focusSet.has(n.id) : false;
      if (hidden === !!n.hidden && !faded) return n;
      return { ...n, hidden: hidden || (faded && n.type !== "topic"), className: faded ? "opacity-15 pointer-events-none" : undefined };
    });
    return { vNodes, focusSet, hiddenKey: vNodes.filter((n) => n.hidden).map((n) => n.id).join(",") };
  }, [nodes, edges, pages, filters, viewMode, focusId]);

  const vEdgesAll = useMemo(() => {
    const f = filters;
    const hiddenIds = new Set(hiddenKey.split(","));
    let vEdges: RFEdge[] = edges.map((e) => {
      const ed = e.data!.edge;
      let hidden = !!e.hidden;
      if (ed.state === "suggested" && (ed.confidence ?? 1) < 0.5) hidden = !f.show_weak;
      if (ed.state === "suggested" && !f.show_suggested) hidden = true;
      if (hiddenIds.has(e.source) || hiddenIds.has(e.target)) hidden = true;
      if (focusSet && (!focusSet.has(e.source) || !focusSet.has(e.target))) hidden = true;
      return hidden === !!e.hidden ? e : { ...e, hidden };
    });
    if (journeyOn && journey.data) {
      const seq: string[] = [];
      journey.data.items.forEach((it) => it.node_id && seq[seq.length - 1] !== it.node_id && seq.push(it.node_id));
      const extra = seq.slice(1).map(
        (id, i) =>
          ({
            id: `journey-${i}`,
            source: seq[i]!,
            target: id,
            animated: true,
            label: `${i + 1}`,
            style: { stroke: "#f08a6c", strokeWidth: 2.5 },
            labelStyle: { fontWeight: 800, fill: "#1c1b2b" },
            labelBgStyle: { fill: "#fad47f" },
            labelBgPadding: [6, 3],
            labelBgBorderRadius: 10,
            selectable: false,
          }) as Edge as RFEdge,
      );
      vEdges = [...vEdges, ...extra];
    }
    return vEdges;
  }, [edges, hiddenKey, filters, focusSet, journeyOn, journey.data]);

  return { nodes: vNodes, edges: vEdgesAll };
}

interface Ctx {
  x: number;
  y: number;
  flow: { x: number; y: number };
  nodeId?: string;
}

export function Canvas({ readOnly }: { readOnly: boolean }) {
  const rf = useReactFlow();
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const { nodes, edges } = useVisibleGraph();
  const viewport = useUiStore((s) => s.viewport);
  const focusRequest = useUiStore((s) => s.focusRequest);
  const selectNode = useUiStore((s) => s.selectNode);
  const selectEdge = useUiStore((s) => s.selectEdge);
  const [pending, setPending] = useState<Connection | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [hadSavedView] = useState(() => useUiStore.getState().viewport.x !== 0 || useUiStore.getState().viewport.y !== 0);

  // Zoom-to-node requests (search results, references, radar…)
  useEffect(() => {
    if (!focusRequest) return;
    const all = useGraphStore.getState().nodes;
    const n = all.find((x) => x.id === focusRequest.id);
    if (!n) return;
    if (n.parentId) {
      const parent = all.find((p) => p.id === n.parentId);
      if (parent?.data.node.collapsed) {
        useGraphStore.getState().upsertNode({ ...parent.data.node, collapsed: false });
      }
    }
    const abs = absolute(n, all);
    const w = (n.measured?.width ?? n.width ?? 260) as number;
    const h = (n.measured?.height ?? n.height ?? 200) as number;
    void rf.setCenter(abs.x + w / 2, abs.y + h / 2, { zoom: n.type === "topic" ? 0.7 : 1.05, duration: 700 });
    useGraphStore.getState().setFlash(n.id);
    const t = setTimeout(() => useGraphStore.getState().setFlash(null), 2900);
    return () => clearTimeout(t);
  }, [focusRequest, rf]);

  const onBeforeDelete: OnBeforeDelete<RFNode, RFEdge> = useCallback(
    async ({ nodes: ns, edges: es }) => {
      if (readOnly) return false;
      if (ns.length) void deleteNodes(ns.map((n) => n.id));
      else
        es.forEach((e) => {
          const ed = e.data?.edge;
          if (!ed) return;
          if (ed.origin === "user") void deleteEdge(ed.id);
          else void rejectEdge(ed.id);
        });
      return false;
    },
    [readOnly],
  );

  const openCtx = (e: React.MouseEvent | MouseEvent, nodeId?: string) => {
    e.preventDefault();
    const rect = wrapper.current!.getBoundingClientRect();
    setCtx({
      x: Math.min(e.clientX - rect.left, rect.width - 230),
      y: Math.min(e.clientY - rect.top, rect.height - 260),
      flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      nodeId,
    });
  };

  const ctxNode = ctx?.nodeId ? useGraphStore.getState().nodes.find((n) => n.id === ctx.nodeId)?.data.node : undefined;
  const ctxPage = ctxNode?.page_id ? useGraphStore.getState().pages[ctxNode.page_id] : undefined;

  const addAt = (type: NodeType) => {
    if (!ctx) return;
    void createNode(type, ctx.flow);
    setCtx(null);
  };

  return (
    <div
      ref={wrapper}
      className="relative h-full w-full [&_.react-flow__pane]:cursor-grab [&_.react-flow__pane.dragging]:cursor-grabbing"
      onClick={() => ctx && setCtx(null)}
      onDoubleClick={(e) => {
        if (readOnly || !(e.target as HTMLElement).classList.contains("react-flow__pane")) return;
        void createNode("note", rf.screenToFlowPosition({ x: e.clientX - 110, y: e.clientY - 40 }));
      }}
    >
      <EdgeMarkers />
      <ReactFlow<RFNode, RFEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onBeforeDelete={onBeforeDelete}
        onConnect={(c) => !readOnly && setPending(c)}
        onNodeClick={(_, n) => selectNode(n.id)}
        onEdgeClick={(_, e) => !e.id.startsWith("journey") && selectEdge(e.id)}
        onPaneClick={() => {
          selectNode(null, false);
          selectEdge(null);
        }}
        onNodeDragStop={(_, __, dragged) => !readOnly && void commitDrag(dragged as RFNode[], useGraphStore.getState().nodes)}
        onNodeContextMenu={(e, n) => openCtx(e, n.id)}
        onPaneContextMenu={(e) => !readOnly && openCtx(e)}
        onMoveEnd={(_, v) => useUiStore.getState().setViewport(v)}
        defaultViewport={viewport}
        fitView={!hadSavedView}
        fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
        minZoom={0.08}
        maxZoom={2}
        onlyRenderVisibleElements={nodes.length > 250}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        panOnDrag
        panOnScroll
        panOnScrollSpeed={1.6}
        nodeDragThreshold={2}
        autoPanSpeed={25}
        panOnScrollMode={PanOnScrollMode.Free}
        zoomActivationKeyCode={["Control", "Meta"]}
        panActivationKeyCode="Space"
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
        selectionKeyCode="Shift"
        elementsSelectable
        edgesFocusable
        multiSelectionKeyCode="Shift"
        deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      >
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          className="!hidden md:!block"
          nodeColor={(n: Node) => ((n as RFNode).type === "topic" ? `${(n as RFNode).data.node.body || "#7b5cf0"}55` : "#1c1b2b")}
          nodeBorderRadius={8}
          maskColor="rgb(245 241 232 / 0.7)"
        />
      </ReactFlow>
      <ZoomControls />

      {ctx && (
        <div
          role="menu"
          className="absolute z-50 w-56 rounded-[20px] border-2 border-ink bg-white p-1.5 shadow-pop-lg"
          style={{ left: Math.max(8, ctx.x), top: Math.max(8, ctx.y) }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxNode ? (
            <>
              <p className="truncate px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{ctxNode.title}</p>
              <CtxItem icon={Crosshair} label="Open details" onClick={() => { selectNode(ctxNode.id); setCtx(null); }} />
              {ctxPage && <CtxItem icon={ArrowSquareOut} label="Open page" onClick={() => { extensionBridge.openUrl(ctxPage.url); setCtx(null); }} />}
              {ctxPage && <CtxItem icon={SquaresFour} label="Go to tab" onClick={() => { extensionBridge.goToTab(ctxPage.url); setCtx(null); }} />}
              <CtxItem icon={CornersOut} label="Focus on this" onClick={() => { useUiStore.getState().setFocusNode(ctxNode.id); useUiStore.getState().setViewMode("focus"); setCtx(null); }} />
              {!readOnly && <CtxItem icon={NotePencil} label="Add note" onClick={() => { selectNode(ctxNode.id); useUiStore.setState({ panel: "node" }); setCtx(null); setTimeout(() => document.getElementById("panel-tab-notes")?.click(), 50); }} />}
              {!readOnly && <CtxItem icon={TagIcon} label="Tag & category" onClick={() => { selectNode(ctxNode.id); setCtx(null); setTimeout(() => document.getElementById("tag-input")?.focus(), 150); }} />}
              {!readOnly && <CtxItem icon={Trash} label="Delete" danger onClick={() => { void deleteNodes([ctxNode.id]); setCtx(null); }} />}
            </>
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Add here</p>
              <CtxItem icon={NotePencil} label="Note" onClick={() => addAt("note")} />
              <CtxItem icon={Question} label="Question" onClick={() => addAt("question")} />
              <CtxItem icon={Lightbulb} label="Finding" onClick={() => addAt("finding")} />
              <CtxItem icon={SquaresFour} label="Topic group" onClick={() => addAt("topic")} />
            </>
          )}
        </div>
      )}

      <RelationPicker
        connection={pending}
        onClose={() => setPending(null)}
        onPick={(rel, reason) => {
          if (pending?.source && pending.target) void connectNodes(pending.source, pending.target, rel, reason);
          setPending(null);
        }}
      />
    </div>
  );
}

function CtxItem({ icon: I, label, onClick, danger }: { icon: typeof Plus; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-canvas", danger ? "text-danger" : "text-ink")}>
      <I size={17} weight="bold" /> {label}
    </button>
  );
}

function ZoomControls() {
  const rf = useReactFlow();
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 rounded-full bg-white p-1 shadow-clay-sm md:right-[224px]" role="group" aria-label="Zoom controls">
      <Tip label="Zoom in" side="right">
        <button aria-label="Zoom in" onClick={() => rf.zoomIn({ duration: 200 })} className="grid h-9 w-9 place-items-center rounded-full hover:bg-canvas">
          <Plus size={16} weight="bold" />
        </button>
      </Tip>
      <Tip label="Zoom out" side="right">
        <button aria-label="Zoom out" onClick={() => rf.zoomOut({ duration: 200 })} className="grid h-9 w-9 place-items-center rounded-full hover:bg-canvas">
          <Minus size={16} weight="bold" />
        </button>
      </Tip>
      <Tip label="Fit view" side="right">
        <button aria-label="Fit view" onClick={() => rf.fitView({ duration: 400, padding: 0.15 })} className="grid h-9 w-9 place-items-center rounded-full hover:bg-canvas">
          <CornersOut size={16} weight="bold" />
        </button>
      </Tip>
    </div>
  );
}

function RelationPicker({ connection, onClose, onPick }: { connection: Connection | null; onClose: () => void; onPick: (r: Relation, reason?: string) => void }) {
  const [rel, setRel] = useState<Relation>("supports");
  const [reason, setReason] = useState("");
  const nodes = useGraphStore((s) => s.nodes);
  const src = nodes.find((n) => n.id === connection?.source)?.data.node.title;
  const tgt = nodes.find((n) => n.id === connection?.target)?.data.node.title;
  const user = useAuthStore((s) => s.user);
  return (
    <Modal
      open={!!connection}
      onOpenChange={(o) => !o && onClose()}
      title="Choose a relationship"
      description={
        <>
          <strong className="text-ink">{src}</strong> → <strong className="text-ink">{tgt}</strong>
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { onPick(rel, reason.trim() || undefined); setReason(""); }}>
            Connect
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {USER_SELECTABLE_RELATIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRel(r)}
            className={cn("rounded-2xl border-2 px-3 py-2 text-left transition", rel === r ? "border-ink bg-lavender-soft shadow-pop" : "border-transparent bg-white shadow-clay-sm hover:-translate-y-0.5")}
          >
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <span className="h-2 w-2 rounded-full" style={{ background: RELATIONS[r].stroke }} /> {RELATIONS[r].label}
            </span>
            <span className="text-[11px] text-muted">{RELATIONS[r].description}</span>
          </button>
        ))}
      </div>
      <label className="mt-4 block text-[13px] font-bold text-ink-soft" htmlFor="rel-reason">
        Reason <span className="font-medium text-faint">(optional, shown in “Why are these connected?”)</span>
      </label>
      <input
        id="rel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`Connected by ${user?.name ?? "you"}.`}
        className="mt-1.5 h-11 w-full rounded-2xl border-2 border-transparent bg-white px-4 text-sm shadow-clay-sm outline-none focus:border-purple"
      />
    </Modal>
  );
}
