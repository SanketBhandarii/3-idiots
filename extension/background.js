// Research Map extension (MV3). Captures only while the user tracks a workspace. No AI, no database here.
const DEFAULT_API = "http://localhost:8080/api/v1";
const SEARCH_ENGINES = [
  { host: /(^|\.)google\.[a-z.]+$/, path: /^\/search/, param: "q", name: "google" },
  { host: /(^|\.)bing\.com$/, path: /^\/search/, param: "q", name: "bing" },
  { host: /(^|\.)duckduckgo\.com$/, path: /^\/$/, param: "q", name: "duckduckgo" },
  { host: /(^|\.)search\.brave\.com$/, path: /^\/search/, param: "q", name: "brave" },
  { host: /(^|\.)youtube\.com$/, path: /^\/results/, param: "search_query", name: "youtube" },
  { host: /(^|\.)scholar\.google\.[a-z.]+$/, path: /^\/scholar/, param: "q", name: "scholar" },
];
const ports = new Set();
let dwellTimer = null;

/* ---------------- storage helpers (service worker may stop at any time, so state lives in storage) */
const get = (k) => chrome.storage.local.get(k);
const set = (o) => chrome.storage.local.set(o);
const sget = (k) => chrome.storage.session.get(k);
const sset = (o) => chrome.storage.session.set(o);

async function api(method, path, body) {
  const { token, apiBase } = await get(["token", "apiBase"]);
  if (!token) throw new Error("not connected");
  const res = await fetch((apiBase || DEFAULT_API) + path, {
    method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || res.status), { status: res.status });
  return data;
}

/* ---------------- outbox: captures survive Go being down and service-worker restarts */
const RETRYABLE = (e) => !e.status || e.status >= 500 || e.status === 429;
async function sendOrQueue(method, path, body) {
  try { return await api(method, path, body); }
  catch (e) {
    if (!RETRYABLE(e)) throw e;
    const { outbox = [] } = await get("outbox");
    outbox.push({ method, path, body, tries: 0 });
    await set({ outbox: outbox.slice(-100) });
    console.warn("[EXTENSION] backend unreachable, queued", path);
    return null;
  }
}
async function flushOutbox() {
  const { outbox = [] } = await get("outbox");
  if (!outbox.length) return;
  const keep = [];
  for (const item of outbox) {
    try {
      const res = await api(item.method, item.path, item.body);
      if (item.path === "/capture/page" && res?.page_id) await rememberCaptured(item.body.url, res.page_id);
      console.info("[EXTENSION] queued item delivered", item.path);
    } catch (e) {
      if (RETRYABLE(e) && item.tries < 20) keep.push({ ...item, tries: item.tries + 1 });
    }
  }
  await set({ outbox: keep });
}
async function rememberCaptured(url, value) {
  const { captured = {} } = await get("captured");
  await set({ captured: { ...captured, [url.startsWith("q:") ? url : normalizeUrl(url)]: value } });
}

/* ---------------- URL rules (same as backend urlnorm + frontend url.ts) */
function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    [...u.searchParams.keys()].forEach((k) => { if (k.startsWith("utm_") || k === "fbclid" || k === "gclid") u.searchParams.delete(k); });
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    let s = u.toString();
    return s.endsWith("/") ? s.slice(0, -1) : s;
  } catch { return raw; }
}
const isHttp = (u) => /^https?:\/\//i.test(u || "");
function searchOf(url) {
  try {
    const u = new URL(url);
    const e = SEARCH_ENGINES.find((s) => s.host.test(u.hostname) && s.path.test(u.pathname));
    const q = e && u.searchParams.get(e.param);
    return q ? { query: q.trim(), engine: e.name } : null;
  } catch { return null; }
}

async function state() {
  return get(["tracking", "paused", "workspaceId", "sessionId", "blocklist", "minDwell", "captured"]);
}
async function allowed(url, tab) {
  const s = await state();
  if (tab?.incognito) return false; // never track incognito (manifest also sets incognito: not_allowed)
  if (!s.tracking || s.paused || !s.workspaceId || !isHttp(url)) return false;
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "localhost" || host === "127.0.0.1") return false; // never capture our own app
  return !(s.blocklist || []).some((b) => host === b || host.endsWith("." + b));
}

/* ---------------- web app bridge */
function broadcast(msg) { ports.forEach((p) => { try { p.postMessage(msg); } catch { ports.delete(p); } }); }

chrome.runtime.onConnectExternal.addListener((port) => {
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  if (port.sender?.tab?.id) set({ webTabId: port.sender.tab.id });
  sendTabsState();
  state().then((s) => port.postMessage({ type: "TRACKING_STATE", tracking: !!s.tracking, paused: !!s.paused, workspace_id: s.workspaceId || null }));
});

chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  handleExternal(msg, sender).then(reply, (e) => reply({ ok: false, error: String(e.message || e) }));
  return true;
});

async function handleExternal(msg, sender) {
  switch (msg?.type) {
    case "PING": {
      const { token } = await get("token");
      return { ok: true, version: chrome.runtime.getManifest().version, connected: !!token };
    }
    case "CONNECT_TOKEN":
      await set({ token: msg.token, apiBase: msg.api_base || DEFAULT_API, webOrigin: sender.origin });
      await syncState();
      return { ok: true };
    case "START_TRACKING": {
      const ws = await api("GET", "/workspaces").then((l) => l.find((w) => w.id === msg.workspace_id)).catch(() => null);
      // Re-sent when the web app reloads during the same session: keep the captured cache instead of wiping it.
      const prev = await state();
      const same = prev.tracking && prev.workspaceId === msg.workspace_id && prev.sessionId === msg.session_id;
      await set({ tracking: true, paused: false, workspaceId: msg.workspace_id, sessionId: msg.session_id,
        blocklist: ws?.settings?.blocklist || [], minDwell: ws?.settings?.min_dwell_seconds || 8, captured: same ? prev.captured || {} : {} });
      notifyTracking();
      // Give the user a fresh normal tab to research in. chrome://newtab is not http(s), so it is never captured itself.
      let openedTabId = null;
      if (msg.open_tab !== false) {
        try {
          const tab = await chrome.tabs.create({ active: true });
          openedTabId = tab.id;
          await chrome.windows.update(tab.windowId, { focused: true });
        } catch (e) { console.warn("[EXTENSION] could not open tracking tab", e); }
      }
      checkActiveTab();
      return { ok: true, tab_id: openedTabId };
    }
    case "PAUSE_TRACKING": await set({ paused: true }); await serial(async () => { await endVisit(); await cancelDwell(); }); notifyTracking(); return { ok: true };
    case "RESUME_TRACKING": await set({ paused: false }); notifyTracking(); checkActiveTab(); return { ok: true };
    case "STOP_TRACKING": await serial(async () => { await endVisit(); await cancelDwell(); }); await flushVisits(); await flushOutbox(); await set({ tracking: false, paused: false, sessionId: null }); notifyTracking(); return { ok: true };
    case "GET_OPEN_TABS": {
      const tabs = (await chrome.tabs.query({})).filter((t) => isHttp(t.url) && !t.incognito);
      sendTabsState();
      return { ok: true, tabs: tabs.map((t) => ({ url: t.url, url_normalized: normalizeUrl(t.url), title: t.title, active: t.active })) };
    }
    case "FOCUS_TAB": {
      const tab = await findTab(msg.url);
      if (!tab) { await chrome.tabs.create({ url: msg.url }); return { ok: true, opened: true }; }
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return { ok: true };
    }
    case "OPEN_URLS_AS_GROUP": {
      const ids = [];
      for (const u of (msg.urls || []).filter(isHttp).slice(0, 30)) ids.push((await chrome.tabs.create({ url: u, active: false })).id);
      if (ids.length) {
        const g = await chrome.tabs.group({ tabIds: ids });
        await chrome.tabGroups.update(g, { title: (msg.title || "Research").slice(0, 40), color: "purple" });
      }
      return { ok: true, opened: ids.length };
    }
    case "CLOSE_SAVED_TABS": {
      const want = new Set((msg.urls || []).map(normalizeUrl));
      const tabs = (await chrome.tabs.query({})).filter((t) => want.has(normalizeUrl(t.url || "")));
      await chrome.tabs.remove(tabs.map((t) => t.id));
      return { ok: true, closed: tabs.length };
    }
    case "REQUEST_LIVE_VIDEO": {
      const tab = await findTab(msg.url);
      if (!tab) return { ok: false, error: "Tab not open" };
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return { ok: true, hint: "Press Alt+Shift+L on that tab to start the live view (Chrome requires this click)." };
    }
    case "ENABLE_INTERACTIVE_EMBED": {
      // Remove frame-blocking headers ONLY for iframes that our web app opens (session rule, gone when Chrome closes).
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [1],
        addRules: [{ id: 1, priority: 1,
          action: { type: "modifyHeaders", responseHeaders: [{ header: "x-frame-options", operation: "remove" }, { header: "content-security-policy", operation: "remove" }] },
          condition: { resourceTypes: ["sub_frame"], initiatorDomains: ["localhost", "127.0.0.1"] } }],
      });
      return { ok: true };
    }
  }
  return { ok: false, error: "unknown message" };
}

async function syncState() {
  // After a browser restart, resume the tracking session the backend says is active.
  try {
    const st = await api("GET", "/extension/state");
    if (st.session && st.session.state !== "stopped") {
      await set({ tracking: true, paused: st.session.state === "paused", workspaceId: st.session.workspace_id, sessionId: st.session.id,
        blocklist: st.workspace?.settings?.blocklist || [], minDwell: st.workspace?.settings?.min_dwell_seconds || 8 });
    } else await set({ tracking: false });
    notifyTracking();
  } catch { /* offline or not connected */ }
}

async function notifyTracking() {
  const s = await state();
  chrome.action.setBadgeText({ text: s.tracking ? (s.paused ? "II" : "ON") : "" });
  chrome.action.setBadgeBackgroundColor({ color: s.paused ? "#888" : "#3f8a2e" });
  broadcast({ type: "TRACKING_STATE", tracking: !!s.tracking, paused: !!s.paused, workspace_id: s.workspaceId || null });
}

async function findTab(url) {
  const n = normalizeUrl(url);
  return (await chrome.tabs.query({})).find((t) => normalizeUrl(t.url || "") === n);
}

async function sendTabsState() {
  const tabs = await chrome.tabs.query({});
  const out = {};
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  tabs.forEach((t) => { if (isHttp(t.url)) out[normalizeUrl(t.url)] = "open"; });
  if (active && isHttp(active.url)) out[normalizeUrl(active.url)] = "active";
  broadcast({ type: "TABS_STATE", tabs: out });
}

/* ---------------- time tracking: visits while tab active + window focused + user not idle */
async function startVisit(tab) {
  const { visit } = await sget("visit");
  // Repeated events for the page already being visited (load events, SPA title updates) must not split the visit.
  if (visit && tab && visit.tab_id === tab.id && normalizeUrl(visit.url) === normalizeUrl(tab.url || "")) return;
  await endVisit();
  if (!tab || !(await allowed(tab.url, tab))) return;
  await sset({ visit: { url: tab.url, tab_id: tab.id, started_at: new Date().toISOString() } });
}
async function endVisit() {
  const { visit } = await sget("visit");
  if (!visit) return;
  await sset({ visit: null });
  const v = { ...visit, ended_at: new Date().toISOString() };
  if (Date.parse(v.ended_at) - Date.parse(v.started_at) < 2000) return;
  const { pending = [] } = await get("pending");
  pending.push(v);
  await set({ pending: pending.slice(-500) });
}
async function flushVisits() {
  const { visit } = await sget("visit");
  if (visit) { await endVisit(); await sset({ visit: { ...visit, started_at: new Date().toISOString() } }); } // checkpoint
  const { pending = [], sessionId } = await get(["pending", "sessionId"]);
  if (!pending.length || !sessionId) return;
  try { await api("POST", "/capture/visits", { session_id: sessionId, visits: pending }); await set({ pending: [] }); }
  catch (e) { if (e.status && e.status < 500) await set({ pending: [] }); } // keep for retry when offline
}

/* ---------------- capture */
// Browser events arrive in bursts (onUpdated fires several times per load; onCommitted/onHistoryStateUpdated/onUpdated
// all report one navigation). Every state transition runs through one queue so handlers never interleave their
// storage read-modify-writes, and a burst collapses into a single active-tab check.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn).catch((e) => console.warn("[EXTENSION] state update failed", e?.message || e)));
let checkQueued = false;
function checkActiveTab() {
  if (checkQueued) return queue;
  checkQueued = true;
  return serial(() => { checkQueued = false; return doCheckActiveTab(); });
}
function armDwell(due) {
  clearTimeout(dwellTimer);
  dwellTimer = setTimeout(() => serial(checkDwell), Math.max(0, due - Date.now()) + 50);
}
async function cancelDwell() {
  clearTimeout(dwellTimer);
  await sset({ dwell: null });
}
const capturing = new Set(); // normalized URLs with a capture request in flight

async function doCheckActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await startVisit(tab);
  if (!tab || !(await allowed(tab.url, tab))) return cancelDwell();
  const s = await state();
  const search = searchOf(tab.url);
  if (search) { await cancelDwell(); captureSearch(tab, search); return; }
  const norm = normalizeUrl(tab.url);
  if ((s.captured || {})[norm] || capturing.has(norm)) { await cancelDwell(); if (tab.status === "complete") snapshot(tab); return; }
  const { dwell } = await sget("dwell");
  // Same page still pending: keep its deadline. Restarting it on every load/title event is what kept slow or
  // chatty pages (YouTube, Reddit, ad-heavy sites) from ever reaching the dwell time.
  if (dwell && dwell.tabId === tab.id && normalizeUrl(dwell.url) === norm) { armDwell(dwell.due); return; }
  // The clock starts when the page is committed and shown, not when every subresource finished loading.
  // The due time is persisted so a service-worker restart does not lose the pending capture.
  const due = Date.now() + (s.minDwell || 8) * 1000;
  await sset({ dwell: { tabId: tab.id, url: tab.url, due } });
  console.info("[EXTENSION] dwell started", { tab_id: tab.id, seconds: s.minDwell || 8 });
  armDwell(due);
}
async function checkDwell() {
  const { dwell } = await sget("dwell");
  if (!dwell || Date.now() < dwell.due) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  // Still the same page, still active + focused, user not idle -> dwell satisfied.
  if (!tab || tab.id !== dwell.tabId || normalizeUrl(tab.url) !== normalizeUrl(dwell.url)) return cancelDwell();
  const win = await chrome.windows.get(tab.windowId).catch(() => null);
  if (!win?.focused) return cancelDwell();
  if ((await chrome.idle.queryState(60)) !== "active") return cancelDwell();
  // Dwell is satisfied but the page is still loading: give it a few more seconds so extraction sees the content.
  if (tab.status !== "complete" && (dwell.waits || 0) < 5) {
    const due = Date.now() + 1500;
    await sset({ dwell: { ...dwell, due, waits: (dwell.waits || 0) + 1 } });
    return armDwell(due);
  }
  await cancelDwell();
  console.info("[EXTENSION] dwell satisfied", { tab_id: tab.id });
  capturePage(tab.id, "link"); // not awaited: extraction + upload must not hold up navigation handling
}

// One handler for every top-frame URL change (full navigation or SPA history.pushState/replaceState).
// lastUrl[tabId] = the previous page in this tab, lastUrl.cur[tabId] = the current one.
async function noteNavigation(tabId, url) {
  const { lastUrl = {} } = await sget("lastUrl");
  const cur = lastUrl.cur || {};
  if (cur[tabId] && normalizeUrl(cur[tabId]) === normalizeUrl(url)) return; // same page (fragment/tracking change)
  await sset({ lastUrl: { ...lastUrl, [tabId]: cur[tabId], cur: { ...cur, [tabId]: url } } });
}

async function captureSearch(tab, search) {
  const s = await state();
  const key = "q:" + search.query.toLowerCase();
  if ((s.captured || {})[key]) return;
  try {
    await sendOrQueue("POST", "/capture/search", { query: search.query, engine: search.engine, url: tab.url, workspace_id: s.workspaceId });
    await rememberCaptured(key, 1);
    console.info("[EXTENSION] search captured", search.engine);
  } catch (e) { console.warn("[EXTENSION] search capture rejected", e.message); }
}

function extractPage() {
  const pick = (sel, attr = "content") => document.querySelector(sel)?.getAttribute(attr) || undefined;
  // Pages with a visible password field are login/account pages: never captured automatically.
  const sensitive = [...document.querySelectorAll("input[type=password]")].some((e) => e.offsetParent !== null);
  let text = "", byline;
  try {
    // Readability (vendor/Readability.js, injected first) = Firefox Reader View engine. Runs on a clone; the page is untouched.
    const art = typeof Readability === "function" ? new Readability(document.cloneNode(true)).parse() : null; // eslint-disable-line no-undef
    if (art?.textContent) { text = art.textContent; byline = art.byline || undefined; }
  } catch { /* fall back below */ }
  if (text.trim().length < 200) {
    const root = document.querySelector("article, main, [role=main]") || document.body;
    const clone = root.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,nav,footer,header,aside,form,input,textarea,[type=password],[aria-hidden=true]").forEach((e) => e.remove());
    text = clone.innerText || clone.textContent || "";
  }
  text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim().slice(0, 20000);
  return {
    title: document.title, text, sensitive,
    favicon: pick("link[rel~='icon']", "href") ? new URL(pick("link[rel~='icon']", "href"), location.href).href : location.origin + "/favicon.ico",
    meta: { description: pick("meta[name=description]") || pick("meta[property='og:description']"), og_image: pick("meta[property='og:image']"),
      site_name: pick("meta[property='og:site_name']"), author: pick("meta[name=author]") || byline, published_time: pick("meta[property='article:published_time']"),
      lang: document.documentElement.lang || undefined },
    links: [...document.querySelectorAll("a[href^='http']")].slice(0, 200).map((a) => a.href),
  };
}

async function capturePage(tabId, transition) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !(await allowed(tab.url, tab))) return;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (transition !== "manual" && active?.id !== tabId) return; // user left before the dwell time
  const norm = normalizeUrl(tab.url);
  if (capturing.has(norm)) return; // same page already being sent (e.g. dwell + Alt+Shift+A together)
  capturing.add(norm);
  try { await sendCapture(tab, tabId, transition); } finally { capturing.delete(norm); }
}
async function sendCapture(tab, tabId, transition) {
  const t0 = Date.now();
  console.info("[EXTENSION] capture started", { tab_id: tabId, transition });
  let page = { title: tab.title, text: "", meta: {}, links: [] };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["vendor/Readability.js"] }).catch(() => {});
    [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPage });
  } catch { /* PDFs / restricted pages: backend fetches text */ }
  if (page.sensitive && transition !== "manual") { console.info("[EXTENSION] skipped page with password field"); return; }
  let opener_url = null, search_query = null;
  if (tab.openerTabId) {
    const op = await chrome.tabs.get(tab.openerTabId).catch(() => null);
    if (op?.url) { opener_url = op.url; search_query = searchOf(op.url)?.query || null; }
  }
  const { lastUrl = {} } = await sget("lastUrl");
  if (!opener_url && lastUrl[tabId] && normalizeUrl(lastUrl[tabId]) !== normalizeUrl(tab.url)) { opener_url = lastUrl[tabId]; search_query = searchOf(opener_url)?.query || null; }
  const s = await state();
  try {
    const res = await sendOrQueue("POST", "/capture/page", {
      url: tab.url, title: page.title || tab.title, favicon_url: page.favicon, meta: Object.fromEntries(Object.entries(page.meta || {}).filter(([, v]) => v)),
      content_text: page.text, outgoing_links: page.links, opener_url, search_query, transition: search_query ? "search_result" : transition,
      tab_id: tabId, captured_at: new Date().toISOString(), workspace_id: s.workspaceId,
    });
    if (!res) return; // queued; delivered by the next flush
    await rememberCaptured(tab.url, res.page_id);
    console.info("[EXTENSION] capture sent", { node_id: res.node_id, page_id: res.page_id, is_new: res.is_new, ms: Date.now() - t0, chars: page.text?.length || 0 });
    snapshot(tab, res.page_id);
  } catch (e) { console.warn("[EXTENSION] capture rejected", e.message); }
}

/* ---------------- snapshots (max 2/s allowed by Chrome; we take one every few seconds at most) */
let lastShot = 0;
async function snapshot(tab, pageId) {
  if (Date.now() - lastShot < 3000) return;
  const s = await state();
  pageId = pageId || (s.captured || {})[normalizeUrl(tab.url)];
  if (!pageId || typeof pageId !== "string") return;
  // captureVisibleTab shoots whatever tab is visible in the window. Only keep the image if this page's tab is
  // still the visible, fully loaded tab before and after the shot; otherwise it would show another page.
  const stillVisible = async () => {
    const cur = await chrome.tabs.get(tab.id).catch(() => null);
    return !!cur && cur.active && cur.status === "complete" && normalizeUrl(cur.url || "") === normalizeUrl(tab.url);
  };
  if (!(await stillVisible())) return;
  lastShot = Date.now();
  try {
    const raw = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 55 });
    if (!(await stillVisible())) return;
    const image = await shrink(raw, 560);
    broadcast({ type: "SNAPSHOT", url: normalizeUrl(tab.url), page_id: pageId, image });
    const { lastUpload = {} } = await get("lastUpload");
    if (Date.now() - (lastUpload[pageId] || 0) > 15000) {
      await api("PUT", `/pages/${pageId}/preview`, { image });
      await set({ lastUpload: { ...lastUpload, [pageId]: Date.now() } });
    }
  } catch { /* window not focused or page not capturable */ }
}
async function shrink(dataUrl, width) {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const h = Math.round((bmp.height * width) / bmp.width);
  const canvas = new OffscreenCanvas(width, h);
  canvas.getContext("2d").drawImage(bmp, 0, 0, width, h);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.6 });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return "data:image/jpeg;base64," + btoa(bin);
}

/* ---------------- browser events */
chrome.tabs.onActivated.addListener(() => { checkActiveTab(); sendTabsState(); });
chrome.tabs.onRemoved.addListener(() => { serial(endVisit); sendTabsState(); });
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  // URL change (incl. SPA) or load finished on the visible tab: one coalesced check; same-URL repeats are no-ops.
  if ((info.url || info.status === "complete") && tab.active) checkActiveTab();
  if (info.status === "complete") sendTabsState();
});
const onTopFrameNav = (d) => {
  if (d.frameId !== 0) return;
  serial(() => noteNavigation(d.tabId, d.url));
  checkActiveTab();
};
chrome.webNavigation.onCommitted.addListener(onTopFrameNav);
// SPA navigations (history.pushState/replaceState: YouTube video → video, Reddit, GitHub, docs sites) do not commit
// a new document and do not always produce a tabs.onUpdated "complete", so they need this event to start a new dwell.
chrome.webNavigation.onHistoryStateUpdated.addListener(onTopFrameNav);
chrome.windows.onFocusChanged.addListener((w) => {
  if (w === chrome.windows.WINDOW_ID_NONE) serial(async () => { await endVisit(); await cancelDwell(); });
  else checkActiveTab();
});
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((st) => {
  if (st === "active") checkActiveTab();
  else serial(async () => { await endVisit(); await cancelDwell(); });
});

chrome.alarms.get("flush").then((al) => { if (!al) chrome.alarms.create("flush", { periodInMinutes: 0.5 }); });
serial(async () => { const { dwell } = await sget("dwell"); if (dwell) armDwell(dwell.due); }); // resume after a worker restart
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== "flush") return;
  await flushVisits();
  await flushOutbox();
  await serial(checkDwell);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab && (await allowed(tab.url, tab))) snapshot(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "highlight", title: "Save highlight to Research Map", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "add", title: "Add page to Research Map", contexts: ["page"] });
  chrome.contextMenus.create({ id: "live", title: "Show this tab live in Research Map", contexts: ["page"] });
  syncState();
});
chrome.runtime.onStartup.addListener(syncState);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const s = await state();
  if (info.menuItemId === "add") return capturePage(tab.id, "manual");
  if (info.menuItemId === "live") return goLive(tab);
  if (info.menuItemId === "highlight" && s.workspaceId) {
    const quote = (info.selectionText || "").trim();
    const words = quote.split(/\s+/);
    const frag = words.length > 8 ? `${encodeURIComponent(words.slice(0, 4).join(" "))},${encodeURIComponent(words.slice(-4).join(" "))}` : encodeURIComponent(quote);
    if (!s.captured?.[normalizeUrl(tab.url)]) await capturePage(tab.id, "manual");
    api("POST", "/capture/highlight", { url: tab.url, quote, fragment_url: tab.url.split("#")[0] + "#:~:text=" + frag, workspace_id: s.workspaceId }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  tab = tab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (cmd === "add-page" && tab) capturePage(tab.id, "manual");
  if (cmd === "go-live" && tab) goLive(tab);
  if (cmd === "pause") {
    const s = await state();
    await set({ paused: !s.paused });
    if (!s.paused) serial(async () => { await endVisit(); await cancelDwell(); }); else checkActiveTab();
    notifyTracking();
  }
});

// Live video: the shortcut/menu click grants activeTab for this tab, which tabCapture requires.
async function goLive(tab) {
  const { webTabId } = await get("webTabId");
  if (!webTabId) return;
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id, consumerTabId: webTabId });
    broadcast({ type: "LIVE_STREAM_ID", url: normalizeUrl(tab.url), stream_id: streamId });
  } catch (e) { console.warn("live failed", e.message); }
}
