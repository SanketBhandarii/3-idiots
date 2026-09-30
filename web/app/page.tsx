"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Play,
  Lightning,
  EnvelopeSimple,
  Circle,
  Graph,
  Robot,
  Article,
  FileText,
  Brain,
  TreeStructure,
  Warning,
} from "@phosphor-icons/react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/lib/toast";

/* ─── Animated connection graph hero ─── */

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
  from: string;
  to: string;
  delay: number;
}

const NODES: GraphNode[] = [
  { id: "n1", x: 50,  y: 30,  label: "Med-PaLM 2",       icon: "article", color: "#a86f00", bg: "#fef3d6", delay: 0 },
  { id: "n2", x: 220, y: 8,   label: "Clinical NLP",      icon: "brain",   color: "#5a3dd4", bg: "#ece5fe", delay: 0.3 },
  { id: "n3", x: 180, y: 110, label: "RAG for EHR",       icon: "file",    color: "#3f8a2e", bg: "#e8f4dc", delay: 0.6 },
  { id: "n4", x: 10,  y: 140, label: "Hallucination Risk", icon: "warning", color: "#c4502f", bg: "#fde3d9", delay: 0.9 },
  { id: "n5", x: 300, y: 75,  label: "FDA SaMD 2026",     icon: "tree",    color: "#7b5cf0", bg: "#ece5fe", delay: 1.2 },
  { id: "n6", x: 120, y: 215, label: "Vector DBs",        icon: "brain",   color: "#a86f00", bg: "#fef3d6", delay: 1.5 },
  { id: "n7", x: 280, y: 185, label: "LLM Regulation",    icon: "file",    color: "#c9544f", bg: "#fde4e2", delay: 1.8 },
];

const EDGES: GraphEdge[] = [
  { from: "n1", to: "n2", delay: 0.5 },
  { from: "n1", to: "n3", delay: 0.8 },
  { from: "n1", to: "n4", delay: 1.1 },
  { from: "n2", to: "n5", delay: 1.4 },
  { from: "n3", to: "n6", delay: 1.7 },
  { from: "n5", to: "n7", delay: 2.0 },
  { from: "n4", to: "n6", delay: 2.3 },
  { from: "n6", to: "n7", delay: 2.6 },
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

function AnimatedGraph() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));
  // Node center offsets (half of node width ~70, height ~32)
  const cx = (n: GraphNode) => n.x + 70;
  const cy = (n: GraphNode) => n.y + 20;

  return (
    <div ref={ref} className="relative h-[300px] w-[400px]" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      {/* SVG Edges */}
      <svg className="absolute inset-0 h-full w-full" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c6b5f6" />
            <stop offset="100%" stopColor="#d0e8ba" />
          </linearGradient>
        </defs>
        {EDGES.map((e, i) => {
          const a = nodeMap[e.from]!;
          const b = nodeMap[e.to]!;
          const x1 = cx(a), y1 = cy(a), x2 = cx(b), y2 = cy(b);
          const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="url(#edge-grad)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={len}
              strokeDashoffset={len}
              style={{
                animation: visible ? `draw-edge 0.8s ease forwards ${e.delay}s` : "none",
              }}
            />
          );
        })}
      </svg>

      {/* Nodes */}
      {NODES.map((n) => (
        <div
          key={n.id}
          className="absolute flex items-center gap-1.5 rounded-xl border border-[#e8e2d6] bg-white px-2.5 py-1.5 shadow-sm cursor-default select-none"
          style={{
            left: n.x,
            top: n.y,
            opacity: 0,
            transform: "scale(0.7) translateY(8px)",
            animation: visible ? `pop-node 0.5s ease forwards ${n.delay}s, float-node 4s ease-in-out ${n.delay + 1}s infinite` : "none",
          }}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: n.bg, color: n.color }}>
            <NodeIcon type={n.icon} />
          </span>
          <span className="text-[10px] font-bold text-[#1c1b2b] whitespace-nowrap">{n.label}</span>
        </div>
      ))}

      {/* Pulsing "connection found" dots on edges */}
      {EDGES.slice(0, 4).map((e, i) => {
        const a = nodeMap[e.from]!;
        const b = nodeMap[e.to]!;
        const mx = (cx(a) + cx(b)) / 2;
        const my = (cy(a) + cy(b)) / 2;
        return (
          <div
            key={`dot-${i}`}
            className="absolute h-2 w-2 rounded-full bg-[#7b5cf0]"
            style={{
              left: mx - 4,
              top: my - 4,
              opacity: 0,
              animation: visible ? `pulse-dot 2s ease-in-out ${e.delay + 0.8}s infinite` : "none",
            }}
          />
        );
      })}

      {/* "Agent synthesizing" badge */}
      <div
        className="absolute flex items-center gap-1.5 rounded-full border border-[#7b5cf0]/30 bg-[#ece5fe] px-2.5 py-1 shadow-sm"
        style={{
          left: 120,
          bottom: 10,
          opacity: 0,
          animation: visible ? "pop-node 0.5s ease forwards 2.8s" : "none",
        }}
      >
        <Robot size={13} weight="fill" className="text-[#5a3dd4] animate-bounce" />
        <span className="text-[10px] font-bold text-[#5a3dd4]">Agent 3 linking…</span>
      </div>
    </div>
  );
}

/* ─── Page ─── */

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

      {/* CSS keyframes for graph animations */}
      <style>{`
        @keyframes draw-edge {
          to { stroke-dashoffset: 0; }
        }
        @keyframes pop-node {
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes float-node {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 0.7; transform: scale(1.5); }
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
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-4 pb-16 sm:px-8 lg:pt-8 lg:pb-20">
        <div className="flex items-center justify-between gap-8">

          {/* Left: text */}
          <div className="max-w-xl shrink-0 space-y-5">
            {/* NEW pill */}
            <div className="inline-flex items-center gap-2.5 rounded-full border-2 border-[#1c1b2b] bg-white px-3 py-1.5">
              <span className="rounded-full bg-[#f08a6c] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">NEW</span>
              <span className="text-xs font-semibold text-[#1c1b2b]">AI Research Agent, watch connections appear live</span>
            </div>

            {/* Headline */}
            <h1 className="font-display text-[44px] sm:text-[56px] lg:text-[64px] font-black leading-[1.04] tracking-tight text-[#1c1b2b]">
              Plan your<br />
              own research.<br />
              <span className="text-[#1c1b2b]">We handle</span><br />
              <span className="relative inline-block">
                <span className="relative z-10">the connections.</span>
                <span className="absolute left-0 bottom-1 h-3.5 sm:h-4 w-full -rotate-1 bg-[#fad47f] z-0 rounded-sm" />
              </span>
            </h1>

            {/* CTAs */}
            <div className="flex items-center gap-3 pt-1">
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

            {/* Benefits */}
            <div className="flex items-center gap-6 pt-1 text-[13px] font-semibold text-[#3a3850]">
              <span className="flex items-center gap-1.5"><Lightning size={14} weight="fill" className="text-[#fad47f]" /> Tabs to nodes in seconds</span>
              <span className="flex items-center gap-1.5"><EnvelopeSimple size={14} weight="bold" className="text-[#23864b]" /> Instant session report</span>
              <span className="flex items-center gap-1.5"><Circle size={8} weight="fill" className="text-[#7b5cf0]" /> Conflict radar</span>
            </div>
          </div>

          {/* Right: Animated connection graph */}
          <div className="hidden lg:flex items-center justify-center relative">
            {/* Decorative blobs */}
            <div className="absolute -top-12 -left-14 h-48 w-40 rounded-[50px] bg-[#c6b5f6]/30 -rotate-12 -z-10 pointer-events-none" />
            <div className="absolute -bottom-10 left-0 h-36 w-36 rounded-full bg-[#d0e8ba]/40 -z-10 pointer-events-none" />

            <AnimatedGraph />
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
