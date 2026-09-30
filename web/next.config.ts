import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In http mode the web app talks to the Go backend through same-origin rewrites (httpOnly cookie, no CORS) — spec §F1.
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_MODE !== "http") return [];
    const target = process.env.API_PROXY_TARGET || "http://localhost:8080";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
