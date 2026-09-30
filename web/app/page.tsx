"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Reorder } from "motion/react";
import {
  ArrowRight,
  Play,
  Article,
  Heart,
  Lightning,
  EnvelopeSimple,
  Circle,
  Graph,
  Warning,
  Lightbulb,
  FileText,
  ShieldWarning,
  Robot,
} from "@phosphor-icons/react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/lib/toast";

interface TileItem {
  id: string;
  time: string;
  title: string;
  status?: "at_risk";
  strikethrough?: boolean;
  borderColor: string;
  iconBg: string;
  iconType: "article" | "warning" | "lightbulb" | "shield" | "file";
}

const INITIAL_TILES: TileItem[] = [
  {
    id: "tile-1",
    time: "9:00",
    title: "Literature Review Setup",
    borderColor: "border-l-[#fad47f]",
    iconBg: "bg-[#fef3d6]",
    iconType: "article",
  },
  {
    id: "tile-2",
    time: "10:00",
    title: "Diagnostic Hallucination Claims",
    status: "at_risk",
    borderColor: "border-l-[#f08a6c]",
    iconBg: "bg-[#fde3d9]",
    iconType: "warning",
  },
  {
    id: "tile-3",
    time: "13:00",
    title: "RAG for EHR Systems",
    borderColor: "border-l-[#fad47f]",
    iconBg: "bg-[#fef3d6]",
    iconType: "lightbulb",
  },
  {
    id: "tile-4",
    time: "15:00",
    title: "Unverified Oncology Trial",
    status: "at_risk",
    strikethrough: true,
    borderColor: "border-l-[#d0e8ba]",
    iconBg: "bg-[#e8f4dc]",
    iconType: "shield",
  },
  {
    id: "tile-5",
    time: "18:00",
    title: "FDA SaMD 2026 Draft",
    borderColor: "border-l-[#f9cbc9]",
    iconBg: "bg-[#fde4e2]",
    iconType: "file",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { status, user, bootstrap, login } = useAuthStore();
  const [tiles, setTiles] = useState<TileItem[]>(INITIAL_TILES);
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

  const renderIcon = (type: TileItem["iconType"]) => {
    switch (type) {
      case "article": return <Article size={16} weight="duotone" className="text-[#a86f00]" />;
      case "warning": return <Warning size={16} weight="fill" className="text-[#c4502f]" />;
      case "lightbulb": return <Lightbulb size={16} weight="fill" className="text-[#a86f00]" />;
      case "shield": return <ShieldWarning size={16} weight="duotone" className="text-[#3f8a2e]" />;
      case "file": return <FileText size={16} weight="duotone" className="text-[#c9544f]" />;
    }
  };

  const isLoggedIn = status === "authenticated" && user;

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1c1b2b] selection:bg-[#fad47f] selection:text-[#1c1b2b] overflow-x-hidden font-sans">

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
        <div className="flex items-center justify-between gap-6">

          {/* Left: text */}
          <div className="max-w-xl shrink-0 space-y-5">
            {/* NEW pill */}
            <div className="inline-flex items-center gap-2.5 rounded-full border-2 border-[#1c1b2b] bg-white px-3 py-1.5">
              <span className="rounded-full bg-[#f08a6c] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">NEW</span>
              <span className="text-xs font-semibold text-[#1c1b2b]">AI Research Agent, watch research synthesize itself</span>
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

          {/* Right: card — positioned to sit towards the right, partially clipped */}
          <div className="hidden lg:block relative w-[380px] shrink-0 mr-[-40px]">
            {/* Decorative blobs */}
            <div className="absolute -top-10 -left-10 h-44 w-36 rounded-[50px] bg-[#c6b5f6]/40 -rotate-12 -z-10" />
            <div className="absolute -bottom-8 -left-6 h-32 w-32 rounded-full bg-[#d0e8ba]/50 -z-10" />

            {/* ZAP starburst */}
            <div className="absolute -left-3 -top-4 z-30 select-none -rotate-12">
              <div className="relative grid place-items-center">
                <svg viewBox="0 0 100 100" className="h-14 w-14 fill-[#fad47f] stroke-[#1c1b2b] stroke-[2.5px] overflow-visible drop-shadow-[2px_2px_0_#1c1b2b]">
                  <polygon points="50,2 62,26 88,14 80,40 100,52 78,64 86,90 60,80 48,100 38,78 12,86 22,62 0,48 22,38 12,12 38,24" />
                </svg>
                <span className="absolute font-black tracking-wider text-[#1c1b2b] text-[10px] uppercase">ZAP!</span>
              </div>
            </div>

            {/* Card */}
            <div className="rounded-[28px] border border-[#e8e2d6] bg-white p-5 shadow-[0_20px_50px_-15px_rgba(28,27,43,0.2)]">
              {/* Header */}
              <div className="flex items-start justify-between pb-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9794ab]">SESSION 1 · HEALTHCARE</p>
                  <h2 className="mt-0.5 font-display text-lg font-black text-[#1c1b2b]">Clinical LLMs & Synthesis</h2>
                </div>
                <span className="flex items-center gap-1.5 rounded-full border border-[#7b5cf0]/30 bg-[#ece5fe] px-2.5 py-1 text-[10px] font-bold text-[#5a3dd4]">
                  <Robot size={12} weight="fill" /> Fixing…
                </span>
              </div>

              {/* Tiles */}
              <Reorder.Group axis="y" values={tiles} onReorder={setTiles} className="space-y-2">
                {tiles.map((item) => (
                  <Reorder.Item
                    key={item.id}
                    value={item}
                    className={`group cursor-grab active:cursor-grabbing rounded-xl border border-[#e8e2d6] border-l-[3px] ${item.borderColor} bg-white px-3 py-2.5 transition hover:shadow-md`}
                    whileDrag={{ scale: 1.02, boxShadow: "0 8px 25px -8px rgba(28,27,43,0.25)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.iconBg}`}>
                          {renderIcon(item.iconType)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-[#9794ab]">{item.time}</p>
                          <h3 className={`truncate text-xs font-bold text-[#1c1b2b] ${item.strikethrough ? "line-through text-[#f08a6c]" : ""}`}>
                            {item.title}
                          </h3>
                        </div>
                      </div>
                      {item.status === "at_risk" && (
                        <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#c4502f]">
                          <Heart size={11} weight="fill" className="text-[#f08a6c]" /> At risk
                        </span>
                      )}
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>

              {/* Bottom progress */}
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#f5f1e8] px-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#23864b]" />
                <span className="text-[11px] font-bold text-[#1c1b2b]">Asking 3 agents to synthesize…</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e8e2d6]">
                <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-[#7b5cf0] via-[#f08a6c] to-[#d0e8ba] animate-pulse" />
              </div>
            </div>
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
