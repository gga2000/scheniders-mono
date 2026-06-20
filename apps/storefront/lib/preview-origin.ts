// =====================================================================
// Preview postMessage origin trust (EC25)
// =====================================================================
// The store-builder preview iframe (`/_preview/...`) talks to the platform
// editor over postMessage. Both the click-to-edit bridge and the live renderer
// used to accept inbound messages from ANY origin — so a hostile frame could
// drive the bridge (scroll/leak section rects) and, worse, send a
// `page_id_change` whose `next_url` the renderer fed straight into
// `location.replace` (navigate the trusted preview to an attacker URL). These
// helpers gate both: only the editor's origin may drive the bridge, and a
// navigation target must be a same-origin `/_preview/` path.
// =====================================================================

/** Hardcoded trusted editor origins (prod + local dev). */
export const SAFE_PARENT_ORIGINS: ReadonlySet<string> = new Set<string>([
  "http://localhost:3000", // platform dev
  "https://platform.scheniders.com", // production platform
]);

/**
 * True when `origin` is a trusted editor origin allowed to drive the preview.
 * Accepts the hardcoded set, the deploy-configured `NEXT_PUBLIC_PLATFORM_ORIGIN`,
 * and any localhost/127.0.0.1 origin (dev runs the editor on localhost). An
 * empty/opaque origin is rejected.
 */
export function isAllowedParentOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (SAFE_PARENT_ORIGINS.has(origin)) return true;
  const env = process.env.NEXT_PUBLIC_PLATFORM_ORIGIN;
  if (env && origin === env) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
  } catch {
    /* opaque / malformed origin → not trusted */
  }
  return false;
}

/**
 * Target origin for OUTBOUND messages to the parent. Locked to the configured
 * platform origin in production so section data can't leak to a hostile
 * embedder; `"*"` only in dev (no env set), where the parent is localhost.
 */
export function platformTargetOrigin(): string {
  return process.env.NEXT_PUBLIC_PLATFORM_ORIGIN || "*";
}

/**
 * True when `url` is a safe preview navigation target: same-origin and under
 * `/_preview/`. Defense-in-depth so even a trusted-origin editor can't push the
 * iframe off-site via `page_id_change`.
 */
export function isSafePreviewNavUrl(url: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/_preview/");
  } catch {
    return false;
  }
}
