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

/**
 * Local dev runs the editor on localhost. A production store never trusts it:
 * any page served on a visitor's own machine could otherwise frame the store
 * or drive the preview bridge.
 */
const TRUST_LOCALHOST = process.env.NODE_ENV !== "production";

/** Hardcoded trusted editor origins (prod, plus local dev outside production). */
export const SAFE_PARENT_ORIGINS: ReadonlySet<string> = new Set<string>([
  "https://schenidersapp.xyz", // production platform (merchant admin)
  ...(TRUST_LOCALHOST ? ["http://localhost:3000"] : []), // platform dev
]);

/**
 * True when `origin` is a trusted editor origin allowed to drive the preview.
 * Accepts the hardcoded set, the deploy-configured `NEXT_PUBLIC_PLATFORM_ORIGIN`,
 * and, outside production, any localhost/127.0.0.1 origin. An
 * empty/opaque origin is rejected.
 */
export function isAllowedParentOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (SAFE_PARENT_ORIGINS.has(origin)) return true;
  const env = process.env.NEXT_PUBLIC_PLATFORM_ORIGIN;
  if (env && origin === env) return true;
  if (!TRUST_LOCALHOST) return false;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
  } catch {
    /* opaque / malformed origin → not trusted */
  }
  return false;
}

/**
 * Target origin for OUTBOUND messages to the parent: the embedding editor's
 * own origin, and only when that origin is trusted. Read from
 * `location.ancestorOrigins` (Chromium/Safari) or the referrer (Firefox).
 * Returns null when the embedder is unknown or untrusted, so section data
 * is never posted to `"*"` or to a hostile frame.
 */
export function platformTargetOrigin(): string | null {
  if (typeof window === "undefined") return null;
  const candidates: string[] = [];
  const ancestors = window.location.ancestorOrigins;
  if (ancestors && ancestors.length > 0) candidates.push(ancestors[0]);
  if (document.referrer) {
    try {
      candidates.push(new URL(document.referrer).origin);
    } catch {
      /* malformed referrer → ignored */
    }
  }
  return candidates.find((o) => isAllowedParentOrigin(o)) ?? null;
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
