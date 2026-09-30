/**
 * Public, non-secret configuration only (NEXT_PUBLIC_*). See frontend/.env.example.
 *   NEXT_PUBLIC_API_MODE      "mock" (default) | "http"
 *   NEXT_PUBLIC_API_BASE_URL  base path for REST, default "/api/v1"
 *   NEXT_PUBLIC_WS_URL        WebSocket URL, default derived from the page origin
 */
export const API_MODE: "mock" | "http" =
  process.env.NEXT_PUBLIC_API_MODE === "http" ? "http" : "mock";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1";

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Research Map";

export const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || "";
