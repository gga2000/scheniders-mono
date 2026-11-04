// First-party Meta ad cookies, set by the server (Meta's fbp/fbc guide:
// developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/fbp-and-fbc).
//
// The pixel writes `_fbp` / `_fbc` from JavaScript once it loads. A cookie a
// script writes is capped at 7 days on iPhone Safari, and never written when
// an ad blocker stops the pixel or the shopper leaves before it loads. The
// same cookies set in the server's response live their full 90 days and
// exist from the very first page, so the order's server event can still say
// which ad click and which browser it came from.
//
// Not httpOnly: the pixel reads and keeps using them. Formats follow Meta:
//   _fbc = fb.1.<ms when the click was first seen>.<fbclid, case kept>
//   _fbp = fb.1.<ms when created>.<random number>
// The subdomain index is 1, Meta's value for a server-made cookie.

export const FBC_COOKIE = "_fbc";
export const FBP_COOKIE = "_fbp";
/** 90 days, the lifetime Meta uses for both cookies. */
export const META_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

const FBCLID = /^[\w-]{10,500}$/;

export interface MetaCookieUpdate {
  name: typeof FBC_COOKIE | typeof FBP_COOKIE;
  value: string;
}

/**
 * The Meta cookies this response should set. `_fbc` is written when the
 * landing URL carries an fbclid that the stored cookie does not already
 * hold (a new click replaces an old one); `_fbp` only when the browser has
 * none, so the pixel's own id is never replaced.
 */
export function metaCookieUpdates(input: {
  fbclid: string | null;
  fbc: string | undefined;
  fbp: string | undefined;
  nowMs: number;
  /** A random positive integer (injectable for tests). */
  random: number;
}): MetaCookieUpdate[] {
  const updates: MetaCookieUpdate[] = [];
  const fbclid = input.fbclid?.trim();
  if (fbclid && FBCLID.test(fbclid)) {
    const stored = input.fbc?.split(".").slice(3).join(".");
    if (stored !== fbclid) {
      updates.push({ name: FBC_COOKIE, value: `fb.1.${input.nowMs}.${fbclid}` });
    }
  }
  if (!input.fbp) {
    updates.push({ name: FBP_COOKIE, value: `fb.1.${input.nowMs}.${input.random}` });
  }
  return updates;
}

/** A 10-digit random id, like the pixel's own. */
export function randomFbpId(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return 1_000_000_000 + ((buf[0] ?? 0) % 9_000_000_000);
}
