"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Reorder } from "motion/react";
import {
  ArrowRight,
  Sparkle,
  Graph,
  Robot,
  FileText,
  Lightbulb,
  Compass,
  Warning,
  CheckCircle,
  Lightning,
  TreeStructure,
  ShieldCheck,
  Play,
  Article,
} from "@phosphor-icons/react";
import { useAuthStore } from "@/stores/auth";
import { Logo } from "@/components/shell/Logo";
import { APP_NAME } from "@/lib/api/config";
import { toast } from "@/lib/toast";

interface TileItem {
  id: string;
  time: string;
  source: string;
  title: string;
  status: "synthesized" | "at_risk" | "key" | "topic";
  statusLabel: string;
  icon: "article" | "warning" | "lightbulb" | "compass";
}

const INITIAL_TILES: TileItem[] = [
  {
    id: "tile-1",
    time: "09:00",
    source: "ArXiv Preprint",
    title: "Attention Is All You Need in Clinical NLP",
    status: "synthesized",
    statusLabel: "Synthesized",
    icon: "article",
  },
  {
    id: "tile-2",
    time: "10:30",
    source: "Nature Medicine",
    title: "Diagnostic Accuracy of Med-PaLM 2",
    status: "at_risk",
    statusLabel: "At risk",
    icon: "warning",
  },
  {
    id: "tile-3",
    time: "13:00",
    source: "PubMed Central",
    title: "Retrieval-Augmented Generation for EHR Systems",
    status: "key",
    statusLabel: "Key finding",
    icon: "lightbulb",
  },
  {
    id: "tile-4",
    time: "15:00",
    source: "FDA Guidance",
    title: "Software as a Medical Device (SaMD) 2026 Draft",
    status: "topic",
    statusLabel: "Regulation",
    icon: "compass",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { status, bootstrap, login, user } = useAuthStore();
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
        toast.success("Welcome to Research Map!", { description: "Opening AI in Healthcare workspace..." });
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

  const getTileStatusBadge = (status: TileItem["status"], label: string) => {
    switch (status) {
      case "at_risk":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2.5 py-0.5 text-[11px] font-bold text-coral-deep border border-coral/30">
            <span className="h-1.5 w-1.5 rounded-full bg-coral animate-ping" />
            {label}
          </span>
        );
      case "synthesized":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-mint-soft px-2.5 py-0.5 text-[11px] font-bold text-mint-deep border border-mint/30">
            <CheckCircle size={12} weight="fill" />
            {label}
          </span>
        );
      case "key":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sun-soft px-2.5 py-0.5 text-[11px] font-bold text-sun-deep border border-sun/40">
            <Sparkle size={12} weight="fill" />
            {label}
          </span>
        );
      case "topic":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-lavender-soft px-2.5 py-0.5 text-[11px] font-bold text-purple-deep border border-lavender/40">
            <TreeStructure size={12} weight="bold" />
            {label}
          </span>
        );
    }
  };

  const getTileIcon = (icon: TileItem["icon"]) => {
    switch (icon) {
      case "article":
        return <Article size={18} weight="duotone" className="text-purple" />;
      case "warning":
        return <Warning size={18} weight="fill" className="text-coral" />;
      case "lightbulb":
        return <Lightbulb size={18} weight="fill" className="text-sun-deep" />;
      case "compass":
        return <Compass size={18} weight="duotone" className="text-purple-deep" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-ink selection:bg-sun selection:text-ink">
      {/* Background Dots Pattern */}
      <div
        className="fixed inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: "radial-gradient(#1c1b2b 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Navigation Bar */}
      <nav className="relative z-30 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <Logo href="/" />
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-bold text-ink-soft">
          <a href="#how-it-works" className="hover:text-ink transition">How it works</a>
          <a href="#features" className="hover:text-ink transition">Features</a>
          <a href="#agents" className="hover:text-ink transition">AI Agents</a>
          <a href="#workspace" className="hover:text-ink transition">Workspaces</a>
        </div>

        <div className="flex items-center gap-3">
          {status === "authenticated" && user ? (
            <Link
              href="/workspaces"
              className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-sun px-5 py-2.5 text-xs font-extrabold text-ink shadow-pop hover:-translate-y-0.5 transition"
            >
              Open Workspaces <ArrowRight size={14} weight="bold" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="px-4 py-2 text-xs font-extrabold text-ink hover:text-purple transition"
              >
                Log in
              </Link>
              <button
                onClick={handleDemoLogin}
                disabled={demoLoading}
                className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-ink px-5 py-2.5 text-xs font-extrabold text-white shadow-pop hover:-translate-y-0.5 transition"
              >
                {demoLoading ? "Opening…" : "Get started"}
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-10 pb-20 lg:pt-16 lg:pb-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
          
          {/* Left Column: Hero Pitch & CTAs */}
          <div className="lg:col-span-6 space-y-6">
            {/* Pill Chip Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white px-3.5 py-1.5 shadow-clay-sm">
              <span className="rounded-full bg-coral px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                NEW
              </span>
              <span className="text-xs font-bold text-ink-soft">
                AI Research Agent, watch research synthesize itself
              </span>
            </div>

            {/* Massive Bold Headline */}
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-ink leading-[1.08]">
              Plan your <br />
              own research. <br />
              <span className="relative inline-block">
                <span className="relative z-10">We handle</span>
                <span className="absolute left-0 bottom-1 h-3.5 w-full -rotate-1 bg-sun/80 z-0" />
              </span>{" "}
              <br />
              the connections.
            </h1>

            {/* Subtitle */}
            <p className="max-w-xl text-base sm:text-lg font-medium text-muted leading-relaxed">
              Turn chaotic browser tabs into a visual knowledge map automatically.
              Three background AI agents cluster pages, explain relationships, detect
              contradictions, and build your research report in real-time.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={handleDemoLogin}
                disabled={demoLoading}
                className="inline-flex items-center justify-center gap-2.5 rounded-full border-2 border-ink bg-ink px-7 py-4 text-sm font-bold text-white shadow-pop hover:-translate-y-0.5 hover:shadow-pop-lg transition cursor-pointer"
              >
                <ArrowRight size={18} weight="bold" />
                {demoLoading ? "Opening Demo..." : "Start researching"}
              </button>

              <Link
                href="/workspaces"
                className="inline-flex items-center justify-center gap-2.5 rounded-full border-2 border-ink bg-white px-7 py-4 text-sm font-bold text-ink shadow-clay-sm hover:bg-canvas transition"
              >
                <Play size={16} weight="fill" className="text-purple" />
                Plan a workspace
              </Link>
            </div>

            {/* Benefit Bullets */}
            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs font-bold text-ink-soft">
              <div className="flex items-center gap-2">
                <Lightning size={16} weight="fill" className="text-star" />
                <span>Tabs to nodes in seconds</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText size={16} weight="fill" className="text-mint-deep" />
                <span>Instant session report</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} weight="fill" className="text-purple" />
                <span>Conflict & radar alerts</span>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Card with Moveable Component Tiles */}
          <div className="lg:col-span-6 relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md">
              
              {/* Top ZAP! Sticker */}
              <div className="absolute -left-4 -top-5 z-20 flex items-center gap-1 rounded-2xl border-2 border-ink bg-sun px-3 py-1 text-xs font-black uppercase tracking-wider text-ink shadow-pop -rotate-12 select-none">
                <Lightning size={14} weight="fill" /> ZAP!
              </div>

              {/* Main Card Container */}
              <div className="relative rounded-3xl border-3 border-ink bg-white p-5 sm:p-6 shadow-pop-lg">
                
                {/* Card Header */}
                <div className="flex items-start justify-between border-b-2 border-line pb-4">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-widest text-muted">
                      SESSION 1 • AI IN HEALTHCARE
                    </p>
                    <h2 className="mt-0.5 font-display text-xl font-black text-ink">
                      Clinical LLMs & Synthesis
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full border border-purple/30 bg-lavender-soft px-3 py-1 text-[11px] font-extrabold text-purple-deep">
                    <span className="h-2 w-2 rounded-full bg-purple animate-pulse" />
                    <span>Fixing…</span>
                  </div>
                </div>

                {/* Moveable Component Tiles (Interactive Drag & Reorder) */}
                <div className="my-4">
                  <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-faint">
                    Drag tiles to reorder research timeline:
                  </p>
                  
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
                        className="group relative cursor-grab active:cursor-grabbing rounded-2xl border-2 border-ink/80 bg-white p-3.5 shadow-sm transition hover:shadow-pop hover:-translate-y-0.5"
                        whileDrag={{ scale: 1.03, boxShadow: "5px 5px 0 #1c1b2b" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-line bg-canvas">
                              {getTileIcon(item.icon)}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold text-muted">
                                {item.time} · {item.source}
                              </p>
                              <h3 className="truncate text-xs font-extrabold text-ink group-hover:text-purple transition-colors">
                                {item.title}
                              </h3>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {getTileStatusBadge(item.status, item.statusLabel)}
                          </div>
                        </div>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                </div>

                {/* Bottom Agent Status & Progress Bar */}
                <div className="rounded-2xl border-2 border-ink/20 bg-canvas p-3">
                  <div className="flex items-center justify-between text-[11px] font-extrabold text-ink-soft">
                    <span className="flex items-center gap-1.5">
                      <Robot size={15} weight="fill" className="text-purple animate-bounce" />
                      Asking 3 agents to synthesize connections…
                    </span>
                    <span className="text-[10px] font-black text-purple">Agent 3</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white border border-line">
                    <div className="h-full w-4/5 rounded-full bg-linear-to-r from-purple via-coral to-mint animate-pulse" />
                  </div>
                </div>

              </div>

              {/* Floating Compass Dial Badge */}
              <div
                title="Visual Graph Orientation"
                className="absolute -bottom-4 -right-4 z-20 grid h-12 w-12 place-items-center rounded-full border-2 border-ink bg-sun shadow-pop hover:rotate-45 transition-transform cursor-pointer"
              >
                <Compass size={22} weight="duotone" className="text-ink" />
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="relative z-10 border-t-2 border-line bg-white/60 py-20 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="rounded-full bg-lavender-soft px-3 py-1 text-xs font-black uppercase tracking-wider text-purple-deep">
              Automatic Intelligence
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-black text-ink">
              Browse normally. Your graph builds itself.
            </h2>
            <p className="text-muted font-medium text-sm sm:text-base">
              No manual node typing or manual wire dragging required. When you start tracking,
              everything you read is analyzed, connected, and mapped in real-time.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="rounded-3xl border-2 border-ink bg-white p-6 shadow-pop hover:-translate-y-1 transition">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-ink bg-sun text-ink font-display font-black text-lg shadow-sm">
                1
              </span>
              <h3 className="mt-4 font-display text-lg font-black text-ink">Turn Tracking On</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed font-medium">
                The Chrome extension listens to your browsing. It reads page text, measures time spent,
                and captures live screenshots while discarding non-research noise.
              </p>
            </div>

            <div className="rounded-3xl border-2 border-ink bg-white p-6 shadow-pop hover:-translate-y-1 transition">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-ink bg-coral-soft text-coral-deep font-display font-black text-lg shadow-sm">
                2
              </span>
              <h3 className="mt-4 font-display text-lg font-black text-ink">3 AI Agents Pipeline</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed font-medium">
                Agent 1 filters non-research pages to the Inbox. Agent 2 extracts main takeaways and tags.
                Agent 3 links related nodes and surfaces contradictions.
              </p>
            </div>

            <div className="rounded-3xl border-2 border-ink bg-white p-6 shadow-pop hover:-translate-y-1 transition">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-ink bg-mint-soft text-mint-deep font-display font-black text-lg shadow-sm">
                3
              </span>
              <h3 className="mt-4 font-display text-lg font-black text-ink">Visual Knowledge Map</h3>
              <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed font-medium">
                Explore your tabs on an infinite canvas with live tab previews, topic clusters,
                explained relationship labels, and one-click session reports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section id="features" className="relative z-10 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="rounded-full bg-sun-soft px-3 py-1 text-xs font-black uppercase tracking-wider text-sun-deep">
              Built For Hackathon 4.0
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-black text-ink">
              Every tool a researcher needs.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="rounded-3xl border-2 border-ink bg-white p-6 shadow-pop">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple text-white shadow-sm">
                <Graph size={20} weight="bold" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-ink">Interactive Canvas & Focus View</h3>
              <p className="mt-2 text-xs text-muted font-medium">
                Toggle between Full Graph and isolated Topic Focus views to zoom deep into specific branches without losing the big picture.
              </p>
            </div>

            <div className="rounded-3xl border-2 border-ink bg-white p-6 shadow-pop">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-coral text-white shadow-sm">
                <Warning size={20} weight="bold" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-ink">Conflict & Contradiction Radar</h3>
              <p className="mt-2 text-xs text-muted font-medium">
                Our AI actively highlights contradictory claims across different sources so you never miss scientific or legal disagreements.
              </p>
            </div>

            <div className="rounded-3xl border-2 border-ink bg-white p-6 shadow-pop">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-mint-deep text-white shadow-sm">
                <TreeStructure size={20} weight="bold" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-ink">Branches & Live Collaboration</h3>
              <p className="mt-2 text-xs text-muted font-medium">
                Work together in real-time with teammates on personal branches, compare differences, and merge research trees seamlessly.
              </p>
            </div>
          </div>

          {/* Bottom Banner */}
          <div className="mt-16 rounded-3xl border-3 border-ink bg-ink p-8 sm:p-12 text-center text-white shadow-pop-lg">
            <h2 className="font-display text-2xl sm:text-3xl font-black">
              Ready to explore your research map?
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-faint max-w-lg mx-auto">
              Test with our pre-seeded &ldquo;AI in Healthcare&rdquo; workspace containing 20+ papers,
              topic clusters, and live AI agent simulations.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <button
                onClick={handleDemoLogin}
                disabled={demoLoading}
                className="inline-flex items-center gap-2 rounded-full border-2 border-sun bg-sun px-6 py-3 text-xs font-black text-ink shadow-pop hover:-translate-y-0.5 transition cursor-pointer"
              >
                <Sparkle size={16} weight="fill" />
                {demoLoading ? "Launching Demo..." : "Continue with Demo Account"}
              </button>
              <Link
                href="/workspaces"
                className="inline-flex items-center gap-2 rounded-full border-2 border-white/20 bg-white/10 px-6 py-3 text-xs font-extrabold text-white hover:bg-white/20 transition"
              >
                Go to Workspaces <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-line bg-white py-8 text-center text-xs font-bold text-muted">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-6">
          <Logo href="/" />
          <p>© 2026 {APP_NAME} · Visual Research & Browser Tab Manager · CSI TSEC 4.0</p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-ink">Login</Link>
            <Link href="/workspaces" className="hover:text-ink">Workspaces</Link>
            <Link href="/settings" className="hover:text-ink">Settings</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
