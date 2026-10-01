"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, Reorder } from "motion/react";
import {
  ArrowRight,
  Play,
  Graph,
  Robot,
  Article,
  FileText,
  Lightbulb,
  ShieldWarning,
  Warning,
  Heart,
  Lightning,
  Path,
  ShieldCheck,
} from "@phosphor-icons/react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/lib/toast";

/* ─── Moveable Tile Interface ─── */

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
    strikethrough: true,
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
      case "article":   return <Article size={16} weight="duotone" className="text-[#a86f00]" />;
      case "warning":   return <Warning size={16} weight="fill" className="text-[#c4502f]" />;
      case "lightbulb": return <Lightbulb size={16} weight="fill" className="text-[#a86f00]" />;
      case "shield":    return <ShieldWarning size={16} weight="duotone" className="text-[#3f8a2e]" />;
      case "file":      return <FileText size={16} weight="duotone" className="text-[#c9544f]" />;
    }
  };

  const isLoggedIn = status === "authenticated" && user;

  return (
    <div className="relative min-h-screen bg-[#faf8f4] text-[#1c1b2b] selection:bg-[#fad47f] selection:text-[#1c1b2b] overflow-x-hidden font-sans">

      {/* Subtle tactile dot grid across the entire background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(#1c1b2b 1.5px, transparent 1.5px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* ─── Navigation Bar ─── */}
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

      {/* ─── Hero Section (Centered & Balanced Layout) ─── */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-6 pb-20 sm:px-8 lg:pt-12 lg:pb-24">
        <div className="flex flex-col lg:flex-row items-center justify-center gap-12 xl:gap-20">

          {/* Left Column: Bold Chunky Headline & Buttons */}
          <div className="max-w-xl shrink-0 space-y-6 text-left lg:-mt-20 lg:max-w-[540px] xl:max-w-2xl">
            <h1 className="font-display text-[44px] sm:text-[56px] lg:text-[48px] xl:text-[62px] font-black leading-[0.98] tracking-[-0.03em] text-[#1c1b2b] lg:whitespace-nowrap">
              Plan your<br />
              own{" "}
              <span className="whitespace-nowrap">
                <span className="relative inline-block">
                  research
                  <span className="absolute inset-x-0 -bottom-0.5 h-[6px] rounded-full bg-[#7b5cf0]" aria-hidden />
                </span>
                .
              </span>
              <br />
              <span className="relative inline-block">
                <span className="relative z-10">We handle</span>
                <span className="absolute left-0 bottom-1.5 h-3.5 sm:h-4 w-full -rotate-1 bg-[#fad47f] z-0 rounded-sm" aria-hidden />
              </span>
              <br />
              the connections.
            </h1>

            {/* CTAs */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleDemoLogin}
                disabled={demoLoading}
                className="inline-flex items-center gap-2.5 rounded-full bg-[#1c1b2b] px-7 py-3.5 text-base font-bold text-white shadow-[4px_4px_0_#7b5cf0] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#7b5cf0] cursor-pointer"
              >
                <ArrowRight size={16} weight="bold" /> {demoLoading ? "Opening…" : "Start researching"}
              </button>
              <Link
                href="/workspaces"
                className="inline-flex items-center gap-2.5 rounded-full border-2 border-[#1c1b2b] bg-white px-7 py-3.5 text-base font-bold text-[#1c1b2b] shadow-[4px_4px_0_#1c1b2b] transition hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#1c1b2b]"
              >
                <Play size={14} weight="fill" /> Explore demo
              </Link>
            </div>

            {/* Quick features */}
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-[15px] font-medium text-[#4a4860]">
              <li className="flex items-center gap-1.5"><Lightning size={17} weight="fill" className="text-[#e0a92e]" /> Builds while you browse</li>
              <li className="flex items-center gap-1.5"><Path size={17} weight="bold" className="text-[#3f8a2e]" /> Explained connections</li>
              <li className="flex items-center gap-1.5"><ShieldCheck size={17} weight="fill" className="text-[#7b5cf0]" /> Tracking is opt-in</li>
            </ul>
          </div>

          {/* Right Column: Premium Hero Card with Moveable Tiles */}
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="relative w-full max-w-[370px] xl:max-w-[385px] shrink-0"
          >

            {/* Soft decorative background pastel blobs */}
            <div className="absolute -top-10 -left-10 h-44 w-36 rounded-[50px] bg-[#c6b5f6]/40 -rotate-12 -z-10 pointer-events-none" />
            <div className="absolute -bottom-8 -left-6 h-36 w-36 rounded-full bg-[#d0e8ba]/50 -z-10 pointer-events-none" />

            {/* Yellow ZAP! Starburst Sticker */}
            <div className="absolute -left-3 -top-3 z-30 select-none -rotate-12 pointer-events-none">
              <div className="relative grid place-items-center">
                <svg viewBox="0 0 100 100" className="h-13 w-13 fill-[#fad47f] stroke-[#1c1b2b] stroke-[2.5px] overflow-visible drop-shadow-[2px_2px_0_#1c1b2b]">
                  <polygon points="50,2 62,26 88,14 80,40 100,52 78,64 86,90 60,80 48,100 38,78 12,86 22,62 0,48 22,38 12,12 38,24" />
                </svg>
                <span className="absolute font-black tracking-wider text-[#1c1b2b] text-[10px] uppercase">ZAP!</span>
              </div>
            </div>

            {/* Yellow Compass / Radar Sticker at bottom right */}
            <div className="absolute -right-3 -bottom-3 z-30 select-none pointer-events-none grid h-10 w-10 place-items-center rounded-full border-2 border-[#1c1b2b] bg-[#fad47f] shadow-[2px_2px_0_#1c1b2b]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#1c1b2b]">
                <circle cx="12" cy="12" r="9" fill="none" stroke="#1c1b2b" strokeWidth="2" />
                <polygon points="12,6 15,12 12,10 9,12" fill="#1c1b2b" />
                <polygon points="12,18 15,12 12,14 9,12" fill="#1c1b2b" opacity="0.6" />
                <circle cx="12" cy="12" r="1.5" fill="#fad47f" />
              </svg>
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-[#1c1b2b] bg-[#3f8a2e]" />
            </div>

            {/* The Main Hero Card Container */}
            <motion.div
              initial={{ opacity: 0, y: 28, rotate: 2 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ type: "spring", stiffness: 110, damping: 16, delay: 0.1 }}
              whileHover={{ y: -6, rotate: -0.6, boxShadow: "8px 8px 0 #1c1b2b" }}
              className="rounded-[32px] border-[2.5px] border-[#1c1b2b] bg-white p-5 shadow-[0_20px_50px_-10px_rgba(28,27,43,0.18)]"
            >

              {/* Card Header */}
              <div className="flex items-start justify-between pb-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9794ab]">SESSION 1 · HEALTHCARE</p>
                  <h2 className="mt-0.5 font-display text-lg font-black text-[#1c1b2b]">Clinical AI & Synthesis</h2>
                </div>
                <span className="flex items-center gap-1.5 rounded-full border border-[#7b5cf0]/30 bg-[#ece5fe] px-2.5 py-1 text-[10px] font-bold text-[#5a3dd4]">
                  <Robot size={12} weight="fill" /> Fixing…
                </span>
              </div>

              {/* ── Mini Connection Graph: Real-time Web Page Travel ── */}
              <div className="relative h-[82px] w-full rounded-2xl bg-[#faf8f4] mb-2.5 overflow-hidden">
                {/* Subtle header badge */}
                <div className="absolute top-1.5 left-2.5 z-10 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7b5cf0] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7b5cf0]"></span>
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#7b5cf0]">Web Page Flow</span>
                </div>

                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 340 82">
                  <defs>
                    <linearGradient id="mini-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#c6b5f6" />
                      <stop offset="100%" stopColor="#7b5cf0" />
                    </linearGradient>
                    <linearGradient id="mini-conflict" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f08a6c" />
                      <stop offset="100%" stopColor="#c4502f" />
                    </linearGradient>
                    <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#1c1b2b" floodOpacity="0.18" />
                    </filter>
                  </defs>

                  {/* Connection paths */}
                  <path id="path-1-2" d="M 52 36 L 140 26" stroke="url(#mini-grad)" strokeWidth="1.5" fill="none" strokeOpacity="0.75" />
                  <path id="path-2-3" d="M 140 26 L 235 24" stroke="url(#mini-grad)" strokeWidth="1.5" fill="none" strokeOpacity="0.75" />
                  <path id="path-2-5" d="M 140 26 L 175 60" stroke="url(#mini-grad)" strokeWidth="1.5" fill="none" strokeOpacity="0.6" />
                  <path id="path-1-4" d="M 52 36 L 92 62" stroke="url(#mini-conflict)" strokeWidth="1.5" fill="none" strokeDasharray="4,3" strokeOpacity="0.85" />
                  <path id="path-3-6" d="M 235 24 L 285 54" stroke="url(#mini-grad)" strokeWidth="1.5" fill="none" strokeOpacity="0.6" />
                  <path id="path-5-6" d="M 175 60 L 285 54" stroke="url(#mini-grad)" strokeWidth="1.5" fill="none" strokeOpacity="0.5" />

                  {/* ── Traveling Web Page 1 (Node 1 -> Node 2) ── */}
                  <g filter="url(#card-shadow)">
                    <animateMotion dur="2.4s" repeatCount="indefinite" path="M 52 36 L 140 26" begin="0s" keyPoints="0;1" keyTimes="0;1" />
                    <rect x="-7" y="-5" width="14" height="10" rx="2" fill="#ffffff" stroke="#7b5cf0" strokeWidth="1" />
                    <rect x="-7" y="-5" width="14" height="3" rx="1" fill="#ece5fe" />
                    <line x1="-4" y1="1" x2="3" y2="1" stroke="#9794ab" strokeWidth="0.8" strokeLinecap="round" />
                    <line x1="-4" y1="3" x2="0" y2="3" stroke="#9794ab" strokeWidth="0.8" strokeLinecap="round" />
                  </g>

                  {/* ── Traveling Web Page 2 (Node 2 -> Node 3) ── */}
                  <g filter="url(#card-shadow)">
                    <animateMotion dur="2.8s" repeatCount="indefinite" path="M 140 26 L 235 24" begin="0.8s" keyPoints="0;1" keyTimes="0;1" />
                    <rect x="-7" y="-5" width="14" height="10" rx="2" fill="#ffffff" stroke="#7b5cf0" strokeWidth="1" />
                    <rect x="-7" y="-5" width="14" height="3" rx="1" fill="#ece5fe" />
                    <line x1="-4" y1="1" x2="4" y2="1" stroke="#9794ab" strokeWidth="0.8" strokeLinecap="round" />
                    <line x1="-4" y1="3" x2="1" y2="3" stroke="#9794ab" strokeWidth="0.8" strokeLinecap="round" />
                  </g>

                  {/* ── Traveling Web Page 3 (Node 2 -> Node 5: Clinical -> RAG) ── */}
                  <g filter="url(#card-shadow)">
                    <animateMotion dur="2.6s" repeatCount="indefinite" path="M 140 26 L 175 60" begin="1.4s" keyPoints="0;1" keyTimes="0;1" />
                    <rect x="-7" y="-5" width="14" height="10" rx="2" fill="#ffffff" stroke="#3f8a2e" strokeWidth="1" />
                    <rect x="-7" y="-5" width="14" height="3" rx="1" fill="#e8f4dc" />
                    <line x1="-4" y1="1" x2="2" y2="1" stroke="#3f8a2e" strokeWidth="0.8" strokeLinecap="round" />
                    <line x1="-4" y1="3" x2="-1" y2="3" stroke="#3f8a2e" strokeWidth="0.8" strokeLinecap="round" />
                  </g>

                  {/* ── Traveling Web Page 4 (Conflict Paper: Node 1 -> Node 4) ── */}
                  <g filter="url(#card-shadow)">
                    <animateMotion dur="2.2s" repeatCount="indefinite" path="M 52 36 L 92 62" begin="0.4s" keyPoints="0;1" keyTimes="0;1" />
                    <rect x="-7" y="-5" width="14" height="10" rx="2" fill="#ffffff" stroke="#c4502f" strokeWidth="1" />
                    <rect x="-7" y="-5" width="14" height="3" rx="1" fill="#fde3d9" />
                    <line x1="-4" y1="1" x2="3" y2="1" stroke="#c4502f" strokeWidth="0.8" strokeLinecap="round" />
                    <line x1="-4" y1="3" x2="0" y2="3" stroke="#c4502f" strokeWidth="0.8" strokeLinecap="round" />
                  </g>

                  {/* ── Traveling Web Page 5 (Node 3 -> Node 6: FDA -> Synthesis) ── */}
                  <g filter="url(#card-shadow)">
                    <animateMotion dur="2.7s" repeatCount="indefinite" path="M 235 24 L 285 54" begin="1.1s" keyPoints="0;1" keyTimes="0;1" />
                    <rect x="-7" y="-5" width="14" height="10" rx="2" fill="#ffffff" stroke="#7b5cf0" strokeWidth="1" />
                    <rect x="-7" y="-5" width="14" height="3" rx="1" fill="#ece5fe" />
                    <line x1="-4" y1="1" x2="3" y2="1" stroke="#9794ab" strokeWidth="0.8" strokeLinecap="round" />
                    <line x1="-4" y1="3" x2="-1" y2="3" stroke="#9794ab" strokeWidth="0.8" strokeLinecap="round" />
                  </g>

                  {/* ── Research Source Nodes (Web Page Sources) ── */}
                  {/* Node 1: PubMed / Med-PaLM */}
                  <g>
                    <circle cx="52" cy="36" r="12" fill="#fef3d6" stroke="#a86f00" strokeWidth="1.5" />
                    <text x="52" y="39.5" textAnchor="middle" fill="#a86f00" fontSize="7.5" fontWeight="900">PUB</text>
                    <text x="52" y="54" textAnchor="middle" fill="#9794ab" fontSize="6.5" fontWeight="700">PubMed</text>
                  </g>

                  {/* Node 2: Clinical Trial */}
                  <g>
                    <circle cx="140" cy="26" r="12" fill="#ece5fe" stroke="#5a3dd4" strokeWidth="1.5" />
                    <text x="140" y="29.5" textAnchor="middle" fill="#5a3dd4" fontSize="7.5" fontWeight="900">NLP</text>
                    <text x="140" y="44" textAnchor="middle" fill="#9794ab" fontSize="6.5" fontWeight="700">arXiv</text>
                  </g>

                  {/* Node 3: FDA SaMD */}
                  <g>
                    <circle cx="235" cy="24" r="12" fill="#ece5fe" stroke="#7b5cf0" strokeWidth="1.5" />
                    <text x="235" y="27.5" textAnchor="middle" fill="#7b5cf0" fontSize="7.5" fontWeight="900">FDA</text>
                    <text x="235" y="42" textAnchor="middle" fill="#9794ab" fontSize="6.5" fontWeight="700">Gov SaMD</text>
                  </g>

                  {/* Node 4: Hallucination Risk Paper */}
                  <g>
                    <circle cx="92" cy="62" r="11" fill="#fde3d9" stroke="#c4502f" strokeWidth="1.5" strokeDasharray="3,2" />
                    <text x="92" y="65.5" textAnchor="middle" fill="#c4502f" fontSize="8" fontWeight="900">⚠</text>
                    <text x="92" y="77" textAnchor="middle" fill="#c4502f" fontSize="6" fontWeight="700">Conflict</text>
                  </g>

                  {/* Node 5: EHR / RAG */}
                  <g>
                    <circle cx="175" cy="60" r="11" fill="#e8f4dc" stroke="#3f8a2e" strokeWidth="1.5" />
                    <text x="175" y="63.5" textAnchor="middle" fill="#3f8a2e" fontSize="7.5" fontWeight="900">EHR</text>
                    <text x="175" y="75" textAnchor="middle" fill="#3f8a2e" fontSize="6" fontWeight="700">Hospital</text>
                  </g>

                  {/* Node 6: Synthesis Report */}
                  <g>
                    <circle cx="285" cy="54" r="12" fill="#fad47f" stroke="#1c1b2b" strokeWidth="1.5" />
                    <text x="285" y="57.5" textAnchor="middle" fill="#1c1b2b" fontSize="7.5" fontWeight="900">MAP</text>
                    <text x="285" y="72" textAnchor="middle" fill="#1c1b2b" fontSize="6.5" fontWeight="700">Synthesis</text>
                  </g>
                </svg>

                {/* Tiny bottom-right legend */}
                <div className="absolute bottom-1 right-2 flex items-center gap-2 text-[8px] font-bold text-[#9794ab] bg-[#faf8f4]/90 px-1.5 py-0.5 rounded">
                  <span className="flex items-center gap-0.5"><span className="inline-block h-1.5 w-3 rounded-full bg-[#7b5cf0]" />synced</span>
                  <span className="flex items-center gap-0.5"><span className="inline-block h-1.5 w-3 rounded-full bg-[#c4502f]" />conflict</span>
                </div>
              </div>


              <Reorder.Group axis="y" values={tiles} onReorder={setTiles} className="space-y-2 mt-1">
                {tiles.map((item, i) => (
                  <Reorder.Item
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.12, type: "spring", stiffness: 160, damping: 18 }}
                    key={item.id}
                    value={item}
                    className={`group cursor-grab active:cursor-grabbing rounded-xl border border-[#e8e2d6] bg-white px-3 py-2.5 transition hover:shadow-md select-none`}
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

              {/* Bottom Agent Progress */}
              <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-[#f5f1e8] px-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#23864b] animate-pulse" />
                <span className="text-[11px] font-bold text-[#1c1b2b]">Asking 3 agents to synthesize…</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e8e2d6]">
                <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-[#7b5cf0] via-[#f08a6c] to-[#d0e8ba] animate-pulse" />
              </div>
            </motion.div>

          </motion.div>

        </div>
      </section>

      {/* ─── How it Works Section ─── */}
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
