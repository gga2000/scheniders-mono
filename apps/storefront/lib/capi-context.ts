// The browser facts a server Purchase event needs for ad matching, read from
// the order request itself (see lib/capi.ts). Must be called while the
// request is in scope — before handing the send to `after()`.

import { cookies, headers } from "next/headers";
import type { CapiRequestContext } from "./capi";
import { clientIp } from "./rate-limit";

export async function capiRequestContext(): Promise<CapiRequestContext> {
  const h = await headers();
  const c = await cookies();
  return {
    ip: clientIp(h),
    userAgent: h.get("user-agent"),
    // A server action posts from the page the shopper is on.
    url: h.get("referer"),
    fbp: c.get("_fbp")?.value ?? null,
    fbc: c.get("_fbc")?.value ?? null,
    ttp: c.get("_ttp")?.value ?? null,
  };
}
