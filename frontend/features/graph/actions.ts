"use client";
/**
 * Graph mutations. Components call these; these call the API layer and update stores.
 * Optimistic where it makes the canvas feel instant; server echo over WebSocket is idempotent.
 */
import dagre from "@dagrejs/dagre";
import type {
  AnnotationKind,
  CategoryKind,
  NodeType,
  Relation,
  ResearchNode,
  UpdateNodeRequest,
} from "@/types/api";
import { annotationApi, categoryApi, edgeApi, nodeApi, tagApi, workspaceApi } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";
import { NODE_SIZE, sizeOf, TOPIC_PADDING } from "@/lib/graph/layout";
import { RELATIONS } from "@/lib/domain/meta";
import { toast } from "@/lib/toast";
import { getNode, useGraphStore, type RFNode } from "@/stores/graph";
import { useUiStore } from "@/stores/ui";

const ws = () => {
  const id = useGraphStore.getState().workspaceId;
  if (!id) throw new Error("No workspace loaded");
  return id;
};

function handleConflict(e: unknown) {
  if (e instanceof ApiError && e.code === "conflict" && e.details && typeof e.details === "object") {
    useGraphStore.getState().upsertNode(e.details as ResearchNode);
    toast.warning("Updated by someone else", { description: e.message });
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------- nodes */

export async function createNode(type: NodeType, position: { x: number; y: number }, extra: { title?: string; body?: string; parent_id?: string | null; source_node_ids?: string[] } = {}) {
  const defaults: Record<NodeType, string> = {
    page: "New page",
    question: "New question?",
    note: "New note",
    finding: "New finding",
    topic: "New topic",
  };
  try {
    const node = await nodeApi.create({
      workspace_id: ws(),
      type,
      title: extra.title ?? defaults[type],
      body: extra.body ?? (type === "note" ? "Write your note in **Markdown**…" : ""),
      x: position.x,
      y: position.y,
      parent_id: extra.parent_id ?? null,
      source_node_ids: extra.source_node_ids,
    });
    useGraphStore.getState().upsertNode(node);
    useUiStore.getState().selectNode(node.id);
    toast.success(`${type[0]!.toUpperCase()}${type.slice(1)} added`);
    return node;
  } catch (e) {
    toast.apiError(e);
    return null;
  }
}

export async function updateNode(id: string, patch: Omit<UpdateNodeRequest, "version">, opts: { silent?: boolean } = {}) {
  const node = getNode(id);
  if (!node) return null;
  useGraphStore.getState().upsertNode({ ...node, ...patch } as ResearchNode);
  try {
    const saved = await nodeApi.update(id, { ...patch, version: node.version });
    useGraphStore.getState().upsertNode(saved);
    if (!opts.silent) toast.success("Changes saved");
    return saved;
  } catch (e) {
    if (!handleConflict(e)) {
      useGraphStore.getState().upsertNode(node);
      toast.apiError(e);
    }
    return null;
  }
}

export async function deleteNodes(ids: string[]) {
  const nodes = ids.map(getNode).filter((n): n is ResearchNode => !!n);
  if (!nodes.length) return;
  const store = useGraphStore.getState();
  const edges = store.edges.filter((e) => ids.includes(e.source) || ids.includes(e.target));
  nodes.forEach((n) => store.removeNode(n.id));
  const ui = useUiStore.getState();
  if (ui.selectedNodeId && ids.includes(ui.selectedNodeId)) ui.selectNode(null);
  try {
    await Promise.all(nodes.map((n) => nodeApi.remove(n.id)));
    toast.success(nodes.length === 1 ? `Deleted “${nodes[0]!.title}”` : `Deleted ${nodes.length} nodes`, {
      action: {
        label: "Undo",
        onClick: async () => {
          for (const n of nodes) {
            const restored = await nodeApi.restore(n.id).catch(() => null);
            if (restored) useGraphStore.getState().upsertNode(restored);
          }
          edges.forEach((e) => e.data && useGraphStore.getState().upsertEdge(e.data.edge));
          toast.info("Restored");
        },
      },
    });
  } catch (e) {
    nodes.forEach((n) => useGraphStore.getState().upsertNode(n));
    toast.apiError(e);
  }
}

/** Called on drag stop. Detects dropping into / out of a topic group (locks the group, §14.3). */
export async function commitDrag(dragged: RFNode[], all: RFNode[]) {
  const topics = all.filter((n) => n.type === "topic" && !n.hidden);
  const absOf = (n: RFNode) => {
    const parent = n.parentId ? all.find((p) => p.id === n.parentId) : undefined;
    return parent ? { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y } : n.position;
  };
  const positions = dragged
    .filter((n) => n.type !== "topic" || true)
    .map((n) => {
      if (n.type === "topic") return { id: n.id, x: n.position.x, y: n.position.y };
      const abs = absOf(n);
      const size = sizeOf(n.type as NodeType);
      const cx = abs.x + size.w / 2;
      const cy = abs.y + 40;
      const target = topics.find((t) => {
        const w = (t.width ?? t.measured?.width ?? 0) as number;
        const h = (t.height ?? t.measured?.height ?? 0) as number;
        return cx > t.position.x && cx < t.position.x + w && cy > t.position.y && cy < t.position.y + h;
      });
      const newParent = target?.id ?? null;
      if (newParent !== (n.parentId ?? null)) {
        const rel = target ? { x: abs.x - target.position.x, y: abs.y - target.position.y } : abs;
        return { id: n.id, x: Math.round(rel.x), y: Math.round(rel.y), parent_id: newParent };
      }
      return { id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) };
    });
  const store = useGraphStore.getState();
  positions.forEach((p) => {
    const node = getNode(p.id);
    if (node) store.upsertNode({ ...node, x: p.x, y: p.y, position_locked: true, ...("parent_id" in p ? { parent_id: p.parent_id ?? null, group_locked: true } : {}) });
  });
  const moved = positions.find((p) => "parent_id" in p);
  try {
    await nodeApi.savePositions({ positions });
    if (moved) {
      const t = moved.parent_id ? getNode(moved.parent_id)?.title : null;
      toast.info(t ? `Moved into “${t}”` : "Moved out of group", { description: "Your placement is locked — AI won't move it." });
    }
  } catch (e) {
    toast.apiError(e);
  }
}

export async function mergeDuplicate(id: string, intoId: string) {
  try {
    const n = await nodeApi.mergeDuplicate(id, intoId);
    useGraphStore.getState().removeNode(id);
    useGraphStore.getState().upsertNode(n);
    toast.success("Duplicates merged");
  } catch (e) {
    toast.apiError(e);
  }
}

/* ---------------------------------------------------------------- edges */

export async function connectNodes(source: string, target: string, relation: Relation, reason?: string) {
  try {
    const e = await edgeApi.create({ workspace_id: ws(), source_id: source, target_id: target, relation, reason });
    useGraphStore.getState().upsertEdge(e);
    toast.success("Connection added", { description: RELATIONS[relation].label });
    return e;
  } catch (err) {
    toast.apiError(err);
    return null;
  }
}

async function patchEdge(id: string, patch: { state?: "accepted" | "rejected"; relation?: Relation; reason?: string }, message: string) {
  const store = useGraphStore.getState();
  const edge = store.edges.find((e) => e.id === id)?.data?.edge;
  if (!edge) return;
  store.upsertEdge({ ...edge, ...patch, locked: true });
  try {
    const saved = await edgeApi.update(id, { ...patch, version: edge.version });
    useGraphStore.getState().upsertEdge(saved);
    toast.success(message, patch.state === "rejected" ? {
      description: "AI will not suggest this pair again.",
      action: { label: "Undo", onClick: () => void patchEdge(id, { state: "accepted" }, "Connection restored") },
    } : undefined);
  } catch (e) {
    useGraphStore.getState().upsertEdge(edge);
    toast.apiError(e);
  }
}
export const acceptEdge = (id: string) => patchEdge(id, { state: "accepted" }, "Connection accepted");
export const rejectEdge = (id: string) => {
  if (useUiStore.getState().selectedEdgeId === id) useUiStore.getState().selectEdge(null);
  return patchEdge(id, { state: "rejected" }, "Connection rejected");
};
export const changeRelation = (id: string, relation: Relation) => patchEdge(id, { relation }, `Changed to “${RELATIONS[relation].label}”`);
export const editReason = (id: string, reason: string) => patchEdge(id, { reason }, "Reason updated");
export async function deleteEdge(id: string) {
  useGraphStore.getState().removeEdge(id);
  useUiStore.getState().selectEdge(null);
  try {
    await edgeApi.remove(id);
    toast.success("Connection removed");
  } catch (e) {
    toast.apiError(e);
  }
}

/* ---------------------------------------------------------------- annotations */

export async function addAnnotation(nodeId: string, kind: AnnotationKind, body: string, extra: { quote?: string; parent_id?: string } = {}) {
  try {
    const a = await annotationApi.create(nodeId, { kind, body, ...extra });
    useGraphStore.getState().upsertAnnotation(a);
    toast.success(kind === "note" ? "Note saved" : kind === "highlight" ? "Highlight saved" : "Comment posted");
    return a;
  } catch (e) {
    toast.apiError(e);
    return null;
  }
}
export async function updateAnnotation(id: string, patch: { body?: string; resolved?: boolean }) {
  try {
    const a = await annotationApi.update(id, patch);
    useGraphStore.getState().upsertAnnotation(a);
    toast.success(patch.resolved !== undefined ? (patch.resolved ? "Marked resolved" : "Reopened") : "Saved");
  } catch (e) {
    toast.apiError(e);
  }
}
export async function deleteAnnotation(id: string) {
  const prev = useGraphStore.getState().annotations[id];
  useGraphStore.getState().removeAnnotation(id);
  try {
    await annotationApi.remove(id);
    toast.success("Deleted");
  } catch (e) {
    if (prev) useGraphStore.getState().upsertAnnotation(prev);
    toast.apiError(e);
  }
}

/* ---------------------------------------------------------------- tags & categories */

export async function setNodeTags(nodeId: string, tagIds: string[]) {
  const node = getNode(nodeId);
  if (!node) return;
  useGraphStore.getState().upsertNode({ ...node, tag_ids: tagIds });
  try {
    const saved = await tagApi.setNodeTags(nodeId, tagIds);
    useGraphStore.getState().upsertNode(saved);
  } catch (e) {
    useGraphStore.getState().upsertNode(node);
    toast.apiError(e);
  }
}
export async function addTagToNode(nodeId: string, name: string) {
  const node = getNode(nodeId);
  if (!node || !name.trim()) return;
  try {
    const tag = await tagApi.create(ws(), { name: name.trim() });
    const store = useGraphStore.getState();
    if (!store.tags.some((t) => t.id === tag.id)) store.setTags([...store.tags, tag]);
    if (!node.tag_ids.includes(tag.id)) await setNodeTags(nodeId, [...(getNode(nodeId)?.tag_ids ?? []), tag.id]);
    toast.success(`Tag “${tag.name}” added`);
  } catch (e) {
    toast.apiError(e);
  }
}
export async function createCategory(kind: CategoryKind, name: string, color: string) {
  try {
    const c = await categoryApi.create(ws(), { kind, name, color });
    const store = useGraphStore.getState();
    store.setCategories([...store.categories.filter((x) => x.id !== c.id), c]);
    toast.success(`Category “${c.name}” created`);
    return c;
  } catch (e) {
    toast.apiError(e);
    return null;
  }
}
export async function updateCategory(id: string, patch: { name?: string; color?: string }) {
  try {
    const c = await categoryApi.update(id, patch);
    const store = useGraphStore.getState();
    store.setCategories(store.categories.map((x) => (x.id === c.id ? c : x)));
    toast.success("Category updated");
  } catch (e) {
    toast.apiError(e);
  }
}

/* ---------------------------------------------------------------- organization */

export async function reorganizeWorkspace() {
  const id = ws();
  try {
    const r = await workspaceApi.reorganize(id);
    toast.ai("Workspace re-organized", {
      description: `${r.nodes_moved} nodes placed · ${r.topics_created} new topics. Locked items stayed put.`,
      action: r.undo_token
        ? {
            label: "Undo",
            onClick: () =>
              void workspaceApi
                .undoReorganize(id, r.undo_token!)
                .then(() => toast.info("Re-organize undone"))
                .catch(toast.apiError),
          }
        : undefined,
    });
  } catch (e) {
    toast.apiError(e);
  }
}

export type TreeDirection = "LR" | "TB";

/**
 * Tree layout (Tidy up, §14.5) in a horizontal (LR) or vertical (TB) direction:
 * 1) inside each topic group, children are laid out as a tree along their connections and the group is resized;
 * 2) top-level blocks (groups + loose nodes) are laid out as a tree.
 */
export async function layoutTree(dir: TreeDirection) {
  const store = useGraphStore.getState();
  const sizeOfNode = (n: RFNode) => ({
    w: (n.measured?.width ?? (n.type === "topic" ? 560 : sizeOf(n.type as NodeType).w)) as number,
    h: (n.measured?.height ?? (n.type === "topic" ? 320 : sizeOf(n.type as NodeType).h)) as number,
  });
  const visibleEdges = store.edges.filter((e) => !e.hidden);
  const childPositions: { id: string; x: number; y: number }[] = [];
  const topicSizes = new Map<string, { w: number; h: number }>();

  store.nodes
    .filter((t) => t.type === "topic" && !t.data.node.collapsed)
    .forEach((t) => {
      const kids = store.nodes.filter((n) => n.parentId === t.id);
      if (!kids.length) return;
      const g = new dagre.graphlib.Graph();
      g.setGraph({ rankdir: dir, nodesep: 24, ranksep: 48, marginx: 0, marginy: 0 });
      g.setDefaultEdgeLabel(() => ({}));
      kids.forEach((k) => {
        const s = sizeOfNode(k);
        g.setNode(k.id, { width: s.w, height: s.h });
      });
      visibleEdges.forEach((e) => g.hasNode(e.source) && g.hasNode(e.target) && g.setEdge(e.source, e.target));
      dagre.layout(g);
      const graph = g.graph();
      kids.forEach((k) => {
        const p = g.node(k.id);
        childPositions.push({ id: k.id, x: Math.round(p.x - p.width / 2 + TOPIC_PADDING.side), y: Math.round(p.y - p.height / 2 + TOPIC_PADDING.top) });
      });
      topicSizes.set(t.id, {
        w: Math.round((graph.width ?? 300) + TOPIC_PADDING.side * 2),
        h: Math.round((graph.height ?? 200) + TOPIC_PADDING.top + TOPIC_PADDING.bottom),
      });
    });

  // Top level
  const top = store.nodes.filter((n) => !n.parentId && !n.hidden);
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: 80, ranksep: 140 });
  g.setDefaultEdgeLabel(() => ({}));
  top.forEach((n) => {
    const s = topicSizes.get(n.id) ?? sizeOfNode(n);
    g.setNode(n.id, { width: s.w, height: s.h });
  });
  const topOf = (id: string) => store.nodes.find((x) => x.id === id)?.parentId ?? id;
  visibleEdges.forEach((e) => {
    const a = topOf(e.source);
    const b = topOf(e.target);
    if (a !== b && g.hasNode(a) && g.hasNode(b)) g.setEdge(a, b);
  });
  dagre.layout(g);
  const topPositions = top.map((n) => {
    const p = g.node(n.id);
    return { id: n.id, x: Math.round(p.x - p.width / 2), y: Math.round(p.y - p.height / 2) };
  });

  // Apply locally (instant), then persist
  [...childPositions, ...topPositions].forEach((p) => {
    const node = getNode(p.id);
    if (!node) return;
    const size = topicSizes.get(p.id);
    useGraphStore.getState().upsertNode({ ...node, x: p.x, y: p.y, ...(size ? { width: size.w, height: size.h } : {}) });
  });
  try {
    await Promise.all([
      nodeApi.savePositions({ positions: [...childPositions, ...topPositions] }),
      ...[...topicSizes.entries()].map(([id, s]) => {
        const n = getNode(id);
        return n ? nodeApi.update(id, { width: s.w, height: s.h, version: n.version }).catch(() => null) : null;
      }),
    ]);
    toast.success(dir === "LR" ? "Horizontal tree layout" : "Vertical tree layout");
  } catch (e) {
    toast.apiError(e);
  }
}

/** Tidy up: dagre layout of unlocked top-level nodes (§14.5). */
export async function tidyUp() {
  const store = useGraphStore.getState();
  const top = store.nodes.filter((n) => !n.parentId && !n.hidden);
  const movable = top.filter((n) => !n.data.node.position_locked || n.type === "topic");
  if (!movable.length) return toast.info("Nothing to tidy — every item is locked by you.");
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 70, ranksep: 120 });
  g.setDefaultEdgeLabel(() => ({}));
  top.forEach((n) => {
    const w = (n.width as number | undefined) ?? (n.type === "topic" ? 560 : NODE_SIZE.page.w);
    const h = (n.height as number | undefined) ?? (n.type === "topic" ? 320 : NODE_SIZE.page.h);
    g.setNode(n.id, { width: w, height: h });
  });
  const topOf = (id: string) => {
    const n = store.nodes.find((x) => x.id === id);
    return n?.parentId ?? id;
  };
  store.edges.forEach((e) => {
    if (e.hidden) return;
    const a = topOf(e.source);
    const b = topOf(e.target);
    if (a !== b && g.hasNode(a) && g.hasNode(b)) g.setEdge(a, b);
  });
  dagre.layout(g);
  const positions = movable.map((n) => {
    const p = g.node(n.id);
    return { id: n.id, x: Math.round(p.x - p.width / 2), y: Math.round(p.y - p.height / 2) };
  });
  positions.forEach((p) => {
    const node = getNode(p.id);
    if (node) store.upsertNode({ ...node, x: p.x, y: p.y });
  });
  try {
    await nodeApi.savePositions({ positions });
    toast.success("Tidied up", { description: "Locked items were not moved." });
  } catch (e) {
    toast.apiError(e);
  }
}
