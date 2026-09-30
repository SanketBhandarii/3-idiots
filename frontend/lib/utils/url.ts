/** URL cleaning — mirrors the Go `urlnorm` package (§11): drop utm_*, #fragment, trailing slash. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    [...u.searchParams.keys()].forEach((k) => {
      if (k.startsWith("utm_") || k === "fbclid" || k === "gclid") u.searchParams.delete(k);
    });
    // Host is case-insensitive; path and query keep their case (decision D4).
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}

export function textFragmentUrl(url: string, quote: string): string {
  const words = quote.trim().split(/\s+/);
  const text =
    words.length > 8
      ? `${encodeURIComponent(words.slice(0, 4).join(" "))},${encodeURIComponent(words.slice(-4).join(" "))}`
      : encodeURIComponent(quote.trim());
  return `${url.split("#")[0]}#:~:text=${text}`;
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
