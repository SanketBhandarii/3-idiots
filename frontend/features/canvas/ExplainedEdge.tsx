"use client";
/** Edge with a relation label chip. Suggested = dashed; weak (<70%) = thin dashed; contradicts = red. */
import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useStore, type EdgeProps } from "@xyflow/react";
import { Check } from "@phosphor-icons/react";
import { RELATIONS } from "@/lib/domain/meta";
import { cn } from "@/lib/utils/cn";
import type { RFEdge } from "@/stores/graph";
import { useUiStore } from "@/stores/ui";

export const ExplainedEdge = memo(function ExplainedEdge(props: EdgeProps<RFEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected } = props;
  const edge = data?.edge;
  const showLabel = useStore((s) => s.transform[2] > 0.45);
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!edge) return null;
  const meta = RELATIONS[edge.relation];
  const suggested = edge.state === "suggested";
  const weak = (edge.confidence ?? 1) < 0.7;
  const stroke = edge.relation === "contradicts" ? "#c93535" : meta.stroke;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={18}
        style={{
          stroke: selected ? "#7b5cf0" : stroke,
          strokeWidth: selected ? 3 : suggested && weak ? 1.4 : 2.2,
          strokeDasharray: suggested ? (weak ? "3 5" : "7 5") : undefined,
          opacity: meta.deterministic ? 0.55 : 1,
        }}
        markerEnd={`url(#arrow-${edge.relation === "contradicts" ? "red" : "grey"})`}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <button
            className={cn(
              "nodrag nopan absolute inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-[10px] font-bold shadow-soft transition hover:scale-105",
              selected ? "border-purple bg-purple text-white" : "border-ink/70 bg-white text-ink",
            )}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px,${ly}px)`, pointerEvents: "all" }}
            onClick={(e) => {
              e.stopPropagation();
              useUiStore.getState().selectEdge(id);
            }}
            aria-label={`${meta.label} — why are these connected?`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: stroke }} />
            {edge.label || meta.label}
            {edge.state === "accepted" && !meta.deterministic && <Check size={10} weight="bold" />}
            {suggested && edge.confidence != null && <span className="tabular text-muted">{Math.round(edge.confidence * 100)}%</span>}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const edgeTypes = { explained: ExplainedEdge };

export function EdgeMarkers() {
  return (
    <svg className="absolute h-0 w-0" aria-hidden>
      <defs>
        {[
          ["grey", "#9794ab"],
          ["red", "#c93535"],
        ].map(([k, c]) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
