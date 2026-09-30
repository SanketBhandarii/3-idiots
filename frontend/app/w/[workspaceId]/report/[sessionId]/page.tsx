"use client";
/** Session Report (F18): Statistics tab (real tracked data only) + Summary tab (AI, cited) + References (F19). */
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, ChartBar, DownloadSimple, FilePdf, Printer, Sparkle, TextAlignLeft } from "@phosphor-icons/react";
import type { ReferenceFormat } from "@/types/api";
import { reportApi, sessionApi, workspaceApi } from "@/lib/api";
import { colorFromString } from "@/lib/domain/meta";
import { formatDateTime, formatDuration, formatTime } from "@/lib/utils/format";
import { downloadText, slugify } from "@/lib/utils/download";
import { toast } from "@/lib/toast";
import { APP_NAME } from "@/lib/api/config";
import { AuthGate } from "@/components/shell/AuthGate";
import { UserMenu } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, Kicker, Pill, Segmented, Select } from "@/components/ui/primitives";
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from "@/components/ui/states";
import { qk } from "@/features/workspaces/hooks";

const PALETTE = ["#7b5cf0", "#f08a6c", "#e0a93a", "#6fae55", "#5b9be0", "#e0716c", "#9d86ee", "#3f8a2e"];
const tooltipStyle = { borderRadius: 14, border: "1px solid #e3e7ef", boxShadow: "0 8px 24px -12px rgba(28,27,43,.25)", fontSize: 12 };

function ChartCard({ title, n, children, className }: { title: string; n: number; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className ?? ""}`}>
      <h3 className="text-base font-bold">{title}</h3>
      <div className="mt-3">{n ? children : <p className="py-10 text-center text-sm text-muted">No tracked data yet</p>}</div>
      <p className="mt-2 text-[11px] text-faint">Based on {n} tracked visits.</p>
    </Card>
  );
}

function Report() {
  const { workspaceId, sessionId } = useParams<{ workspaceId: string; sessionId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"stats" | "summary">("stats");
  const ws = useQuery({ queryKey: ["ws", workspaceId], queryFn: () => workspaceApi.get(workspaceId) });
  const sessions = useQuery({ queryKey: qk.sessions(workspaceId), queryFn: () => sessionApi.list(workspaceId) });
  const stats = useQuery({ queryKey: qk.stats(sessionId), queryFn: () => sessionApi.stats(sessionId) });
  const refs = useQuery({ queryKey: qk.refs(sessionId), queryFn: () => sessionApi.references(sessionId) });
  const report = useQuery({
    queryKey: qk.report(sessionId),
    queryFn: () => reportApi.get(sessionId),
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === "generating" ? 1000 : false),
  });
  const gen = useMutation({
    mutationFn: () => reportApi.generate(sessionId),
    onSuccess: (r) => { qc.setQueryData(qk.report(sessionId), r); toast.ai("Generating report…", { description: "Writing the summary from your tracked data." }); },
    onError: (e) => toast.apiError(e),
  });
  const session = sessions.data?.find((s) => s.id === sessionId);
  const jump = (nodeId: string | null) => nodeId && router.push(`/w/${workspaceId}?node=${nodeId}`);
  const refNode = (n: number) => refs.data?.references.find((r) => r.ref_number === n)?.node_id ?? null;

  const exportRefs = async (format: ReferenceFormat) => {
    try {
      const r = await sessionApi.references(sessionId, format);
      const content = format === "json" ? JSON.stringify(r.references, null, 2) : r.text ?? "";
      downloadText(`${slugify(session?.title ?? "references")}-references.${format === "bibtex" ? "bib" : format}`, content, format === "json" ? "application/json" : "text/plain");
      toast.success("Export completed", { description: `References as ${format.toUpperCase()}` });
    } catch (e) {
      toast.apiError(e);
    }
  };

  const withCitations = (text: string) =>
    text.split(/(\[\d+\])/g).map((part, i) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (!m) return <span key={i}>{part}</span>;
      const n = Number(m[1]);
      return <button key={i} onClick={() => jump(refNode(n))} className="mx-0.5 rounded-md bg-lavender-soft px-1 text-xs font-bold text-purple-deep hover:bg-lavender" title="Jump to source">[{n}]</button>;
    });

  if (stats.error) return <div className="mx-auto max-w-md p-10"><ErrorState error={stats.error} onRetry={() => void stats.refetch()} /></div>;
  const s = stats.data;
  const content = report.data?.content;

  return (
    <div className="min-h-dvh bg-dots-cool pb-16">
      <header className="no-print sticky top-0 z-30 border-b border-ink/5 bg-canvas-cool/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href={`/w/${workspaceId}`} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-clay-sm" aria-label="Back to canvas"><ArrowLeft size={16} weight="bold" /></Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted">{ws.data?.title}</p>
            <h1 className="truncate font-display text-base font-bold">Session report</h1>
          </div>
          <Select aria-label="Session" className="hidden h-9 text-xs sm:block" value={sessionId} onChange={(e) => router.push(`/w/${workspaceId}/report/${e.target.value}`)}>
            {sessions.data?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </Select>
          <Button size="sm" variant="outline" onClick={() => window.print()}><FilePdf size={16} weight="bold" /> <span className="hidden sm:inline">Download PDF</span></Button>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <div className="hidden print:block">
          <p className="text-xs font-bold">{APP_NAME} · {ws.data?.title}</p>
        </div>
        <Kicker tone="mint">{session?.state === "stopped" ? "Session complete" : "Session in progress"}</Kicker>
        <h2 className="mt-3 text-balance text-[1.875rem] font-extrabold leading-tight sm:text-[2.5rem]">{session?.title ?? "Session"}</h2>
        <p className="mt-1 text-sm text-muted">{session && `${formatDateTime(session.started_at)} – ${session.ended_at ? formatTime(session.ended_at) : "now"}`}</p>

        <div className="no-print mt-6"><Segmented layoutId="report-tab" value={tab} onChange={setTab} options={[{ value: "stats", label: "Statistics", icon: ChartBar }, { value: "summary", label: "Summary", icon: TextAlignLeft }]} /></div>

        {(tab === "stats" || typeof window === "undefined") && (
          <section className="mt-6">
            {!s ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28 rounded-[24px]" />)}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                  {[
                    ["Total duration", formatDuration(s.total_duration_ms)],
                    ["Active research", formatDuration(s.active_ms)],
                    ["Pages visited", `${s.pages_visited_research}`, `${s.pages_visited_all} incl. non-research`],
                    ["Topics", `${s.topics_count}`],
                    ["Sources used", `${s.sources_count}`],
                  ].map(([k, v, hint]) => (
                    <Card key={k} className="rounded-[24px] p-4 shadow-clay-sm">
                      <p className="text-xs font-semibold text-muted">{k}</p>
                      <p className="tabular mt-2 font-display text-2xl font-extrabold">{v}</p>
                      {hint && <p className="text-[11px] text-faint">{hint}</p>}
                    </Card>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <ChartCard title="Time per topic" n={s.visit_count}>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={s.time_per_topic.map((t) => ({ name: t.topic, value: Math.round(t.ms / 60000) }))} dataKey="value" innerRadius={60} outerRadius={95} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                          {s.time_per_topic.map((t, i) => <Cell key={t.topic} fill={PALETTE[i % PALETTE.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} min`, "Time"]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">{(() => { const tot = s.time_per_topic.reduce((a, t) => a + t.ms, 0) || 1; return s.time_per_topic.map((t, i) => <li key={t.topic} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{t.topic} <span className="tabular ml-auto font-bold">{Math.round((t.ms / tot) * 100)}%</span></li>); })()}</ul>
                  </ChartCard>
                  <ChartCard title="Time per webpage (top 10)" n={s.visit_count}>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart layout="vertical" data={s.time_per_page.map((p) => ({ name: p.title.slice(0, 28), min: Math.round((p.ms / 60000) * 10) / 10 }))} margin={{ left: 10 }}>
                        <CartesianGrid stroke="#eef1f6" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit=" m" />
                        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f5f1e8" }} />
                        <Bar dataKey="min" fill="#7b5cf0" radius={[0, 8, 8, 0]} maxBarSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Research activity over time" n={s.visit_count}>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={s.activity_over_time.map((b) => ({ t: formatTime(b.bucket_start), min: b.minutes }))}>
                        <CartesianGrid stroke="#eef1f6" vertical={false} />
                        <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="m" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="min" stroke="#f08a6c" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Most visited topics" n={s.visit_count}>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={s.visits_per_topic}>
                        <CartesianGrid stroke="#eef1f6" vertical={false} />
                        <XAxis dataKey="topic" tick={{ fontSize: 10 }} interval={0} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f5f1e8" }} />
                        <Bar dataKey="visits" radius={[8, 8, 0, 0]} maxBarSize={36}>{s.visits_per_topic.map((t, i) => <Cell key={t.topic} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Topic distribution (pages)" n={s.visit_count}>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart><Pie data={s.topic_distribution.map((t) => ({ name: t.topic, value: t.pages }))} dataKey="value" outerRadius={90} label={{ fontSize: 10 }}>{s.topic_distribution.map((t, i) => <Cell key={t.topic} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Domains used" n={s.visit_count}>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={s.domains}><CartesianGrid stroke="#eef1f6" vertical={false} /><XAxis dataKey="domain" tick={{ fontSize: 9 }} interval={0} angle={-20} height={50} textAnchor="end" /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f5f1e8" }} /><Bar dataKey="pages" fill="#5b9be0" radius={[8, 8, 0, 0]} maxBarSize={36} /></BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Visit timeline" n={s.visit_count} className="lg:col-span-2">
                    {(() => {
                      if (!s.visits.length) return null;
                      const st = Date.parse(s.visits[0]!.started_at);
                      const en = Date.parse(s.visits[s.visits.length - 1]!.ended_at);
                      const span = Math.max(1, en - st);
                      return (
                        <div className="relative h-10 rounded-full bg-canvas">
                          {s.visits.map((v, i) => <button key={i} title={`${v.title} · ${v.topic}`} onClick={() => jump(v.node_id)} className="absolute top-1.5 h-7 rounded-full border border-white" style={{ left: `${((Date.parse(v.started_at) - st) / span) * 100}%`, width: `max(4px, ${((Date.parse(v.ended_at) - Date.parse(v.started_at)) / span) * 100}%)`, background: colorFromString(v.topic) }} />)}
                        </div>
                      );
                    })()}
                  </ChartCard>
                </div>
              </>
            )}
          </section>
        )}

        {tab === "summary" && (
          <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-6">
              {report.isLoading ? <LoadingBlock label="Loading report…" /> : !report.data || report.data.status === "failed" ? (
                <EmptyState compact icon={Sparkle} title={report.data?.status === "failed" ? "AI unavailable — try again later" : "No summary yet"} message="The summary is written from your tracked data only, with [n] citations to the references." action={<Button variant="purple" loading={gen.isPending} onClick={() => gen.mutate()}><Sparkle size={16} weight="fill" /> Generate Session Report</Button>} />
              ) : report.data.status === "generating" ? (
                <LoadingBlock label="Generating report… (Agent writing summary)" />
              ) : content && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone="lavender"><Sparkle size={10} weight="fill" /> AI-generated · {report.data.model}</Pill>
                    <Button size="xs" variant="ghost" className="no-print" onClick={() => gen.mutate()}>Regenerate</Button>
                  </div>
                  <div><h3 className="text-lg font-bold">Research overview</h3><p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{withCitations(content.summary)}</p></div>
                  <div><h3 className="text-lg font-bold">Major topics</h3><ul className="mt-2 space-y-1.5">{content.topics.map((t) => <li key={t.name} className="flex items-center gap-3 text-sm"><span className="w-40 truncate font-semibold">{t.name}</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10"><span className="block h-full rounded-full bg-purple" style={{ width: `${t.share * 100}%` }} /></span><span className="tabular w-16 text-right text-xs text-muted">{t.minutes} min</span></li>)}</ul></div>
                  <div><h3 className="text-lg font-bold">Key findings</h3><ul className="mt-2 space-y-2">{content.key_findings.map((f, i) => <li key={i} className="rounded-2xl bg-canvas p-3 text-sm">{f.text} {f.refs.map((n) => <span key={n}>{withCitations(`[${n}]`)}</span>)} {f.ai_generated && <Pill tone="lavender" className="ml-1">AI key point</Pill>}</li>)}</ul></div>
                  {content.conflicts.length > 0 && <div><h3 className="text-lg font-bold">Potential conflicts (for your review)</h3>{content.conflicts.map((c) => <p key={c.id} className="mt-2 rounded-2xl bg-coral-soft p-3 text-sm">{c.topic} {c.refs.map((n) => <span key={n}>{withCitations(`[${n}]`)}</span>)}</p>)}</div>}
                  <div><h3 className="text-lg font-bold">Under-covered topics</h3><p className="mt-2 text-sm text-ink-soft">{content.under_covered.length ? `${content.under_covered.join(", ")} appears under-covered in your workspace.` : "Coverage looks balanced."}</p></div>
                  <div><h3 className="text-lg font-bold">Topic mind-map (Mermaid)</h3><pre className="mt-2 overflow-x-auto rounded-2xl bg-ink p-4 font-mono text-xs text-white">{content.mermaid_mindmap}</pre><Button size="xs" variant="secondary" className="no-print mt-2" onClick={() => downloadText("mindmap.mmd", content.mermaid_mindmap)}><DownloadSimple size={12} /> Download diagram</Button></div>
                </div>
              )}
            </Card>
            <Card className="h-fit p-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold">References</h3>
                <div className="no-print flex gap-1">{(["json", "md", "bibtex"] as ReferenceFormat[]).map((f) => <Button key={f} size="xs" variant="secondary" onClick={() => void exportRefs(f)}>{f === "md" ? "Markdown" : f === "bibtex" ? "BibTeX" : "JSON"}</Button>)}</div>
              </div>
              {refs.isLoading ? <LoadingBlock label="Loading references…" /> : !refs.data?.references.length ? <p className="mt-3 text-sm text-muted">No sources in this session yet.</p> : (
                <ol className="mt-3 space-y-3">
                  {refs.data.references.map((r) => (
                    <li key={r.ref_number} className="text-sm">
                      <button className="text-left font-bold hover:text-purple-deep" onClick={() => jump(r.node_id)}>[{r.ref_number}] {r.title}</button>
                      <span className="text-muted"> — {r.site_name ?? r.domain}</span>
                      <a href={r.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-purple-deep">{r.url}</a>
                      <span className="text-[11px] text-faint">Accessed: {formatDateTime(r.first_accessed_at)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </section>
        )}
        <p className="no-print mt-8 flex items-center gap-2 text-xs text-muted"><Printer size={14} /> “Download PDF” uses your browser&apos;s Save-as-PDF with a print layout.</p>
      </main>
    </div>
  );
}

export default function ReportPage() {
  return <AuthGate><Report /></AuthGate>;
}
