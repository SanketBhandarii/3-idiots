"use client";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowsClockwise,
  ChartBar,
  ClockCounterClockwise,
  CornersOut,
  DotsThreeOutline,
  Export,
  Funnel,
  GitBranch,
  Graph,
  Keyboard,
  Lightbulb,
  ListBullets,
  MagicWand,
  MagnifyingGlass,
  NotePencil,
  Pause,
  Play,
  Plus,
  Question,
  Record,
  Robot,
  ShareNetwork,
  SquaresFour,
  Stop,
  Sword,
  Target,
  TreeStructure,
  Tray,
  WifiHigh,
  WifiSlash,
  X,
  Brain,
} from "@phosphor-icons/react";
import type { BranchView, ColorBy, PanelKind, ViewMode } from "@/types/api";
import { sessionApi, workspaceApi } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatClock } from "@/lib/utils/format";
import { PAGE_TYPE_LABEL } from "@/lib/domain/meta";
import { browsingSimulator } from "@/lib/extension/simulator";
import { Button } from "@/components/ui/button";
import { AvatarStack, Chip, Segmented, Tip } from "@/components/ui/primitives";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Pop } from "@/components/ui/overlay";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { UserMenu } from "@/components/shell/AppHeader";
import { useGraphStore } from "@/stores/graph";
import { filtersActive, useUiStore } from "@/stores/ui";
import { sessionElapsed, useSessionStore } from "@/stores/session";
import { useCollabStore, useSignalsStore } from "@/stores/collab";
import { useAuthStore } from "@/stores/auth";
import { createNode, layoutTree, reorganizeWorkspace, type TreeDirection } from "@/features/graph/actions";
import { Canvas } from "@/features/canvas/Canvas";
import { NodePanel } from "@/features/panels/NodePanel";
import { ActivityPanel, ConflictPanel, EdgePanel, InboxPanel, MemoryPanel, RadarPanel } from "@/features/panels/SidePanels";
import { GridView, ListView, TimelineView } from "@/features/views/Views";
import { CommandPalette } from "@/features/search/CommandPalette";
import { AddPageDialog, CompareDialog, ExportDialog, ShareDialog, ShortcutsDialog, StopSessionDialog } from "./Dialogs";
import { useWorkspace } from "./useWorkspace";
import { qk } from "@/features/workspaces/hooks";


/* ---------------------------------------------------------------- session controls (F4 / sessions) */

function useSessionControls(workspaceId: string) {
  const qc = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);
  const [busy, setBusy] = useState(false);
  const wrap = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      toast.apiError(e);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return {
    session,
    busy,
    start: () =>
      wrap(async () => {
        const s = await sessionApi.start(workspaceId);
        setSession(s);
        browsingSimulator.start(workspaceId, s.id);
        toast.success("Tracking started", { description: "Browse normally — research pages become nodes automatically (demo browsing simulated)." });
        void qc.invalidateQueries({ queryKey: qk.sessions(workspaceId) });
      }),
    pause: () =>
      wrap(async () => {
        if (!session) return;
        browsingSimulator.pause();
        setSession(await sessionApi.pause(session.id));
        toast.info("Tracking paused");
      }),
    resume: () =>
      wrap(async () => {
        if (!session) return;
        setSession(await sessionApi.resume(session.id));
        browsingSimulator.resume();
        toast.info("Tracking resumed");
      }),
    stop: async () =>
      (await wrap(async () => {
        if (!session) return null;
        const tabs = browsingSimulator.openTabs();
        browsingSimulator.stop();
        const s = await sessionApi.stop(session.id, tabs);
        setSession(null);
        toast.success("Tracking stopped", { description: `${s.title} saved` });
        void qc.invalidateQueries({ queryKey: qk.sessions(workspaceId) });
        return s.id;
      })) ?? null,
  };
}

function TrackingControl({ workspaceId, readOnly }: { workspaceId: string; readOnly: boolean }) {
  const c = useSessionControls(workspaceId);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = c.session;
  if (readOnly) return null;
  return (
    <>
      {!s ? (
        <Button variant="purple" size="sm" onClick={() => void c.start()} loading={c.busy}>
          <Record size={16} weight="fill" /> <span className="hidden sm:inline">Start Tracking</span><span className="sm:hidden">Track</span>
        </Button>
      ) : (
        <div className={cn("flex items-center gap-1 rounded-full border-2 border-ink py-1 pl-3 pr-1 shadow-pop", s.state === "paused" ? "bg-sun-soft" : "bg-coral-soft")} role="status" aria-live="polite">
          <span className={cn("h-2.5 w-2.5 rounded-full", s.state === "paused" ? "bg-warning" : "animate-pulse bg-danger")} />
          <span className="text-xs font-bold">{s.state === "paused" ? "Paused" : "Tracking"}</span>
          <span className="tabular ml-1 hidden font-mono text-xs font-bold sm:inline">{formatClock(sessionElapsed(s))}</span>
          <Tip label={s.state === "paused" ? "Resume" : "Pause"}>
            <button aria-label={s.state === "paused" ? "Resume tracking" : "Pause tracking"} onClick={() => void (s.state === "paused" ? c.resume() : c.pause())} className="ml-1 grid h-7 w-7 place-items-center rounded-full bg-white hover:bg-canvas">
              {s.state === "paused" ? <Play size={13} weight="fill" /> : <Pause size={13} weight="fill" />}
            </button>
          </Tip>
          <Tip label="Stop tracking">
            <button aria-label="Stop tracking" onClick={() => useUiStore.getState().setDialog("stop-session")} className="grid h-7 w-7 place-items-center rounded-full bg-ink text-white hover:bg-danger">
              <Stop size={13} weight="fill" />
            </button>
          </Tip>
        </div>
      )}
      <StopSessionDialog workspaceId={workspaceId} sessionId={s?.id ?? null} onStop={c.stop} />
    </>
  );
}

/* ---------------------------------------------------------------- top bar */

const VIEWS: { value: ViewMode; label: string; icon: typeof Graph }[] = [
  { value: "graph", label: "Graph", icon: Graph },
  { value: "focus", label: "Focus", icon: CornersOut },
  { value: "list", label: "List", icon: ListBullets },
  { value: "grid", label: "Grid", icon: SquaresFour },
  { value: "timeline", label: "Timeline", icon: ClockCounterClockwise },
];

function WorkspaceTitle({ readOnly }: { readOnly: boolean }) {
  const ws = useGraphStore((s) => s.workspace);
  const [edit, setEdit] = useState<string | null>(null);
  const qc = useQueryClient();
  if (!ws) return null;
  return edit !== null ? (
    <input
      autoFocus
      aria-label="Workspace name"
      className="h-9 w-56 rounded-full border-2 border-purple bg-white px-3 font-display text-sm font-bold outline-none"
      value={edit}
      onChange={(e) => setEdit(e.target.value)}
      onBlur={async () => {
        const v = edit.trim();
        setEdit(null);
        if (!v || v === ws.title) return;
        try {
          const w = await workspaceApi.update(ws.id, { title: v });
          useGraphStore.getState().setWorkspace({ ...ws, title: w.title });
          void qc.invalidateQueries({ queryKey: qk.workspaces });
          toast.success("Workspace renamed");
        } catch (e) {
          toast.apiError(e);
        }
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  ) : (
    <button onDoubleClick={() => !readOnly && setEdit(ws.title)} title={readOnly ? ws.title : "Double-click to rename"} className="min-w-0 truncate text-left font-display text-[15px] font-bold tracking-tight">
      {ws.title}
    </button>
  );
}

function SocketBadge() {
  const status = useCollabStore((s) => s.socketStatus);
  if (status === "open") return <Tip label="Live updates connected"><span className="hidden items-center text-success sm:flex"><WifiHigh size={18} weight="bold" /></span></Tip>;
  return (
    <span role="status" className="flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-[11px] font-bold text-warning">
      <WifiSlash size={14} weight="bold" /> {status === "connecting" ? "Connecting…" : status === "reconnecting" ? "Connection lost · retrying" : "Offline"}
    </span>
  );
}

function BranchSwitcher() {
  const branch = useUiStore((s) => s.branch);
  const branches = useGraphStore((s) => s.branches);
  const me = useAuthStore((s) => s.user);
  const mine = branches.find((b) => b.kind === "personal" && b.owner_id === me?.id);
  const opts: { v: BranchView; label: string }[] = [
    { v: "main,mine", label: "Main + my branch" },
    { v: "main", label: "Main" },
    ...(mine ? [{ v: "mine" as BranchView, label: "My branch" }] : []),
    { v: "all", label: "All branches" },
    ...branches.filter((b) => b.kind !== "main" && b.id !== mine?.id).map((b) => ({ v: b.id as BranchView, label: `Main + ${b.name}` })),
  ];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold shadow-clay-sm" aria-label="Switch branch">
          <GitBranch size={15} weight="bold" /> <span className="hidden max-w-32 truncate lg:inline">{opts.find((o) => o.v === branch)?.label ?? "Branch"}</span>
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Branch view</MenuLabel>
        {opts.map((o) => (
          <MenuItem key={o.v} onSelect={() => useUiStore.getState().setBranch(o.v)}>
            <span className={cn("h-2 w-2 rounded-full", branch === o.v ? "bg-purple" : "bg-transparent")} /> {o.label}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => useUiStore.getState().setDialog("compare")}><GitBranch size={16} weight="bold" /> Compare & merge…</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function PanelButton({ panel, icon: I, label, count, tone }: { panel: Exclude<PanelKind, null>; icon: typeof Target; label: string; count?: number; tone?: string }) {
  const active = useUiStore((s) => s.panel === panel);
  return (
    <Tip label={label}>
      <button
        aria-label={label}
        aria-pressed={active}
        onClick={() => useUiStore.getState().togglePanel(panel)}
        className={cn("relative grid h-9 w-9 place-items-center rounded-full transition", active ? "bg-pill text-white" : "bg-white shadow-clay-sm hover:-translate-y-0.5")}
      >
        <I size={17} weight={active ? "fill" : "bold"} />
        {!!count && <span className={cn("absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-white px-0.5 text-[9px] font-extrabold text-white", tone ?? "bg-coral")}>{count}</span>}
      </button>
    </Tip>
  );
}

function TopBar({ workspaceId, readOnly }: { workspaceId: string; readOnly: boolean }) {
  const viewMode = useUiStore((s) => s.viewMode);
  const presence = useCollabStore((s) => s.presence);
  const conflicts = useSignalsStore((s) => s.conflicts.filter((c) => c.status === "open").length);
  const radar = useSignalsStore((s) => s.radar?.items.filter((i) => i.status === "open").length ?? 0);
  const inbox = useGraphStore((s) => s.nodes.filter((n) => n.data.node.status === "inbox").length);
  const jobsRunning = useSessionStore((s) => s.jobs.length > 0 && s.jobs[0]!.status === "running");
  const router = useRouter();
  const lastSession = useSessionStore((s) => s.session);

  return (
    <header className="z-30 flex h-14 w-full shrink-0 items-center justify-between border-b border-ink/5 bg-canvas/90 px-3 backdrop-blur-md sm:px-4">
      {/* Left cluster */}
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <Link href="/workspaces" aria-label="Back to workspaces" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white shadow-clay-sm hover:-translate-y-0.5 transition">
          <ArrowLeft size={16} weight="bold" />
        </Link>
        <div className="flex min-w-0 max-w-[140px] items-center gap-1.5 sm:max-w-[200px] md:max-w-[240px]">
          <WorkspaceTitle readOnly={readOnly} />
          {readOnly && <span className="shrink-0 rounded-full bg-sky-soft px-2 py-0.5 text-[10px] font-bold text-sky-deep">View only</span>}
        </div>
        <TrackingControl workspaceId={workspaceId} readOnly={readOnly} />
      </div>

      {/* Center cluster: view switchers on desktop */}
      <div className="hidden lg:flex shrink-0 items-center justify-center">
        <Segmented layoutId="view-pill" size="xs" value={viewMode} onChange={(v) => useUiStore.getState().setViewMode(v)} options={VIEWS.map((v) => ({ ...v, label: v.label }))} />
      </div>

      {/* Right cluster */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button onClick={() => useUiStore.getState().setSearchOpen(true)} className="hidden 2xl:flex h-9 w-36 items-center gap-2 rounded-full bg-white px-3 text-left text-xs font-semibold text-faint shadow-clay-sm hover:text-ink transition" aria-label="Search (Ctrl+K)">
          <MagnifyingGlass size={15} weight="bold" /> Search… <kbd className="ml-auto rounded-md bg-canvas px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
        </button>
        <Tip label="Search (Ctrl+K)">
          <Button size="icon-sm" variant="secondary" className="2xl:hidden" aria-label="Search" onClick={() => useUiStore.getState().setSearchOpen(true)}><MagnifyingGlass size={16} weight="bold" /></Button>
        </Tip>

        <div className="hidden sm:flex items-center gap-1">
          <PanelButton panel="radar" icon={Target} label="Research Radar (R)" count={radar} tone="bg-danger" />
          <PanelButton panel="conflicts" icon={Sword} label="Conflict Radar (C)" count={conflicts} />
          <PanelButton panel="memory" icon={Brain} label="Research Memory" />
          <PanelButton panel="activity" icon={jobsRunning ? Robot : Robot} label="AI activity" />
          {inbox > 0 && <PanelButton panel="inbox" icon={Tray} label="Inbox (not research)" count={inbox} tone="bg-sky-deep" />}
        </div>

        <BranchSwitcher />

        <div className="hidden xl:flex items-center gap-1.5">
          <AvatarStack people={presence.map((p) => ({ name: p.name, color: p.color, online: true }))} size={28} max={3} />
          <SocketBadge />
        </div>

        <Button size="sm" variant="outline" className="hidden sm:inline-flex shadow-clay-sm" onClick={() => useUiStore.getState().setDialog("share")}>
          <ShareNetwork size={15} weight="bold" /> Share
        </Button>

        <UserMenu />

        <Menu>
          <MenuTrigger asChild>
            <Button size="icon-sm" variant="secondary" aria-label="More actions"><DotsThreeOutline size={16} weight="fill" /></Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => useUiStore.getState().setDialog("share")}><ShareNetwork size={17} weight="bold" /> Share…</MenuItem>
            <MenuItem onSelect={() => useUiStore.getState().setDialog("export")}><Export size={17} weight="bold" /> Export…</MenuItem>
            <MenuItem onSelect={async () => {
              const list = await sessionApi.list(workspaceId).catch(() => []);
              const id = lastSession?.id ?? list[0]?.id;
              if (id) router.push(`/w/${workspaceId}/report/${id}`);
              else toast.info("No sessions yet", { description: "Start Tracking to record a session first." });
            }}><ChartBar size={17} weight="bold" /> Session report</MenuItem>
            <MenuItem onSelect={() => useUiStore.getState().setDialog("compare")}><GitBranch size={17} weight="bold" /> Compare branches</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => useUiStore.getState().setDialog("shortcuts")}><Keyboard size={17} weight="bold" /> Keyboard shortcuts</MenuItem>
            <MenuItem onSelect={() => router.push("/settings")}><Robot size={17} weight="bold" /> Extension & MCP settings</MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- floating canvas toolbar */

function Filters() {
  const f = useUiStore((s) => s.filters);
  const set = useUiStore((s) => s.setFilters);
  const tags = useGraphStore((s) => s.tags);
  const categories = useGraphStore((s) => s.categories);
  const pages = useGraphStore((s) => s.pages);
  const domains = [...new Set(Object.values(pages).map((p) => p.domain))].sort();
  const types = [...new Set(Object.values(pages).map((p) => p.page_type).filter(Boolean))] as NonNullable<(typeof pages)[string]["page_type"]>[];
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto">
      <div className="flex items-center justify-between"><p className="text-sm font-bold">Filters</p><button className="text-xs font-bold text-purple-deep" onClick={() => useUiStore.getState().clearFilters()}>Clear</button></div>
      <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Tags</p><div className="flex flex-wrap gap-1">{tags.map((t) => <Chip key={t.id} selected={f.tag_ids.includes(t.id)} onClick={() => set({ tag_ids: toggle(f.tag_ids, t.id) })}>{t.name}</Chip>)}</div></div>
      <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Categories</p><div className="flex flex-wrap gap-1">{categories.map((c) => <Chip key={c.id} selected={f.category_ids.includes(c.id)} onClick={() => set({ category_ids: toggle(f.category_ids, c.id) })}>{c.name}</Chip>)}</div></div>
      <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Page type</p><div className="flex flex-wrap gap-1">{types.map((t) => <Chip key={t} selected={f.page_types.includes(t)} onClick={() => set({ page_types: toggle(f.page_types, t) })}>{PAGE_TYPE_LABEL[t]}</Chip>)}</div></div>
      <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Domain</p><div className="flex flex-wrap gap-1">{domains.map((d) => <Chip key={d} selected={f.domains.includes(d)} onClick={() => set({ domains: toggle(f.domains, d) })}>{d}</Chip>)}</div></div>
      <div className="space-y-1 border-t border-line pt-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-purple" checked={f.show_suggested} onChange={(e) => set({ show_suggested: e.target.checked })} /> Show AI suggestions</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-purple" checked={f.show_weak} onChange={(e) => set({ show_weak: e.target.checked })} /> Show weak suggestions (&lt;50%)</label>
      </div>
    </div>
  );
}

const COLOR_BY: { v: ColorBy; label: string }[] = [
  { v: "topic", label: "Topic" },
  { v: "source", label: "Source" },
  { v: "importance", label: "Importance" },
  { v: "page_type", label: "Page type" },
  { v: "collaborator", label: "Collaborator" },
  { v: "branch", label: "Branch" },
];

function ToolBtn({ label, icon: I, onClick, active, iconClass }: { label: string; icon: typeof Plus; onClick: () => void; active?: boolean; iconClass?: string }) {
  return (
    <Tip label={label} side="right">
      <button aria-label={label} aria-pressed={active} onClick={onClick} className={cn("grid h-10 w-10 place-items-center rounded-full transition", active ? "bg-pill text-white" : "hover:bg-white")}>
        <I size={18} weight="bold" className={iconClass} />
      </button>
    </Tip>
  );
}

function CanvasToolbar({ readOnly }: { readOnly: boolean }) {
  const [treeDir, setTreeDir] = useState<TreeDirection | null>(null);
  const rf = useReactFlow();
  const colorBy = useUiStore((s) => s.colorBy);
  const f = useUiStore((s) => s.filters);
  const journey = useUiStore((s) => s.journeyOverlay);
  const [busy, setBusy] = useState(false);
  const center = () => {
    const el = document.querySelector(".react-flow")!.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: el.left + el.width / 2 - 120, y: el.top + el.height / 2 - 60 });
  };
  return (
    <div className="absolute left-4 top-4 z-10 flex flex-col gap-1 rounded-[24px] bg-white p-1 shadow-clay-sm" role="toolbar" aria-label="Canvas tools">
      {!readOnly && (
        <Menu>
          <MenuTrigger asChild>
            <button aria-label="Add node" className="grid h-10 w-10 place-items-center rounded-full bg-purple text-white"><Plus size={18} weight="bold" /></button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuLabel>Add to canvas</MenuLabel>
            <MenuItem onSelect={() => useUiStore.getState().setDialog("add-page")}><Graph size={17} weight="bold" /> Page (URL)…</MenuItem>
            <MenuItem onSelect={() => void createNode("note", center())}><NotePencil size={17} weight="bold" /> Note</MenuItem>
            <MenuItem onSelect={() => void createNode("question", center())}><Question size={17} weight="bold" /> Question</MenuItem>
            <MenuItem onSelect={() => void createNode("finding", center())}><Lightbulb size={17} weight="bold" /> Finding</MenuItem>
            <MenuItem onSelect={() => void createNode("topic", center())}><SquaresFour size={17} weight="bold" /> Topic group</MenuItem>
          </MenuContent>
        </Menu>
      )}
      {!readOnly && <ToolBtn label="Re-organize with AI (groups unlocked pages)" icon={busy ? ArrowsClockwise : MagicWand} onClick={async () => { setBusy(true); await reorganizeWorkspace(); setBusy(false); }} />}
      {!readOnly && (
        <div className="flex flex-col gap-0.5 rounded-full bg-canvas p-0.5" role="radiogroup" aria-label="Tree layout">
          <ToolBtn label="Horizontal tree (left → right)" icon={TreeStructure} iconClass="-rotate-90" active={treeDir === "LR"} onClick={() => { setTreeDir("LR"); void layoutTree("LR"); }} />
          <ToolBtn label="Vertical tree (top → down)" icon={TreeStructure} active={treeDir === "TB"} onClick={() => { setTreeDir("TB"); void layoutTree("TB"); }} />
        </div>
      )}
      <Pop align="start" className="w-80" trigger={<button aria-label="Filters" className={cn("relative grid h-10 w-10 place-items-center rounded-full", filtersActive(f) ? "bg-pill text-white" : "hover:bg-canvas")}><Funnel size={18} weight="bold" /></button>}>
        <Filters />
      </Pop>
      <Pop align="start" className="w-56" trigger={<button aria-label="Colour by" className="grid h-10 w-10 place-items-center rounded-full hover:bg-canvas"><span className="h-4 w-4 rounded-full bg-[conic-gradient(#7b5cf0,#f08a6c,#fad47f,#d0e8ba,#c4def8,#7b5cf0)]" /></button>}>
        <p className="mb-2 text-sm font-bold">Color by</p>
        <div className="flex flex-wrap gap-1">{COLOR_BY.map((c) => <Chip key={c.v} selected={colorBy === c.v} onClick={() => useUiStore.getState().setColorBy(c.v)}>{c.label}</Chip>)}</div>
        <p className="mt-2 text-[11px] text-muted">The coloured bar on top of each node shows this.</p>
      </Pop>
      <ToolBtn label="Journey line (visit order)" icon={ClockCounterClockwise} active={journey} onClick={() => useUiStore.getState().toggleJourney()} />
    </div>
  );
}

function AiTicker() {
  const job = useSessionStore((s) => s.jobs[0]);
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  const visible = !!job && job.id !== hiddenId;
  useEffect(() => {
    if (!job) return;
    const t = setTimeout(() => setHiddenId(job.id), 4500);
    return () => clearTimeout(t);
  }, [job]);
  return (
    <AnimatePresence>
      {job && visible && (
        <motion.button
          key={job.id}
          onClick={() => useUiStore.getState().openPanel("activity")}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-bold shadow-pop"
          aria-live="polite"
        >
          <span className={cn("grid h-6 w-6 place-items-center rounded-full text-[10px]", job.status === "running" ? "bg-lavender" : job.status === "failed" ? "bg-pink" : "bg-mint")}>{job.agent ? `A${job.agent}` : "AI"}</span>
          {job.message}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------- panel drawer */

const PANEL_TITLE: Record<Exclude<PanelKind, null>, string> = {
  node: "Details",
  edge: "Why are these connected?",
  radar: "Research Radar",
  conflicts: "Conflict Radar",
  memory: "Research Memory",
  branches: "Branches",
  inbox: "Inbox",
  activity: "AI activity",
};

function PanelDrawer({ workspaceId, readOnly }: { workspaceId: string; readOnly: boolean }) {
  const panel = useUiStore((s) => s.panel);
  const nodeId = useUiStore((s) => s.selectedNodeId);
  const edgeId = useUiStore((s) => s.selectedEdgeId);
  const show = panel && !(panel === "node" && !nodeId) && !(panel === "edge" && !edgeId);
  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          key="panel"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="absolute inset-x-2 bottom-2 top-auto z-20 flex max-h-[70dvh] flex-col rounded-[28px] border-2 border-ink bg-canvas shadow-pop-lg md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:max-h-none md:w-[400px]"
          aria-label={PANEL_TITLE[panel!]}
        >
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h2 className="font-display text-base font-bold">{PANEL_TITLE[panel!]}</h2>
            <button aria-label="Close panel" onClick={() => { useUiStore.getState().openPanel(null); }} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-clay-sm transition hover:rotate-90"><X size={16} weight="bold" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {panel === "node" && nodeId && <NodePanel key={nodeId} nodeId={nodeId} readOnly={readOnly} />}
            {panel === "edge" && edgeId && <EdgePanel key={edgeId} edgeId={edgeId} readOnly={readOnly} />}
            {panel === "radar" && <RadarPanel workspaceId={workspaceId} readOnly={readOnly} />}
            {panel === "conflicts" && <ConflictPanel workspaceId={workspaceId} readOnly={readOnly} />}
            {panel === "memory" && <MemoryPanel workspaceId={workspaceId} />}
            {panel === "activity" && <ActivityPanel />}
            {panel === "inbox" && <InboxPanel readOnly={readOnly} />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------- keyboard shortcuts */

function useShortcuts(readOnly: boolean) {
  const rf = useReactFlow();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const ui = useUiStore.getState();
      const views: Record<string, ViewMode> = { "1": "graph", "2": "focus", "3": "list", "4": "grid", "5": "timeline" };
      if (views[e.key]) ui.setViewMode(views[e.key]!);
      else if (e.key === "Escape") { ui.openPanel(null); ui.selectNode(null, false); }
      else if (e.key === "?") ui.setDialog("shortcuts");
      else if (e.key.toLowerCase() === "r") ui.togglePanel("radar");
      else if (e.key.toLowerCase() === "c") ui.togglePanel("conflicts");
      else if (e.key.toLowerCase() === "n" && !readOnly && ui.viewMode === "graph") {
        const el = document.querySelector(".react-flow")?.getBoundingClientRect();
        if (el) void createNode("note", rf.screenToFlowPosition({ x: el.left + el.width / 2, y: el.top + el.height / 2 }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rf, readOnly]);
}

/* ---------------------------------------------------------------- screen */

function FocusBar() {
  const rf = useReactFlow();
  const focusId = useUiStore((s) => s.focusNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const topics = useGraphStore(useShallow((s) => s.nodes.filter((n) => n.type === "topic")));

  const handleSelectTopic = (id: string | null) => {
    useUiStore.getState().setFocusNode(id);
    if (id) {
      const targetNodes = nodes.filter((n) => n.id === id || n.parentId === id);
      if (targetNodes.length > 0) {
        rf.fitView({ nodes: targetNodes, duration: 600, padding: 0.3 });
      } else {
        rf.fitView({ nodes: [{ id }], duration: 600, padding: 0.4 });
      }
    } else {
      rf.fitView({ duration: 600, padding: 0.1 });
    }
  };

  return (
    <div className="absolute left-1/2 top-4 z-10 flex max-w-[92%] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-full border-2 border-ink bg-white/95 px-3 py-1.5 text-xs font-bold shadow-pop backdrop-blur-md">
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-purple px-2 py-0.5 text-[11px] font-extrabold text-white">
          <CornersOut size={12} weight="bold" /> Focus
        </span>
        <button
          onClick={() => {
            useUiStore.getState().setFocusNode(null);
            useUiStore.getState().setViewMode("graph");
            rf.fitView({ duration: 500, padding: 0.1 });
          }}
          className="whitespace-nowrap text-[11px] text-muted hover:text-purple-deep hover:underline"
        >
          Full graph
        </button>
      </div>

      <span className="shrink-0 text-line">|</span>

      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
        <button
          onClick={() => handleSelectTopic(null)}
          className={cn(
            "whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition",
            !focusId ? "bg-ink text-white font-extrabold shadow-sm" : "bg-canvas text-ink-soft hover:bg-lavender-soft"
          )}
        >
          All Topics
        </button>

        {topics.map((t) => {
          const isSelected = t.id === focusId;
          const childCount = nodes.filter((n) => n.parentId === t.id).length;
          return (
            <button
              key={t.id}
              onClick={() => handleSelectTopic(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition",
                isSelected
                  ? "bg-purple text-white font-extrabold shadow-sm ring-2 ring-purple-deep"
                  : "bg-canvas text-ink-soft hover:bg-lavender-soft hover:text-ink"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", isSelected ? "bg-sun" : "bg-purple/60")} />
              <span>{t.data.node.title}</span>
              {childCount > 0 && (
                <span className={cn("rounded-full px-1.5 py-0.2 text-[10px] font-bold", isSelected ? "bg-white/20 text-white" : "bg-white text-muted")}>
                  {childCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {focusId && (
        <button
          onClick={() => handleSelectTopic(null)}
          aria-label="Clear focus filter"
          title="Show all topics"
          className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-canvas text-faint hover:bg-coral-soft hover:text-danger"
        >
          <X size={12} weight="bold" />
        </button>
      )}
    </div>
  );
}

function Inner({ workspaceId }: { workspaceId: string }) {
  const graph = useWorkspace(workspaceId);
  const viewMode = useUiStore((s) => s.viewMode);
  const role = useGraphStore((s) => s.workspace?.my_role);
  const loaded = useGraphStore((s) => s.loaded);
  const empty = useGraphStore((s) => s.nodes.length === 0);
  const tracking = useSessionStore((s) => !!s.session);
  const readOnly = role === "viewer";
  useShortcuts(readOnly);

  if (graph.error && !loaded)
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <ErrorState error={graph.error} title={(graph.error as { code?: string }).code === "not_found" ? "Workspace not found" : undefined} onRetry={() => void graph.refetch()} />
        <div className="mt-4 text-center"><Link href="/workspaces" className="text-sm font-bold text-purple-deep">← Back to workspaces</Link></div>
      </div>
    );
  if (!loaded) return <LoadingBlock label="Loading graph…" className="h-dvh" />;

  return (
    <div className="flex h-dvh flex-col bg-dots">
      <TopBar workspaceId={workspaceId} readOnly={readOnly} />
      <div className="lg:hidden shrink-0 border-b border-ink/5 bg-canvas px-3 py-1.5">
        <Segmented layoutId="view-pill-m" size="xs" value={viewMode} onChange={(v) => useUiStore.getState().setViewMode(v)} options={VIEWS} className="w-full justify-between overflow-x-auto" />
      </div>
      <main className="relative min-h-0 flex-1">
        {(viewMode === "graph" || viewMode === "focus") && (
          <>
            <Canvas readOnly={readOnly} />
            <CanvasToolbar readOnly={readOnly} />
            {viewMode === "focus" && <FocusBar />}
            {empty && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
                <div className="pointer-events-auto max-w-md">
                  <EmptyState
                    icon={Graph}
                    title={tracking ? "Listening for research…" : "Start Tracking and browse normally."}
                    message={tracking ? "Research pages you stay on appear here as nodes within seconds." : "Pages you read become nodes, grouped into topics and connected with explained relationships."}
                    action={!readOnly && !tracking ? <Button variant="secondary" onClick={() => useUiStore.getState().setDialog("add-page")}><Plus size={16} weight="bold" /> Add a page manually</Button> : undefined}
                  />
                </div>
              </div>
            )}
            <AiTicker />
          </>
        )}
        {viewMode === "list" && <ListView />}
        {viewMode === "grid" && <GridView />}
        {viewMode === "timeline" && <TimelineView workspaceId={workspaceId} />}
        <PanelDrawer workspaceId={workspaceId} readOnly={readOnly} />
      </main>
      <CommandPalette workspaceId={workspaceId} />
      <ShareDialog workspaceId={workspaceId} isOwner={role === "owner"} />
      <ExportDialog workspaceId={workspaceId} />
      <CompareDialog workspaceId={workspaceId} canMerge={role !== "viewer"} />
      <AddPageDialog workspaceId={workspaceId} />
      <ShortcutsDialog />
    </div>
  );
}

export function WorkspaceScreen({ workspaceId }: { workspaceId: string }) {
  return (
    <ReactFlowProvider>
      <Inner workspaceId={workspaceId} />
    </ReactFlowProvider>
  );
}
