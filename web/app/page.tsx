"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowRight,
  Play,
  Graph,
  Robot,
  Article,
  FileText,
  Brain,
  TreeStructure,
  Warning,
  Globe,
  Sparkle,
} from "@phosphor-icons/react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/lib/toast";

/* ─── Types & Data ─── */

interface WebTab {
  id: string;
  x: number;
  y: number;
  url: string;
  title: string;
  badge: string;
  badgeBg: string;
  badgeColor: string;
}

interface GraphNode {
  id: string;
  x: number;
  y: number;
  label: string;
  icon: "article" | "file" | "brain" | "tree" | "warning";
  color: string;
  bg: string;
  delay: number;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  isConflict?: boolean;
  isTabBeam?: boolean;
  delay: number;
}

const TABS: WebTab[] = [
  {
    id: "tab-arxiv",
    x: 15,
    y: 8,
    url: "arxiv.org/abs/2401.0945",
    title: "Med-PaLM 2 Clinical Benchmarks",
    badge: "Tab Synced",
    badgeBg: "bg-[#e8f4dc]",
    badgeColor: "text-[#3f8a2e]",
  },
  {
    id: "tab-fda",
    x: 285,
    y: 8,
    url: "fda.gov/medical-devices/samd",
    title: "FDA SaMD 2026 AI Guidelines",
    badge: "Tab Synced",
    badgeBg: "bg-[#ece5fe]",
    badgeColor: "text-[#5a3dd4]",
  },
];

const NODES: GraphNode[] = [
  {
    id: "n1",
    x: 40,
    y: 95,
    label: "Med-PaLM 2",
    icon: "article",
    color: "#a86f00",
    bg: "#fef3d6",
    delay: 0.2,
  },
  {
    id: "n2",
    x: 195,
    y: 80,
    label: "Clinical NLP",
    icon: "brain",
    color: "#5a3dd4",
    bg: "#ece5fe",
    delay: 0.4,
  },
  {
    id: "n5",
    x: 345,
    y: 95,
    label: "FDA SaMD 2026",
    icon: "tree",
    color: "#7b5cf0",
    bg: "#ece5fe",
    delay: 0.6,
  },
  {
    id: "n3",
    x: 170,
    y: 165,
    label: "RAG for EHR",
    icon: "file",
    color: "#3f8a2e",
    bg: "#e8f4dc",
    delay: 0.8,
  },
  {
    id: "n4",
    x: 10,
    y: 200,
    label: "Hallucination Risk",
    icon: "warning",
    color: "#c4502f",
    bg: "#fde3d9",
    delay: 1.0,
  },
  {
    id: "n6",
    x: 145,
    y: 250,
    label: "Vector DBs",
    icon: "brain",
    color: "#a86f00",
    bg: "#fef3d6",
    delay: 1.2,
  },
  {
    id: "n7",
    x: 335,
    y: 205,
    label: "LLM Regulation",
    icon: "file",
    color: "#c9544f",
    bg: "#fde4e2",
    delay: 1.4,
  },
];

const EDGES: GraphEdge[] = [
  { id: "e-tab1", from: "tab-arxiv", to: "n1", isTabBeam: true, label: "extracted", delay: 0.3 },
  { id: "e-tab2", from: "tab-fda", to: "n5", isTabBeam: true, label: "extracted", delay: 0.7 },
  { id: "e1", from: "n1", to: "n2", label: "cites", delay: 0.5 },
  { id: "e-conflict", from: "n1", to: "n4", isConflict: true, label: "⚠️ Contradiction", delay: 1.1 },
  { id: "e2", from: "n2", to: "n3", label: "synthesizes", delay: 0.9 },
  { id: "e3", from: "n2", to: "n5", delay: 0.8 },
  { id: "e4", from: "n3", to: "n6", delay: 1.3 },
  { id: "e5", from: "n4", to: "n6", label: "mitigates", delay: 1.4 },
  { id: "e6", from: "n5", to: "n7", label: "mandates", delay: 1.5 },
  { id: "e7", from: "n6", to: "n7", delay: 1.6 },
];

function NodeIcon({ type, size = 14 }: { type: GraphNode["icon"]; size?: number }) {
  switch (type) {
    case "article": return <Article size={size} weight="duotone" />;
    case "file":    return <FileText size={size} weight="duotone" />;
    case "brain":   return <Brain size={size} weight="duotone" />;
    case "tree":    return <TreeStructure size={size} weight="duotone" />;
    case "warning": return <Warning size={size} weight="fill" />;
  }
}

/* ─── Animated Free-Floating Connection Graph (No Outer Box) ─── */

function AnimatedFreeGraph() {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(t);
  }, []);

  // Compute centers
  const getCenter = (id: string): { x: number; y: number } => {
    const tab = TABS.find((t) => t.id === id);
    if (tab) {
      return { x: tab.x + 95, y: tab.y + 36 };
    }
    const node = NODES.find((n) => n.id === id);
    if (node) {
      return { x: node.x + 65, y: node.y + 18 };
    }
    return { x: 0, y: 0 };
  };

  return (
    <div
      ref={containerRef}
      className="relative h-[340px] w-[500px] select-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}
    >
      {/* SVG Connecting Lines with Traveling Light Packets */}
      <svg className="absolute inset-0 h-full w-full pointer-events-none" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="edge-default" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c6b5f6" />
            <stop offset="100%" stopColor="#7b5cf0" />
          </linearGradient>
          <linearGradient id="edge-tab" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fad47f" />
            <stop offset="100%" stopColor="#a86f00" />
          </linearGradient>
          <linearGradient id="edge-conflict" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f08a6c" />
            <stop offset="100%" stopColor="#c4502f" />
          </linearGradient>
        </defs>

        {EDGES.map((e) => {
          const p1 = getCenter(e.from);
          const p2 = getCenter(e.to);
          const pathD = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
          const isConflict = e.isConflict;
          const isTab = e.isTabBeam;

          return (
            <g key={e.id}>
              {/* Edge line */}
              <path
                id={`path-${e.id}`}
                d={pathD}
                fill="none"
                stroke={isConflict ? "url(#edge-conflict)" : isTab ? "url(#edge-tab)" : "url(#edge-default)"}
                strokeWidth={isConflict ? 2.5 : isTab ? 2 : 1.75}
                strokeDasharray={isConflict ? "5,4" : isTab ? "4,4" : undefined}
                strokeOpacity={isConflict ? 0.9 : 0.65}
              />

              {/* Traveling light particle */}
              {visible && (
                <circle
                  r={isConflict ? 3.5 : 3}
                  fill={isConflict ? "#c4502f" : isTab ? "#a86f00" : "#7b5cf0"}
                >
                  <animateMotion
                    dur={isConflict ? "2.2s" : isTab ? "2.8s" : "3.2s"}
                    repeatCount="indefinite"
                    path={pathD}
                    begin={`${e.delay}s`}
                  />
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating Web Page Tabs */}
      {TABS.map((tab) => (
        <div
          key={tab.id}
          className="absolute flex items-center gap-2 rounded-xl border border-[#e8e2d6] bg-white px-2.5 py-1.5 shadow-sm transition hover:shadow cursor-default"
          style={{
            left: tab.x,
            top: tab.y,
            width: "200px",
            animation: visible ? "pop-node 0.5s ease forwards" : "none",
          }}
        >
          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#f5f1e8] text-[#1c1b2b]">
            <Globe size={13} weight="bold" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <p className="truncate text-[9px] font-mono text-[#9794ab]">{tab.url}</p>
              <span className={`shrink-0 rounded px-1 text-[8px] font-bold ${tab.badgeBg} ${tab.badgeColor}`}>
                {tab.badge}
              </span>
            </div>
            <h4 className="truncate text-[10px] font-bold text-[#1c1b2b]">{tab.title}</h4>
          </div>
        </div>
      ))}

      {/* Edge relationship semantic labels */}
      {EDGES.filter((e) => e.label).map((e) => {
        const p1 = getCenter(e.from);
        const p2 = getCenter(e.to);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;

        return (
          <div
            key={`label-${e.id}`}
            className={`absolute pointer-events-none rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight shadow-xs ${
              e.isConflict
                ? "bg-[#fde3d9] text-[#c4502f] border border-[#f08a6c]/50 animate-pulse"
                : "bg-white/95 text-[#625f78] border border-[#e8e2d6]"
            }`}
            style={{
              left: mx,
              top: my,
              transform: "translate(-50%, -50%)",
              zIndex: 10,
            }}
          >
            {e.label}
          </div>
        );
      })}

      {/* Floating Nodes */}
      {NODES.map((n) => {
        const isConflict = n.id === "n4";

        return (
          <motion.div
            key={n.id}
            drag
            dragConstraints={containerRef}
            dragElastic={0.15}
            className={`absolute flex items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1.5 shadow-sm cursor-grab active:cursor-grabbing transition-all select-none ${
              isConflict
                ? "border-[#f08a6c] hover:border-[#c4502f] z-10"
                : "border-[#e8e2d6] hover:border-[#1c1b2b]/40 z-10"
            }`}
            style={{
              left: n.x,
              top: n.y,
              opacity: 0,
              animation: visible
                ? `pop-node 0.4s ease forwards ${n.delay}s, float-node 4.5s ease-in-out ${n.delay + 1}s infinite`
                : "none",
            }}
            whileHover={{ scale: 1.06 }}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
              style={{ backgroundColor: n.bg, color: n.color }}
            >
              <NodeIcon type={n.icon} />
            </span>
            <span className="text-[10px] font-bold text-[#1c1b2b] whitespace-nowrap">{n.label}</span>
          </motion.div>
        );
      })}

      {/* Subtle Floating Agent Pill */}
      <div
        className="absolute bottom-1 left-4 flex items-center gap-1.5 rounded-full border border-[#7b5cf0]/30 bg-white/90 backdrop-blur-xs px-2.5 py-1 shadow-xs"
        style={{
          opacity: 0,
          animation: visible ? "pop-node 0.5s ease forwards 1.6s" : "none",
        }}
      >
        <Robot size={12} weight="fill" className="text-[#5a3dd4] animate-bounce" />
        <span className="text-[9px] font-bold text-[#5a3dd4]">Agent 3 synthesizing connections…</span>
      </div>

      {/* Floating Conflict Radar pill */}
      <div className="absolute right-4 top-1 z-30 pointer-events-none">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#f08a6c]/40 bg-[#fde3d9] px-2 py-0.5 text-[9px] font-black text-[#c4502f] shadow-xs">
          <Sparkle size={10} weight="fill" className="text-[#f08a6c] animate-spin" />
          Conflict Radar Active
        </span>
      </div>
    </div>
  );
}

/* ─── Main Landing Page ─── */

export default function LandingPage() {
  const router = useRouter();
  const { status, user, bootstrap, login } = useAuthStore();
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      const ok = await login({ email: "demo@researchmap.app", password: "demo1234" });
      if (ok) {
        toast.success("Welcome!", { description: "Opening workspace..." });
        router.push("/workspaces");
      } else {
        router.push("/login");
      }
    } catch {
      router.push("/login");
    } finally {
      setDemoLoading(false);
    }
  };

  const isLoggedIn = status === "authenticated" && user;

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1c1b2b] selection:bg-[#fad47f] selection:text-[#1c1b2b] overflow-x-hidden font-sans">

      {/* CSS keyframes for animations */}
      <style>{`
        @keyframes pop-node {
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes float-node {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

      {/* ─── Navigation ─── */}
      <nav className="relative z-30 mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 -rotate-6 place-items-center rounded-[30%] border-2 border-[#1c1b2b] bg-[#fad47f] shadow-[2px_2px_0_#1c1b2b]">
            <Graph size={18} weight="duotone" className="text-[#1c1b2b]" />
          </div>
          <span className="font-display text-[22px] font-black tracking-tight text-[#1c1b2b]">Research Map</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-[15px] font-semibold text-[#1c1b2b]/70">
          <a href="#how-it-works" className="hover:text-[#1c1b2b] transition">How it works</a>
          <a href="#features" className="hover:text-[#1c1b2b] transition">Features</a>
          <a href="#agents" className="hover:text-[#1c1b2b] transition">AI Agents</a>
          <a href="#workspaces" className="hover:text-[#1c1b2b] transition">Workspaces</a>
        </div>

        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <>
              <Link href="/workspaces" className="text-sm font-bold text-[#1c1b2b] hover:text-[#7b5cf0] transition">Log out</Link>
              <Link href="/workspaces" className="inline-flex items-center gap-2 rounded-full bg-[#1c1b2b] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#3a3850] transition">
                <ArrowRight size={14} weight="bold" /> Open app
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-bold text-[#1c1b2b] hover:text-[#7b5cf0] transition">Log in</Link>
              <button
                onClick={handleDemoLogin}
                disabled={demoLoading}
                className="inline-flex items-center gap-2 rounded-full bg-[#1c1b2b] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#3a3850] transition cursor-pointer"
              >
                <ArrowRight size={14} weight="bold" /> {demoLoading ? "Opening…" : "Get started"}
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-6 pb-16 sm:px-8 lg:pt-10 lg:pb-20">
        <div className="flex flex-col lg:flex-row items-center justify-start lg:gap-8 xl:gap-14">

          {/* Left: Clean Headline & CTAs (No distracting top/bottom pill rows) */}
          <div className="max-w-xl shrink-0 space-y-6">
            <h1 className="font-display text-[46px] sm:text-[58px] lg:text-[64px] font-black leading-[1.04] tracking-tight text-[#1c1b2b]">
              Plan your<br />
              own research.<br />
              <span className="text-[#1c1b2b]">We handle</span><br />
              <span className="relative inline-block">
                <span className="relative z-10">the connections.</span>
                <span className="absolute left-0 bottom-1 h-3.5 sm:h-4 w-full -rotate-1 bg-[#fad47f] z-0 rounded-sm" />
              </span>
            </h1>

            {/* CTAs */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleDemoLogin}
                disabled={demoLoading}
                className="inline-flex items-center gap-2.5 rounded-full bg-[#1c1b2b] px-7 py-3.5 text-sm font-bold text-white hover:bg-[#3a3850] transition cursor-pointer"
              >
                <ArrowRight size={16} weight="bold" /> {demoLoading ? "Opening…" : "Start researching"}
              </button>
              <Link
                href="/workspaces"
                className="inline-flex items-center gap-2.5 rounded-full border-2 border-[#1c1b2b] bg-white px-7 py-3.5 text-sm font-bold text-[#1c1b2b] hover:bg-[#f5f1e8] transition"
              >
                <Play size={14} weight="fill" /> Explore demo
              </Link>
            </div>
          </div>

          {/* Right: Free-floating Connection Graph (NO box container, directly in the open space) */}
          <div className="hidden lg:flex items-center justify-center relative lg:-ml-2 xl:-ml-6 shrink-0">
            {/* Soft decorative background shapes */}
            <div className="absolute -top-10 -left-12 h-52 w-44 rounded-[50px] bg-[#c6b5f6]/30 -rotate-12 -z-10 pointer-events-none" />
            <div className="absolute -bottom-8 right-4 h-40 w-40 rounded-full bg-[#d0e8ba]/40 -z-10 pointer-events-none" />

            <AnimatedFreeGraph />
          </div>

        </div>
      </section>

      {/* ─── How it Works ─── */}
      <section id="how-it-works" className="relative z-10 border-t border-[#e8e2d6] bg-white/60 py-16 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 sm:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-2 mb-12">
            <span className="rounded-full bg-[#ece5fe] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#5a3dd4]">Intelligent Synthesis</span>
            <h2 className="font-display text-3xl sm:text-4xl font-black text-[#1c1b2b]">Browse normally. Your graph builds itself.</h2>
            <p className="text-sm text-[#625f78] font-medium">Three autonomous agents extract key findings, detect contradictions, and build knowledge maps in real-time.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { n: "1", bg: "bg-[#fef3d6]", tc: "text-[#a86f00]", title: "Turn Tracking On", desc: "Browse as usual. Research pages you visit are captured automatically with live tab previews." },
              { n: "2", bg: "bg-[#fde3d9]", tc: "text-[#c4502f]", title: "3 AI Agents Pipeline", desc: "Agent 1 filters noise. Agent 2 extracts concepts. Agent 3 links topics and surfaces conflicts." },
              { n: "3", bg: "bg-[#e8f4dc]", tc: "text-[#3f8a2e]", title: "Instant Reports", desc: "Generate executive summaries, markdown notes, and branch comparisons with one click." },
            ].map((c) => (
              <div key={c.n} className="rounded-3xl border-2 border-[#1c1b2b] bg-white p-5 shadow-pop hover:-translate-y-0.5 transition">
                <span className={`grid h-10 w-10 place-items-center rounded-2xl border-2 border-[#1c1b2b] ${c.bg} ${c.tc} font-display font-black text-base`}>{c.n}</span>
                <h3 className="mt-3 font-display text-base font-black text-[#1c1b2b]">{c.title}</h3>
                <p className="mt-1.5 text-xs text-[#625f78] leading-relaxed font-medium">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-[#e8e2d6] bg-white py-6 text-center text-xs font-semibold text-[#625f78]">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-6 sm:px-8">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-[#1c1b2b] text-white"><Graph size={12} weight="bold" /></div>
            <span className="font-display font-black text-sm text-[#1c1b2b]">Research Map</span>
          </div>
          <p>© 2026 Research Map · Visual Research & Browser Tab Manager</p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-[#1c1b2b]">Login</Link>
            <Link href="/workspaces" className="hover:text-[#1c1b2b]">Workspaces</Link>
            <Link href="/settings" className="hover:text-[#1c1b2b]">Settings</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
