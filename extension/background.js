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
async function allowed(url) {
  const s = await state();
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
      await set({ tracking: true, paused: false, workspaceId: msg.workspace_id, sessionId: msg.session_id,
        blocklist: ws?.settings?.blocklist || [], minDwell: ws?.settings?.min_dwell_seconds || 8, captured: {} });
      notifyTracking();
      checkActiveTab();
      return { ok: true };
    }
    case "PAUSE_TRACKING": await set({ paused: true }); await endVisit(); notifyTracking(); return { ok: true };
    case "RESUME_TRACKING": await set({ paused: false }); notifyTracking(); checkActiveTab(); return { ok: true };
    case "STOP_TRACKING": await endVisit(); await flushVisits(); await set({ tracking: false, paused: false, sessionId: null }); notifyTracking(); return { ok: true };
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
  await endVisit();
  if (!tab || !(await allowed(tab.url))) return;
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
async function checkActiveTab() {
  clearTimeout(dwellTimer);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await startVisit(tab);
  if (!tab || tab.status !== "complete" || !(await allowed(tab.url))) return;
  const s = await state();
  const search = searchOf(tab.url);
  if (search) { captureSearch(tab, search); return; }
  if ((s.captured || {})[normalizeUrl(tab.url)]) { snapshot(tab); return; }
  dwellTimer = setTimeout(() => capturePage(tab.id, "link"), (s.minDwell || 8) * 1000);
}

async function captureSearch(tab, search) {
  const s = await state();
  const key = "q:" + search.query.toLowerCase();
  if ((s.captured || {})[key]) return;
  try {
    await api("POST", "/capture/search", { query: search.query, engine: search.engine, url: tab.url, workspace_id: s.workspaceId });
    await set({ captured: { ...(s.captured || {}), [key]: 1 } });
  } catch { /* shown in popup via lastError */ }
}

function extractPage() {
  const pick = (sel, attr = "content") => document.querySelector(sel)?.getAttribute(attr) || undefined;
  const root = document.querySelector("article, main, [role=main]") || document.body;
  const clone = root.cloneNode(true);
  clone.querySelectorAll("script,style,noscript,nav,footer,header,aside,form,input,textarea,[type=password],[aria-hidden=true]").forEach((e) => e.remove());
  const text = (clone.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
  return {
    title: document.title, text,
    favicon: pick("link[rel~='icon']", "href") ? new URL(pick("link[rel~='icon']", "href"), location.href).href : location.origin + "/favicon.ico",
    meta: { description: pick("meta[name=description]") || pick("meta[property='og:description']"), og_image: pick("meta[property='og:image']"),
      site_name: pick("meta[property='og:site_name']"), author: pick("meta[name=author]"), published_time: pick("meta[property='article:published_time']"),
      lang: document.documentElement.lang || undefined },
    links: [...document.querySelectorAll("a[href^='http']")].slice(0, 200).map((a) => a.href),
  };
}

async function capturePage(tabId, transition) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !(await allowed(tab.url))) return;
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (transition !== "manual" && active?.id !== tabId) return; // user left before the dwell time
  let page = { title: tab.title, text: "", meta: {}, links: [] };
  try { [{ result: page }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPage }); } catch { /* PDFs / restricted pages: backend fetches text */ }
  let opener_url = null, search_query = null;
  if (tab.openerTabId) {
    const op = await chrome.tabs.get(tab.openerTabId).catch(() => null);
    if (op?.url) { opener_url = op.url; search_query = searchOf(op.url)?.query || null; }
  }
  const { lastUrl = {} } = await sget("lastUrl");
  if (!opener_url && lastUrl[tabId] && lastUrl[tabId] !== tab.url) { opener_url = lastUrl[tabId]; search_query = searchOf(opener_url)?.query || null; }
  const s = await state();
  try {
    const res = await api("POST", "/capture/page", {
      url: tab.url, title: page.title || tab.title, favicon_url: page.favicon, meta: Object.fromEntries(Object.entries(page.meta || {}).filter(([, v]) => v)),
      content_text: page.text, outgoing_links: page.links, opener_url, search_query, transition: search_query ? "search_result" : transition,
      tab_id: tabId, captured_at: new Date().toISOString(), workspace_id: s.workspaceId,
    });
    await set({ captured: { ...(s.captured || {}), [normalizeUrl(tab.url)]: res.page_id } });
    snapshot(tab, res.page_id);
  } catch (e) { console.warn("capture failed", e.message); }
}

/* ---------------- snapshots (max 2/s allowed by Chrome; we take one every few seconds at most) */
let lastShot = 0;
async function snapshot(tab, pageId) {
  if (Date.now() - lastShot < 3000) return;
  const s = await state();
  pageId = pageId || (s.captured || {})[normalizeUrl(tab.url)];
  if (!pageId || typeof pageId !== "string") return;
  lastShot = Date.now();
  try {
    const raw = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 55 });
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
chrome.tabs.onRemoved.addListener(() => { endVisit(); sendTabsState(); });
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.url) {
    const { lastUrl = {} } = await sget("lastUrl");
    if (lastUrl[tabId] !== tab.url) await sset({ lastUrl: { ...lastUrl, [tabId]: lastUrl.cur?.[tabId] || lastUrl[tabId], cur: { ...(lastUrl.cur || {}), [tabId]: tab.url } } });
  }
  if (info.status === "complete" && tab.active) { checkActiveTab(); sendTabsState(); }
});
chrome.webNavigation.onCommitted.addListener(async (d) => {
  if (d.frameId !== 0) return;
  const { lastUrl = {} } = await sget("lastUrl");
  const prev = lastUrl.cur?.[d.tabId];
  await sset({ lastUrl: { ...lastUrl, [d.tabId]: prev, cur: { ...(lastUrl.cur || {}), [d.tabId]: d.url } } });
});
chrome.windows.onFocusChanged.addListener((w) => { if (w === chrome.windows.WINDOW_ID_NONE) endVisit(); else checkActiveTab(); });
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((st) => { if (st === "active") checkActiveTab(); else endVisit(); });

chrome.alarms.create("flush", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== "flush") return;
  await flushVisits();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab && (await allowed(tab.url))) snapshot(tab);
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
  if (cmd === "pause") { const s = await state(); await set({ paused: !s.paused }); if (!s.paused) endVisit(); notifyTracking(); }
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
