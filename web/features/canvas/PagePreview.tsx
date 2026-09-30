"use client";
/**
 * Live tab preview inside a node (§13): Snapshot (default), Live Video, Interactive.
 * Shows the real website: extension snapshot when available, otherwise a real screenshot.
 */
import { memo, useEffect, useState } from "react";
import { Prohibit } from "@phosphor-icons/react";
import type { Page } from "@/types/api";
import { colorFromString } from "@/lib/domain/meta";
import { faviconUrl, screenshotUrl } from "@/lib/domain/preview";
import type { PreviewMode } from "@/stores/extension";

export function Favicon({ page, size = 16 }: { page: Pick<Page, "domain" | "site_name">; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="inline-grid shrink-0 place-items-center rounded-[30%] font-bold text-white"
        style={{ width: size, height: size, background: colorFromString(page.domain), fontSize: size * 0.55 }}
        aria-hidden
      >
        {(page.site_name ?? page.domain)[0]?.toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={faviconUrl(page.domain)} alt="" width={size} height={size} className="shrink-0 rounded-sm" loading="lazy" onError={() => setFailed(true)} />
  );
}

/** Real screenshot of the site. The screenshot service may first return a "generating" image, so we refresh once. */
function SiteShot({ page, live, refreshMs }: { page: Page; live?: boolean; refreshMs?: number }) {
  const [bust, setBust] = useState(0);
  const [tries, setTries] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // Real-time tab view: while the tab is open in the browser, keep pulling a fresh snapshot.
  useEffect(() => {
    if (!refreshMs) return;
    const t = setInterval(() => setBust(Date.now()), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs]);
  // The service generates screenshots on first request: it errors or returns a 400px
  // placeholder until ready, so poll a few times before falling back.
  const retry = () => {
    if (tries >= 5) return setFailed(true);
    setTimeout(() => {
      setTries((t) => t + 1);
      setBust(Date.now());
    }, 3000 + tries * 2000);
  };
  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas-cool">
      {!loaded && !failed && <div className="skeleton absolute inset-0 rounded-none" />}
      {failed ? (
        <div className="grid h-full place-items-center p-3 text-center">
          <div>
            <Favicon page={page} size={28} />
            <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-muted">{page.title}</p>
          </div>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={screenshotUrl(page, 640, bust)}
          alt={`Snapshot of ${page.title}`}
          loading="lazy"
          draggable={false}
          decoding="async"
          className="h-full w-full object-cover object-top text-transparent"
          onLoad={(e) => {
            setLoaded(true);
            if (!page.og_image_url && e.currentTarget.naturalWidth < 600) retry();
          }}
          onError={retry}
        />
      )}
      {live && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white shadow-soft">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
        </span>
      )}
    </div>
  );
}

export const PagePreview = memo(function PagePreview({ page, mode, image, refreshMs }: { page: Page; mode: PreviewMode; image?: string | null; refreshMs?: number }) {
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const blocked = blockedUrl === page.url;

  if (mode === "interactive") {
    if (!page.embeddable || blocked) {
      return (
        <div className="relative h-full">
          <SiteShot page={page} />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-ink/80 px-2 py-1 text-[10px] font-bold text-white">
            <Prohibit size={12} weight="bold" /> This site cannot be embedded.
          </div>
        </div>
      );
    }
    return (
      <iframe
        src={page.url}
        title={`Interactive view of ${page.title}`}
        className="nodrag nowheel h-full w-full bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setBlockedUrl(page.url)}
      />
    );
  }
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={`Snapshot of ${page.title}`} className="h-full w-full object-cover object-top" />;
  }
  return <SiteShot page={page} live={mode === "live"} refreshMs={mode === "live" ? 8000 : refreshMs} />;
});
