"use client";
/** Split authentication layout (DESIGN.md §6.2.3) with a product billboard. */
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Logo } from "@/components/shell/Logo";
import { Kicker } from "@/components/ui/primitives";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden border-r-2 border-ink bg-gradient-to-br from-[#efe9ff] via-[#e8ebff] to-[#ddefff] lg:block">
        <div className="relative flex h-full flex-col justify-between p-10">
          <Logo href="/login" />
          <div>
            <Kicker>Visual research workspace</Kicker>
            <h1 className="mt-5 max-w-md text-balance text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.03em] text-ink">
              Your tabs become a{" "}
              <span className="relative inline-block">
                <span className="relative z-10">knowledge map</span>
                <span className="absolute inset-x-0 bottom-1 z-0 h-4 -rotate-1 rounded-full bg-sun" aria-hidden />
              </span>
              .
            </h1>
            <MiniMapVisual />
          </div>
          <div className="relative h-56">
            <motion.div
              initial={{ opacity: 0, y: 20, rotate: -2 }}
              animate={{ opacity: 1, y: 0, rotate: -2 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 120, damping: 20 }}
              className="absolute left-0 top-0 w-72 rounded-[24px] border-2 border-ink bg-white p-4 shadow-pop-lg"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-purple-deep">Why are these connected?</p>
              <p className="mt-1.5 text-sm font-semibold text-ink">“Vector databases store and search embeddings in RAG pipelines.”</p>
              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-success">
                <span className="h-2 w-16 overflow-hidden rounded-full bg-ink/10">
                  <span className="block h-full w-[87%] rounded-full bg-success" />
                </span>
                87% confidence
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20, rotate: 5 }}
              animate={{ opacity: 1, y: 0, rotate: 5 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 120, damping: 20 }}
              className="absolute left-64 top-20 w-60 rounded-[24px] border-2 border-ink bg-sun p-4 shadow-pop-lg"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sun-deep">Research Radar</p>
              <p className="mt-1.5 text-sm font-semibold text-ink">Regulation appears under-covered in your workspace.</p>
            </motion.div>
          </div>
        </div>
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-6 lg:pt-28">
        <div className="lg:hidden">
          <Logo href="/login" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          className="mx-auto my-auto w-full max-w-md py-8"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}

/** Small knowledge-graph illustration: a browser page becomes a node and connects to related research. */
function MiniMapVisual() {
  // Widths leave room for the bold display font (~8.5px per character at 12px) plus the dot and padding.
  const nodes = [
    { x: 0, y: 52, w: 128, label: "Browser tab", fill: "#ffffff" },
    { x: 162, y: 10, w: 112, label: "Page node", fill: "#fef3d6" },
    { x: 162, y: 96, w: 112, label: "Paper", fill: "#d0e8ba" },
    { x: 310, y: 52, w: 88, label: "Topic", fill: "#c6b5f6" },
  ];
  const mid = (i: number) => ({ x: nodes[i]!.x + nodes[i]!.w / 2, y: nodes[i]!.y + 15 });
  const links: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [1, 2]];
  return (
    <motion.svg
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5 }}
      viewBox="0 0 400 140"
      className="mt-8 w-full max-w-md overflow-visible"
      role="img"
      aria-label="A browser tab becoming connected research nodes"
    >
      {links.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={mid(a).x} y1={mid(a).y} x2={mid(b).x} y2={mid(b).y} stroke="#1c1b2b" strokeWidth={2} strokeDasharray={a === 1 && b === 2 ? "5 5" : undefined} />
      ))}
      {nodes.map((n) => (
        <g key={n.label}>
          <rect x={n.x + 3} y={n.y + 3} width={n.w} height={30} rx={15} fill="#1c1b2b" />
          <rect x={n.x} y={n.y} width={n.w} height={30} rx={15} fill={n.fill} stroke="#1c1b2b" strokeWidth={2} />
          <circle cx={n.x + 15} cy={n.y + 15} r={4} fill="#7b5cf0" />
          <text x={n.x + 25} y={n.y + 19.5} fontSize={12} fontWeight={700} fill="#1c1b2b">{n.label}</text>
        </g>
      ))}
    </motion.svg>
  );
}
