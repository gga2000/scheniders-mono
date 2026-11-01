// The browser facts a server Purchase event needs for ad matching, read from
// the order request itself (see lib/capi.ts). Must be called while the
// request is in scope — before handing the send to `after()`.

import { cookies, headers } from "next/headers";
import { AD_ATTRIBUTION_COOKIE, deserializeAdAttribution } from "@scheniders/shared/ad-attribution";
import type { CapiRequestContext } from "./capi";
import { clientIp } from "./rate-limit";

/**
 * Meta's click cookie value for a click id: «fb.1.<ms>.<fbclid>». The ms is
 * when the click was seen; the store does not keep that moment, so the
 * order's own time stands in (Meta accepts it; the click id is what matches).
 */
export function fbcFromClickId(fbclid: string, nowMs: number): string {
  return `fb.1.${nowMs}.${fbclid}`;
}

export async function capiRequestContext(nowMs: number = Date.now()): Promise<CapiRequestContext> {
  const h = await headers();
  const c = await cookies();
  // The last ad click the storefront recorded (proxy, 30 days). It backs up
  // the pixel's own _fbc cookie, which an ad blocker or Safari's limits on
  // script-set cookies can remove or cut short.
  const click = deserializeAdAttribution(c.get(AD_ATTRIBUTION_COOKIE)?.value);
  const fbcCookie = c.get("_fbc")?.value ?? null;
  return {
    ip: clientIp(h),
    userAgent: h.get("user-agent"),
    // A server action posts from the page the shopper is on.
    url: h.get("referer"),
    fbp: c.get("_fbp")?.value ?? null,
    fbc: fbcCookie ?? (click?.fbclid ? fbcFromClickId(click.fbclid, nowMs) : null),
    ttp: c.get("_ttp")?.value ?? null,
    ttclid: click?.ttclid ?? null,
  };
}
