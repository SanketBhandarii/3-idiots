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
  Compass,
  Graph,
  Warning,
  Lightbulb,
  FileText,
  ShieldWarning,
} from "@phosphor-icons/react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/lib/toast";

interface TileItem {
  id: string;
  time: string;
  title: string;
  status?: "at_risk";
  strikethrough?: boolean;
  boxColor: string;
  iconType: "article" | "warning" | "lightbulb" | "shield" | "file";
}

const INITIAL_TILES: TileItem[] = [
  {
    id: "tile-1",
    time: "9:00",
    title: "PubMed · Med-PaLM 2 Clinical Benchmarks",
    boxColor: "bg-[#fef3d6] text-[#a86f00]",
    iconType: "article",
  },
  {
    id: "tile-2",
    time: "10:00",
    title: "Diagnostic Hallucination Disagreement",
    status: "at_risk",
    boxColor: "bg-[#fde3d9] text-[#c4502f]",
    iconType: "warning",
  },
  {
    id: "tile-3",
    time: "13:00",
    title: "Retrieval-Augmented Generation for EHR",
    boxColor: "bg-[#fef3d6] text-[#a86f00]",
    iconType: "lightbulb",
  },
  {
    id: "tile-4",
    time: "15:00",
    title: "Unverified Oncology Trial Data",
    status: "at_risk",
    strikethrough: true,
    boxColor: "bg-[#e8f4dc] text-[#3f8a2e]",
    iconType: "shield",
  },
  {
    id: "tile-5",
    time: "18:00",
    title: "FDA SaMD 2026 Regulatory Guidance Draft",
    boxColor: "bg-[#fde4e2] text-[#c9544f]",
    iconType: "file",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { bootstrap, login } = useAuthStore();
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
        toast.success("Welcome!", { description: "Opening AI in Healthcare workspace..." });
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
      case "article":
        return <Article size={18} weight="duotone" />;
      case "warning":
        return <Warning size={18} weight="duotone" />;
      case "lightbulb":
        return <Lightbulb size={18} weight="duotone" />;
      case "shield":
        return <ShieldWarning size={18} weight="duotone" />;
      case "file":
        return <FileText size={18} weight="duotone" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#faf8f4] text-[#1c1b2b] selection:bg-[#fad47f] selection:text-[#1c1b2b] overflow-x-hidden font-sans">
      {/* Background Dots Pattern */}
      <div
        className="fixed inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage: "radial-gradient(#1c1b2b 1.2px, transparent 1.2px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Navigation Bar */}
      <nav className="relative z-30 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-8">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="grid h-9 w-9 -rotate-6 place-items-center rounded-[30%] border-2 border-[#1c1b2b] bg-[#fad47f] shadow-[2px_2px_0px_#1c1b2b]">
            <Graph size={20} weight="duotone" className="text-[#1c1b2b]" />
          </div>
          <span className="font-display text-2xl font-black tracking-tight text-[#1c1b2b]">
            Research Map
          </span>
        </Link>

        {/* Center Nav Links */}
        <div className="hidden md:flex items-center gap-8 text-[15px] font-bold text-[#1c1b2b]/80">
          <a href="#how-it-works" className="hover:text-[#1c1b2b] transition">How it works</a>
          <a href="#features" className="hover:text-[#1c1b2b] transition">Features</a>
          <a href="#agents" className="hover:text-[#1c1b2b] transition">AI Agents</a>
          <a href="#workspaces" className="hover:text-[#1c1b2b] transition">Workspaces</a>
        </div>

        {/* Right CTA */}
        <div className="flex items-center gap-5">
          <Link
            href="/login"
            className="text-sm font-black text-[#1c1b2b] hover:text-[#7b5cf0] transition"
          >
            Log in
          </Link>
          <button
            onClick={handleDemoLogin}
            disabled={demoLoading}
            className="rounded-full bg-[#1c1b2b] px-6 py-2.5 text-sm font-black text-white hover:bg-[#3a3850] transition shadow-xs cursor-pointer"
          >
            {demoLoading ? "Opening…" : "Get started"}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-6 pb-16 sm:px-8 lg:pt-10 lg:pb-24">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">

          {/* Left Column: Bold Headline & CTAs */}
          <div className="lg:col-span-6 space-y-6 lg:pr-4">
            
            {/* Pill Chip Badge */}
            <div className="inline-flex items-center gap-2.5 rounded-full border-2 border-[#1c1b2b] bg-white px-3.5 py-1.5 shadow-xs">
              <span className="rounded-full bg-[#f08a6c] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                NEW
              </span>
              <span className="text-xs font-bold text-[#1c1b2b]">
                AI Research Agent, watch a research map synthesize itself
              </span>
            </div>

            {/* Massive Bold Headline */}
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-[76px] font-black tracking-tight text-[#1c1b2b] leading-[0.98]">
              Plan your<br />
              own research.<br />
              We handle<br />
              <span className="relative inline-block">
                <span className="relative z-10">the connections.</span>
                <span className="absolute left-0 bottom-1.5 h-4 sm:h-5 w-full -rotate-1 bg-[#fad47f] z-0 rounded-xs" />
              </span>
            </h1>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-3">
              <button
                onClick={handleDemoLogin}
                disabled={demoLoading}
                className="inline-flex items-center justify-center gap-2.5 rounded-full bg-[#1c1b2b] px-8 py-4 text-base font-extrabold text-white shadow-[4px_4px_0px_#1c1b2b] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#1c1b2b] transition cursor-pointer"
              >
                <ArrowRight size={18} weight="bold" />
                {demoLoading ? "Opening Demo..." : "Start researching"}
              </button>

              <Link
                href="/workspaces"
                className="inline-flex items-center justify-center gap-2.5 rounded-full border-[2.5px] border-[#1c1b2b] bg-white px-8 py-4 text-base font-extrabold text-[#1c1b2b] shadow-xs hover:bg-[#FAF8F5] hover:-translate-y-0.5 transition"
              >
                <Play size={16} weight="fill" className="text-[#1c1b2b]" />
                Explore demo
              </Link>
            </div>

            {/* Benefit Checkmarks */}
            <div className="flex flex-wrap items-center gap-6 pt-3 text-xs sm:text-sm font-extrabold text-[#3a3850]">
              <div className="flex items-center gap-2">
                <Lightning size={16} weight="fill" className="text-[#fad47f]" />
                <span>Tabs to nodes in seconds</span>
              </div>
              <div className="flex items-center gap-2">
                <EnvelopeSimple size={16} weight="bold" className="text-[#23864b]" />
                <span>Instant session report</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle size={10} weight="fill" className="text-[#7b5cf0]" />
                <span>Conflict radar & alerts</span>
              </div>
            </div>

          </div>

          {/* Right Column: Chunky Bold Neobrutalist Card with Draggable Tiles */}
          <div className="lg:col-span-6 relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[420px]">

              {/* Decorative Blob Shapes Behind Card */}
              <div className="absolute -top-10 -left-10 h-44 w-32 rounded-[50px] bg-[#c6b5f6]/50 -rotate-12 -z-10 pointer-events-none" />
              <div className="absolute -bottom-6 -left-8 h-32 w-32 rounded-full bg-[#d0e8ba]/60 -z-10 pointer-events-none" />

              {/* Comic ZAP! Starburst Sticker */}
              <div className="absolute -left-6 -top-7 z-30 select-none -rotate-12 cursor-pointer hover:rotate-0 transition-transform">
                <div className="relative grid place-items-center">
                  <svg
                    viewBox="0 0 100 100"
                    className="h-20 w-20 fill-[#fad47f] stroke-[#1c1b2b] stroke-[3px] overflow-visible drop-shadow-[3px_3px_0px_#1c1b2b]"
                  >
                    <polygon points="50,2 62,26 88,14 80,40 100,52 78,64 86,90 60,80 48,100 38,78 12,86 22,62 0,48 22,38 12,12 38,24" />
                  </svg>
                  <span className="absolute font-black tracking-widest text-[#1c1b2b] text-[13px] uppercase font-sans">
                    ZAP!
                  </span>
                </div>
              </div>

              {/* Main Bold Neobrutalist Box Container */}
              <div className="relative rounded-[38px] border-[3.5px] border-[#1c1b2b] bg-white p-5 sm:p-6 shadow-[14px_16px_0px_0px_#1c1b2b]">

                {/* Card Header */}
                <div className="flex items-start justify-between pb-3">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#9794ab]">
                      SESSION 1 · AI IN HEALTHCARE
                    </p>
                    <h2 className="font-display text-xl sm:text-2xl font-black text-[#1c1b2b]">
                      Clinical LLMs & Synthesis
                    </h2>
                  </div>

                  {/* Status Pill */}
                  <div className="rounded-full border-2 border-[#1c1b2b]/20 bg-[#FAF8F5] px-3.5 py-1 text-xs font-black text-[#1c1b2b]">
                    Analyzing…
                  </div>
                </div>

                {/* Draggable Component Tiles */}
                <div className="my-3">
                  <Reorder.Group
                    axis="y"
                    values={tiles}
                    onReorder={setTiles}
                    className="space-y-2.5"
                  >
                    {tiles.map((item) => (
                      <Reorder.Item
                        key={item.id}
                        value={item}
                        className="group relative cursor-grab active:cursor-grabbing rounded-2xl border-2 border-[#1c1b2b]/80 bg-white p-3 shadow-xs transition hover:shadow-pop hover:-translate-y-0.5"
                        whileDrag={{ scale: 1.02, boxShadow: "5px 5px 0 #1c1b2b" }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Icon Tile Box */}
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.boxColor}`}>
                              {renderIcon(item.iconType)}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold text-[#9794ab] leading-none mb-1">
                                {item.time}
                              </p>
                              <h3
                                className={`truncate text-xs font-black text-[#1c1b2b] ${
                                  item.strikethrough ? "line-through text-[#f08a6c]" : ""
                                }`}
                              >
                                {item.title}
                              </h3>
                            </div>
                          </div>

                          {/* Right Status Badge */}
                          {item.status === "at_risk" && (
                            <div className="flex items-center gap-1 shrink-0 text-[11px] font-extrabold text-[#c4502f]">
                              <Heart size={12} weight="fill" className="text-[#f08a6c]" />
                              <span>At risk</span>
                            </div>
                          )}
                        </div>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                </div>

                {/* Bottom Agent Input Box */}
                <div className="rounded-2xl border-2 border-[#1c1b2b]/15 bg-[#FAF8F5] p-3">
                  <div className="flex items-center gap-2 text-xs font-black text-[#1c1b2b]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#23864b] shrink-0" />
                    <span>Asking 3 AI agents to synthesize…</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white border border-[#1c1b2b]/10">
                    <div className="h-full w-4/5 rounded-full bg-linear-to-r from-[#7b5cf0] via-[#f08a6c] to-[#d0e8ba] animate-pulse" />
                  </div>
                </div>

              </div>

              {/* Floating Bottom-Right Compass Dial */}
              <div
                title="Dial orientation"
                className="absolute -bottom-5 -right-5 z-30 grid h-14 w-14 place-items-center rounded-full border-[3px] border-[#1c1b2b] bg-[#fad47f] shadow-[4px_4px_0px_#1c1b2b] hover:rotate-45 transition-transform cursor-pointer"
              >
                <Compass size={24} weight="duotone" className="text-[#1c1b2b]" />
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="relative z-10 border-t-2 border-[#1c1b2b]/10 bg-white/70 py-16 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="rounded-full bg-[#ece5fe] px-3 py-1 text-xs font-black uppercase tracking-wider text-[#5a3dd4]">
              Intelligent Synthesis
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-black text-[#1c1b2b]">
              Browse normally. Your graph builds itself.
            </h2>
            <p className="text-[#625f78] font-medium text-sm sm:text-base">
              Autonomous background agents extract key takeaways, discover semantic links,
              detect contradictions, and build knowledge maps in real-time.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="rounded-3xl border-2 border-[#1c1b2b] bg-white p-6 shadow-pop">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-[#1c1b2b] bg-[#fad47f] text-[#1c1b2b] font-display font-black text-lg shadow-xs">
                1
              </span>
              <h3 className="mt-4 font-display text-lg font-black text-[#1c1b2b]">Turn Tracking On</h3>
              <p className="mt-2 text-xs sm:text-sm text-[#625f78] leading-relaxed font-medium">
                Browse as usual. Research pages you read are captured automatically with live tab previews.
              </p>
            </div>

            <div className="rounded-3xl border-2 border-[#1c1b2b] bg-white p-6 shadow-pop">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-[#1c1b2b] bg-[#fde3d9] text-[#c4502f] font-display font-black text-lg shadow-xs">
                2
              </span>
              <h3 className="mt-4 font-display text-lg font-black text-[#1c1b2b]">3 AI Agents Pipeline</h3>
              <p className="mt-2 text-xs sm:text-sm text-[#625f78] leading-relaxed font-medium">
                Agent 1 filters inbox noise. Agent 2 extracts concepts. Agent 3 links topics and surfaces conflicts.
              </p>
            </div>

            <div className="rounded-3xl border-2 border-[#1c1b2b] bg-white p-6 shadow-pop">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-[#1c1b2b] bg-[#e8f4dc] text-[#3f8a2e] font-display font-black text-lg shadow-xs">
                3
              </span>
              <h3 className="mt-4 font-display text-lg font-black text-[#1c1b2b]">Instant Synthesis Reports</h3>
              <p className="mt-2 text-xs sm:text-sm text-[#625f78] leading-relaxed font-medium">
                Generate executive session summaries, markdown notes, and branch comparisons with one click.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-[#1c1b2b]/10 bg-white py-8 text-center text-xs font-bold text-[#625f78]">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-6 sm:px-8">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-[#1c1b2b] text-white text-[10px]">
              <Graph size={12} weight="bold" />
            </div>
            <span className="font-display font-black text-base text-[#1c1b2b]">Research Map</span>
          </div>
          <p>© 2026 Research Map · Visual Research & Browser Tab Manager · All rights reserved.</p>
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
