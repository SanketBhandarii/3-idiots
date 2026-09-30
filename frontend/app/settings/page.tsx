"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowCounterClockwise, Plug, PuzzlePiece, Robot, Trash, Wrench } from "@phosphor-icons/react";
import type { CreatedToken } from "@/types/api";
import { tokensApi } from "@/lib/api";
import { API_BASE_URL, API_MODE } from "@/lib/api/config";
import { detectExtension } from "@/lib/extension/bridge";
import { toast } from "@/lib/toast";
import { timeAgo } from "@/lib/utils/format";
import { AuthGate } from "@/components/shell/AuthGate";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/button";
import { ArtTile, Avatar, Card, CopyField, Kicker, Pill, Switch } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useAuthStore } from "@/stores/auth";
import { useExtensionStore } from "@/stores/extension";

function DemoControls() {
  const router = useRouter();
  const [ctl, setCtl] = useState<{ latency: number; offline: boolean; aiOutage: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    void import("@/mock/core").then((m) => setCtl({ ...m.mockControls }));
  }, []);
  const update = async (patch: Partial<NonNullable<typeof ctl>>) => {
    const m = await import("@/mock/core");
    Object.assign(m.mockControls, patch);
    setCtl({ ...m.mockControls });
  };
  if (!ctl) return null;
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3"><ArtTile icon={Wrench} tone="sun" /><div><h2 className="text-lg font-bold">Demo controls</h2><p className="text-sm text-muted">The backend is simulated in your browser (NEXT_PUBLIC_API_MODE=mock). Use these to demo loading and error states.</p></div></div>
      <div className="mt-5 space-y-4">
        <label className="flex items-center justify-between gap-4"><span><span className="block text-sm font-bold">Simulate API unavailable</span><span className="text-xs text-muted">Every request fails with “Connection lost”.</span></span><Switch label="Simulate API unavailable" checked={ctl.offline} onCheckedChange={(v) => void update({ offline: v })} /></label>
        <label className="flex items-center justify-between gap-4"><span><span className="block text-sm font-bold">Simulate AI outage</span><span className="text-xs text-muted">Pages still appear; connections fall back to embedding-only.</span></span><Switch label="Simulate AI outage" checked={ctl.aiOutage} onCheckedChange={(v) => void update({ aiOutage: v })} /></label>
        <label className="block"><span className="text-sm font-bold">Network latency: {ctl.latency} ms</span><input type="range" min={0} max={2000} step={50} value={ctl.latency} onChange={(e) => void update({ latency: Number(e.target.value) })} className="mt-2 w-full accent-purple" aria-label="Latency" /></label>
        <Button variant="danger" size="sm" onClick={() => setConfirm(true)}><ArrowCounterClockwise size={16} weight="bold" /> Reset demo data</Button>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} danger title="Reset demo data?" confirmLabel="Reset" message="All mock data in this browser returns to the seeded demo. You will be signed out." onConfirm={async () => {
        const m = await import("@/mock/core");
        m.resetDb();
        const db = await import("@/mock/db");
        db.sessionCookie.set(null);
        useAuthStore.setState({ user: null, status: "unauthenticated" });
        router.replace("/login");
      }} />
    </Card>
  );
}

function Settings() {
  const user = useAuthStore((s) => s.user)!;
  const qc = useQueryClient();
  const { connected, simulated, setConnected, setSimulated } = useExtensionStore();
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: tokensApi.list });
  const [fresh, setFresh] = useState<CreatedToken | null>(null);
  const create = useMutation({ mutationFn: (k: "extension" | "mcp") => tokensApi.create(k, k === "mcp" ? "Claude Desktop" : "Chrome extension"), onSuccess: (t) => { setFresh(t); void qc.invalidateQueries({ queryKey: ["tokens"] }); toast.success("Token created", { description: "Copy it now — it is shown once." }); }, onError: (e) => toast.apiError(e) });
  const revoke = useMutation({ mutationFn: tokensApi.revoke, onSuccess: () => { void qc.invalidateQueries({ queryKey: ["tokens"] }); toast.info("Token revoked"); } });
  const mcpUrl = `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}${API_BASE_URL}/mcp`;

  return (
    <div className="min-h-dvh bg-dots pb-28 md:pb-12">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-8 sm:px-6">
        <div><Kicker tone="lavender">Settings</Kicker><h1 className="mt-3 text-[1.875rem] font-extrabold">Profile & connections</h1></div>
        <Card className="flex items-center gap-4 p-6"><Avatar name={user.name} color={user.avatar_color} size={56} /><div><p className="text-lg font-bold">{user.name}</p><p className="text-sm text-muted">{user.email}</p></div></Card>

        <Card className="p-6">
          <div className="flex items-center gap-3"><ArtTile icon={PuzzlePiece} tone="mint" /><div className="flex-1"><h2 className="text-lg font-bold">Chrome extension</h2><p className="text-sm text-muted">Tracks tabs and time, captures pages and previews, powers Go to tab.</p></div><Pill tone={connected ? "mint" : "ink"}>{connected ? "Connected" : "Not connected"}</Pill></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={async () => { const ok = await detectExtension(); setConnected(ok); if (ok) toast.success("Extension connected"); else toast.warning("Extension not found", { description: "Install it unpacked and set NEXT_PUBLIC_EXTENSION_ID." }); }}><Plug size={16} weight="bold" /> Connect extension</Button>
            <Button variant="secondary" size="sm" loading={create.isPending} onClick={() => create.mutate("extension")}>Create extension token</Button>
          </div>
          <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-canvas p-3"><span><span className="block text-sm font-bold">Use browsing simulator (demo)</span><span className="text-xs text-muted">While tracking, a scripted research journey stands in for the extension.</span></span><Switch label="Use browsing simulator" checked={simulated} onCheckedChange={setSimulated} /></label>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3"><ArtTile icon={Robot} tone="purple" /><div><h2 className="text-lg font-bold">Connect an AI assistant (MCP)</h2><p className="text-sm text-muted">Claude and other MCP tools can search your workspaces and add sources — into the “AI Agent” branch for your review.</p></div></div>
          <Button variant="purple" size="sm" className="mt-4" loading={create.isPending} onClick={() => create.mutate("mcp")}>Create MCP token</Button>
          {fresh && (
            <div className="mt-4 space-y-2 rounded-2xl border-2 border-dashed border-purple/40 bg-lavender-soft/50 p-4">
              <p className="text-xs font-bold text-purple-deep">New {fresh.kind} token — shown once</p>
              <CopyField value={fresh.token} />
              {fresh.kind === "mcp" && <CopyField value={`claude mcp add --transport http research-map ${mcpUrl} --header "Authorization: Bearer ${fresh.token}"`} label="Copy command" />}
            </div>
          )}
          <ul className="mt-4 divide-y divide-line">
            {tokens.data?.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2 text-sm"><Pill tone={t.kind === "mcp" ? "purple" : "mint"}>{t.kind}</Pill><span className="flex-1 font-semibold">{t.name}</span><span className="text-xs text-muted">created {timeAgo(t.created_at)}</span><Button size="icon-sm" variant="ghost" aria-label="Revoke token" onClick={() => revoke.mutate(t.id)}><Trash size={16} /></Button></li>
            ))}
          </ul>
        </Card>
        {API_MODE === "mock" && <DemoControls />}
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return <AuthGate><Settings /></AuthGate>;
}
