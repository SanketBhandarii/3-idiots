"use client";
/** Split authentication layout (DESIGN.md §6.2.3) with a product billboard. */
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ChatCircleDots, Lightning, Path, ShieldCheck } from "@phosphor-icons/react";
import { Logo } from "@/components/shell/Logo";
import { Kicker } from "@/components/ui/primitives";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden overflow-hidden border-r-2 border-ink bg-lavender lg:block">
        <div className="bg-speed absolute inset-0" aria-hidden />
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
            <p className="mt-4 max-w-md text-[17px] font-medium text-ink-soft">
              Press Start Tracking and browse normally. Pages appear as nodes, group into topics and connect — and every
              connection explains <em>why</em>.
            </p>
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
          <ul className="grid grid-cols-2 gap-3 text-sm font-semibold text-ink">
            {[
              [Lightning, "Builds itself while you browse"],
              [Path, "Explainable connections"],
              [ChatCircleDots, "Notes, tags & team branches"],
              [ShieldCheck, "Tracking is opt-in"],
            ].map(([I, t]) => {
              const Icon = I as typeof Lightning;
              return (
                <li key={t as string} className="flex items-center gap-2">
                  <Icon size={18} weight="duotone" /> {t as string}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-6">
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
