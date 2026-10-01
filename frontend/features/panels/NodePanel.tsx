"use client";
/** Node detail panel: overview, why opened (F25), research memory (F15), AI analysis, notes/highlights/comments (F10), tags (F11), connections. */
import { useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  ChatCircle,
  Check,
  Clock,
  Crosshair,
  Highlighter,
  Lock,
  MagnifyingGlass,
  NotePencil,
  PencilSimple,
  Sparkle,
  SquaresFour,
  Trash,
  X,
} from "@phosphor-icons/react";
import type { AnnotationKind, ResearchNode } from "@/types/api";
import { AI_STAGES, IMPORTANCE_LABEL, NODE_TYPE_LABEL, PAGE_TYPE_LABEL, RELATIONS, stageIndex } from "@/lib/domain/meta";
import { formatDateTime, formatDuration, formatTime, timeAgo } from "@/lib/utils/format";
import { extensionBridge } from "@/lib/extension/bridge";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Avatar, Confidence, Markdown, Pill, Select, Textarea } from "@/components/ui/primitives";
import { useGraphStore } from "@/stores/graph";
import { useUiStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useExtensionStore, type PreviewMode } from "@/stores/extension";
import {
  acceptEdge,
  addAnnotation,
  addTagToNode,
  deleteAnnotation,
  deleteNodes,
  mergeDuplicate,
  rejectEdge,
  setNodeTags,
  updateAnnotation,
  updateNode,
} from "@/features/graph/actions";
import { PagePreview } from "@/features/canvas/PagePreview";

function Section({ title, children, icon: I }: { title: string; children: React.ReactNode; icon?: typeof Clock }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-clay-sm">
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
        {I && <I size={14} weight="bold" />} {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-semibold text-ink">{v}</dd>
    </div>
  );
}

function Annotations({ node, readOnly }: { node: ResearchNode; readOnly: boolean }) {
  const all = useGraphStore((s) => s.annotations);
  const me = useAuthStore((s) => s.user);
  const list = useMemo(() => Object.values(all).filter((a) => a.node_id === node.id).sort((a, b) => a.created_at.localeCompare(b.created_at)), [all, node.id]);
  const [kind, setKind] = useState<AnnotationKind>("note");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    const ok = await addAnnotation(node.id, kind, kind === "highlight" ? "" : text, kind === "highlight" ? { quote: text } : replyTo ? { parent_id: replyTo } : {});
    if (ok) {
      setText("");
      setReplyTo(null);
    }
  };
  const roots = list.filter((a) => !a.parent_id);
  return (
    <div className="space-y-3">
      {!roots.length && <p className="rounded-2xl bg-white/60 p-4 text-center text-sm text-muted">No notes yet. Add a note, a highlight or a comment below.</p>}
      {roots.map((a) => (
        <div key={a.id} className={cn("rounded-2xl p-3 shadow-clay-sm", a.kind === "note" ? "bg-sun-soft" : a.kind === "highlight" ? "bg-white" : "bg-sky-soft", a.resolved && "opacity-60")}>
          <div className="flex items-center gap-2 text-xs">
            <Avatar name={a.author_name} color={a.author_color} size={22} />
            <span className="font-bold">{a.author_name}</span>
            <Pill tone={a.kind === "note" ? "sun" : a.kind === "highlight" ? "purple" : "sky"}>
              {a.kind === "note" ? <NotePencil size={10} weight="bold" /> : a.kind === "highlight" ? <Highlighter size={10} weight="bold" /> : <ChatCircle size={10} weight="bold" />}
              {a.kind}
            </Pill>
            <span className="ml-auto text-faint">{timeAgo(a.created_at)}</span>
          </div>
          {editing === a.id ? (
            <div className="mt-2">
              <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-20 text-xs" aria-label="Edit" />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button size="xs" variant="primary" onClick={async () => { await updateAnnotation(a.id, { body: editText }); setEditing(null); }}>Save</Button>
              </div>
            </div>
          ) : a.kind === "highlight" ? (
            <blockquote className="mt-2 border-l-4 border-sun pl-3 text-sm italic text-ink-soft">“{a.quote}”</blockquote>
          ) : (
            <Markdown text={a.body} className="mt-2 text-ink-soft" />
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] font-bold">
            {a.kind === "highlight" && a.fragment_url && (
              <a href={a.fragment_url} target="_blank" rel="noreferrer" className="rounded-full px-2 py-1 text-purple-deep hover:bg-lavender-soft">View on page ↗</a>
            )}
            {a.kind === "comment" && !readOnly && <button className="rounded-full px-2 py-1 hover:bg-ink/5" onClick={() => { setKind("comment"); setReplyTo(a.id); }}>Reply</button>}
            {a.kind === "comment" && <button className="rounded-full px-2 py-1 hover:bg-ink/5" onClick={() => void updateAnnotation(a.id, { resolved: !a.resolved })}>{a.resolved ? "Reopen" : "Resolve"}</button>}
            {a.author_id === me?.id && a.kind !== "highlight" && (
              <button className="rounded-full px-2 py-1 hover:bg-ink/5" onClick={() => { setEditing(a.id); setEditText(a.body); }}>Edit</button>
            )}
            {(a.author_id === me?.id || !readOnly) && <button className="rounded-full px-2 py-1 text-danger hover:bg-danger-soft" onClick={() => void deleteAnnotation(a.id)}>Delete</button>}
          </div>
          {list.filter((r) => r.parent_id === a.id).map((r) => (
            <div key={r.id} className="ml-4 mt-2 rounded-xl bg-white/70 p-2 text-xs">
              <span className="font-bold">{r.author_name}</span> <span className="text-faint">· {timeAgo(r.created_at)}</span>
              <p className="mt-0.5 text-ink-soft">{r.body}</p>
            </div>
          ))}
        </div>
      ))}
      <div className="rounded-2xl bg-white p-3 shadow-clay-sm">
        <div className="mb-2 flex gap-1">
          {(["note", "highlight", "comment"] as AnnotationKind[]).map((k) => (
            <button key={k} disabled={readOnly && k !== "comment"} onClick={() => { setKind(k); setReplyTo(null); }} className={cn("rounded-full px-3 py-1 text-xs font-bold capitalize disabled:opacity-40", kind === k ? "bg-pill text-white" : "bg-canvas text-ink-soft")}>
              {k}
            </button>
          ))}
        </div>
        {replyTo && <p className="mb-1 text-xs text-muted">Replying to a comment · <button className="underline" onClick={() => setReplyTo(null)}>cancel</button></p>}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === "note" ? "Write a note (Markdown supported)…" : kind === "highlight" ? "Paste the exact sentence from the page…" : "Comment for collaborators…"}
          className="min-h-20 bg-canvas text-sm shadow-none"
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && void submit()}
          aria-label={`New ${kind}`}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-faint">Ctrl+Enter to save</span>
          <Button size="sm" variant="primary" onClick={() => void submit()} disabled={!text.trim()}>
            Save {kind}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TagEditor({ node, readOnly }: { node: ResearchNode; readOnly: boolean }) {
  const tags = useGraphStore((s) => s.tags);
  const categories = useGraphStore((s) => s.categories);
  const [input, setInput] = useState("");
  return (
    <Section title="Tags & category">
      <div className="flex flex-wrap gap-1.5">
        {node.tag_ids.map((id) => {
          const t = tags.find((x) => x.id === id);
          if (!t) return null;
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${t.color}22`, color: t.color }}>
              {t.name}
              {!readOnly && (
                <button aria-label={`Remove tag ${t.name}`} onClick={() => void setNodeTags(node.id, node.tag_ids.filter((x) => x !== id))}>
                  <X size={11} weight="bold" />
                </button>
              )}
            </span>
          );
        })}
        {!node.tag_ids.length && <span className="text-xs text-faint">No tags</span>}
      </div>
      {!readOnly && (
        <>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addTagToNode(node.id, input);
              setInput("");
            }}
          >
            <input id="tag-input" list="tag-suggestions" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add tag…" className="h-9 min-w-0 flex-1 rounded-full bg-canvas px-3 text-sm outline-none focus:ring-2 focus:ring-purple" aria-label="Add tag" />
            <datalist id="tag-suggestions">{tags.filter((t) => !node.tag_ids.includes(t.id)).map((t) => <option key={t.id} value={t.name} />)}</datalist>
            <Button size="sm" variant="soft" type="submit" disabled={!input.trim()}>Add</Button>
          </form>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Select aria-label="Category" value={node.category_id ?? ""} onChange={(e) => void updateNode(node.id, { category_id: e.target.value || null })} className="h-9 text-xs">
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select aria-label="Importance" value={node.importance ?? ""} onChange={(e) => void updateNode(node.id, { importance: (Number(e.target.value) || null) as 1 | 2 | 3 | null })} className="h-9 text-xs">
              <option value="">Importance…</option>
              {([3, 2, 1] as const).map((i) => <option key={i} value={i}>{IMPORTANCE_LABEL[i].label}</option>)}
            </Select>
          </div>
        </>
      )}
    </Section>
  );
}

export function NodePanel({ nodeId, readOnly }: { nodeId: string; readOnly: boolean }) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.node);
  const page = useGraphStore((s) => (node?.page_id ? s.pages[node.page_id] : undefined));
  const edges = useGraphStore((s) => s.edges);
  const nodes = useGraphStore((s) => s.nodes);
  const mode = useExtensionStore((s) => s.previewMode[nodeId] ?? "snapshot");
  const setMode = useExtensionStore((s) => s.setPreviewMode);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState<string | null>(null);
  const [whyNote, setWhyNote] = useState<string | null>(null);

  if (!node) return <p className="p-6 text-sm text-muted">This node was deleted.</p>;
  const connected = edges.filter((e) => e.data && (e.source === node.id || e.target === node.id)).map((e) => e.data!.edge);
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.data.node.title ?? "…";
  const weak = connected.filter((e) => e.state === "suggested" && (e.confidence ?? 1) < 0.5);
  const strong = connected.filter((e) => !weak.includes(e) && e.state !== "rejected");
  const stage = stageIndex(node.ai_stage);

  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="lavender">{NODE_TYPE_LABEL[node.type]}</Pill>
          {page?.page_type && <Pill tone="sky">{PAGE_TYPE_LABEL[page.page_type]}</Pill>}
          {node.position_locked && <Pill tone="ink"><Lock size={10} weight="bold" /> Placed by you</Pill>}
          {node.created_via === "mcp" && <Pill tone="purple"><Sparkle size={10} weight="fill" /> Added by {node.created_by_name ?? "AI assistant (MCP)"}</Pill>}
        </div>
        {editingTitle ? (
          <input autoFocus className="mt-2 w-full rounded-xl border-2 border-purple bg-white px-3 py-2 font-display text-lg font-bold outline-none" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title"
            onBlur={() => { setEditingTitle(false); if (title.trim() && title !== node.title) void updateNode(node.id, { title: title.trim() }); }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        ) : (
          <h3 className="group mt-2 font-display text-lg font-bold leading-snug text-ink">
            {node.title}
            {!readOnly && <button aria-label="Rename" className="ml-1 inline align-middle text-faint opacity-0 group-hover:opacity-100" onClick={() => { setTitle(node.title); setEditingTitle(true); }}><PencilSimple size={15} /></button>}
          </h3>
        )}
        {page && <a href={page.url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs font-semibold text-purple-deep hover:underline">{page.url}</a>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="secondary" onClick={() => { useUiStore.getState().requestFocus(node.id); }}><Crosshair size={14} weight="bold" /> Zoom to</Button>
        <Button size="xs" variant="secondary" onClick={() => { useUiStore.getState().setFocusNode(node.id); useUiStore.getState().setViewMode("focus"); }}><MagnifyingGlass size={14} weight="bold" /> Focus</Button>
        {page && <Button size="xs" variant="secondary" onClick={() => extensionBridge.goToTab(page.url)}><SquaresFour size={14} weight="bold" /> Go to tab</Button>}
        {!readOnly && <Button size="xs" variant="ghost" className="text-danger" onClick={() => void deleteNodes([node.id])}><Trash size={14} weight="bold" /> Delete</Button>}
      </div>

      <Tabs.Root defaultValue="overview">
        <Tabs.List className="flex gap-1 rounded-full bg-white p-1 shadow-clay-sm">
          {[["overview", "Overview"], ["notes", "Notes"], ["links", `Connections (${strong.length})`]].map(([v, l]) => (
            <Tabs.Trigger id={`panel-tab-${v}`} key={v} value={v} className="h-8 flex-1 rounded-full text-xs font-bold text-ink-soft data-[state=active]:bg-pill data-[state=active]:text-white">{l}</Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="mt-3 space-y-3">
          {page && (
            <Section title="Preview">
              <div className="h-44 overflow-hidden rounded-xl border border-line-cool">
                <PagePreview page={page} mode={mode} />
              </div>
              <div className="mt-2 flex gap-1">
                {(["snapshot", "live", "interactive"] as PreviewMode[]).map((m) => (
                  <button key={m} onClick={() => { if (m === "live") extensionBridge.requestLive(page.url); setMode(node.id, m); }} className={cn("flex-1 rounded-full py-1.5 text-xs font-bold capitalize", mode === m ? "bg-pill text-white" : "bg-canvas text-ink-soft")}>
                    {m === "live" ? "Live video" : m}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {node.type === "page" && (
            <Section title="Why did I open this?" icon={MagnifyingGlass}>
              {node.why_opened.opener_title || node.why_opened.search_query ? (
                <p className="text-sm text-ink">
                  Opened from{" "}
                  {node.why_opened.opener_node_id ? (
                    <button className="font-bold text-purple-deep underline-offset-2 hover:underline" onClick={() => { useUiStore.getState().selectNode(node.why_opened.opener_node_id!); useUiStore.getState().requestFocus(node.why_opened.opener_node_id!); }}>
                      {node.why_opened.opener_title}
                    </button>
                  ) : <strong>{node.why_opened.opener_title}</strong>}
                  {node.why_opened.transition && <span className="text-muted"> ({node.why_opened.transition.replace("_", " ")})</span>}
                </p>
              ) : <p className="text-sm text-muted">Opened directly (typed or bookmark).</p>}
              {node.why_opened.search_query && <p className="mt-1 text-sm">Search query: <strong>“{node.why_opened.search_query}”</strong></p>}
              {node.why_opened.opened_at && <p className="mt-1 text-xs text-muted">{formatDateTime(node.why_opened.opened_at)}</p>}
              {whyNote !== null ? (
                <div className="mt-2 flex gap-2">
                  <input autoFocus value={whyNote} onChange={(e) => setWhyNote(e.target.value)} className="h-9 min-w-0 flex-1 rounded-full bg-canvas px-3 text-sm outline-none focus:ring-2 focus:ring-purple" aria-label="Reason" placeholder="Why did you open this?" />
                  <Button size="sm" variant="primary" onClick={() => { void updateNode(node.id, { why_opened: { ...node.why_opened, note: whyNote } }); setWhyNote(null); }}>Save</Button>
                </div>
              ) : (
                <p className="mt-2 rounded-xl bg-canvas px-3 py-2 text-sm">
                  <span className="text-muted">Reason: </span>
                  {node.why_opened.note ?? <span className="text-faint">not written</span>}
                  {!readOnly && <button className="ml-2 text-xs font-bold text-purple-deep" onClick={() => setWhyNote(node.why_opened.note ?? "")}>edit</button>}
                </p>
              )}
            </Section>
          )}

          {page && (
            <Section title="AI analysis" icon={Sparkle}>
              <div className="mb-2 flex gap-1" aria-label="Processing stages">
                {AI_STAGES.slice(0, 6).map((s, i) => (
                  <span key={s.stage} title={s.label} className={cn("h-1.5 flex-1 rounded-full", node.ai_stage === "failed" ? "bg-warning/40" : i <= stage ? "bg-purple" : "bg-ink/10")} />
                ))}
              </div>
              <p className="mb-2 text-xs font-bold text-purple-deep">{AI_STAGES[stage]?.label ?? ""} · AI-generated, may be imperfect</p>
              {page.summary ? <p className="text-sm text-ink-soft">{page.summary}</p> : <div className="space-y-1.5"><div className="skeleton h-3 rounded" /><div className="skeleton h-3 w-2/3 rounded" /></div>}
              {page.topics.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{page.topics.map((t) => <Pill key={t} tone="lavender">{t}</Pill>)}</div>}
              {page.claims.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Key claims</p>
                  {page.claims.map((c) => <p key={c.id} className="mt-1 text-sm">• {c.text} <span className="text-xs italic text-muted">“{c.quote}”</span></p>)}
                </div>
              )}
              {page.is_research_reason && <p className="mt-2 text-xs text-muted">Research? {page.is_research ? "Yes" : "No"} — {page.is_research_reason}</p>}
            </Section>
          )}

          {(node.type === "note" || node.type === "finding" || node.type === "question") && (
            <Section title={node.type === "note" ? "Note (Markdown)" : "Details"}>
              {body !== null ? (
                <>
                  <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-32 bg-canvas text-sm shadow-none" aria-label="Body" />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="xs" variant="ghost" onClick={() => setBody(null)}>Cancel</Button>
                    <Button size="xs" variant="primary" onClick={() => { void updateNode(node.id, { body }); setBody(null); }}>Save</Button>
                  </div>
                </>
              ) : (
                <>
                  {node.body && node.type !== "question" ? <Markdown text={node.body} /> : <p className="text-sm text-faint">Nothing written yet.</p>}
                  {!readOnly && <Button size="xs" variant="soft" className="mt-2" onClick={() => setBody(node.body)}><PencilSimple size={13} /> Edit</Button>}
                </>
              )}
            </Section>
          )}

          {node.type === "page" && (
            <Section title="Research Memory" icon={Clock}>
              <dl>
                <Row k="First opened" v={formatDateTime(node.activity.first_opened_at)} />
                <Row k="Last opened" v={formatDateTime(node.activity.last_opened_at)} />
                <Row k="Time spent" v={<span className="tabular">{formatDuration(node.activity.total_ms)}</span>} />
                <Row k="Visits" v={node.activity.visit_count} />
                <Row k="Previous topic" v={node.activity.previous_topic ?? "—"} />
                <Row k="Next topic" v={node.activity.next_topic ?? "—"} />
                <Row k="Added by" v={node.created_by_name ?? "—"} />
              </dl>
            </Section>
          )}

          {node.duplicate_of && !readOnly && (
            <Section title="Possible duplicate">
              <p className="text-sm">Looks like <strong>{titleOf(node.duplicate_of)}</strong>.</p>
              <Button size="sm" variant="soft" className="mt-2" onClick={() => void mergeDuplicate(node.id, node.duplicate_of!)}>Merge into it</Button>
            </Section>
          )}

          <TagEditor node={node} readOnly={readOnly} />
        </Tabs.Content>

        <Tabs.Content value="notes" className="mt-3">
          <Annotations node={node} readOnly={readOnly} />
        </Tabs.Content>

        <Tabs.Content value="links" className="mt-3 space-y-2">
          {!strong.length && <p className="rounded-2xl bg-white/60 p-4 text-center text-sm text-muted">No connections yet. Drag from a node&apos;s edge handle to connect.</p>}
          {[...strong, ...weak].map((e) => {
            const other = e.source_id === node.id ? e.target_id : e.source_id;
            const isWeak = weak.includes(e);
            return (
              <div key={e.id} className={cn("rounded-2xl bg-white p-3 shadow-clay-sm", isWeak && "opacity-70")}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: RELATIONS[e.relation].stroke }} />
                  <span className="text-xs font-bold">{e.source_id === node.id ? "→" : "←"} {RELATIONS[e.relation].label}</span>
                  {isWeak && <Pill tone="ink">Weak suggestion</Pill>}
                  <span className="ml-auto"><Confidence value={e.confidence} /></span>
                </div>
                <button className="mt-1 block text-left text-sm font-semibold text-ink hover:text-purple-deep" onClick={() => useUiStore.getState().selectEdge(e.id)}>{titleOf(other)}</button>
                <p className="mt-0.5 text-xs text-muted">{e.reason}</p>
                {e.state === "suggested" && !readOnly && (
                  <div className="mt-2 flex gap-1.5">
                    <Button size="xs" variant="success" onClick={() => void acceptEdge(e.id)}><Check size={12} weight="bold" /> Accept</Button>
                    <Button size="xs" variant="ghost" onClick={() => void rejectEdge(e.id)}><X size={12} weight="bold" /> Reject</Button>
                  </div>
                )}
              </div>
            );
          })}
        </Tabs.Content>
      </Tabs.Root>
      <p className="text-center text-[11px] text-faint">Created {formatTime(node.created_at)} · v{node.version} · via {node.created_via}</p>
    </div>
  );
}
