import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { isLikelyBot } from "@/lib/bot-user-agent";
import { META_BROWSE_EVENTS, sendMetaBrowseCapi } from "@/lib/capi";
import { liveStoreAnalytics } from "@/lib/capi-config";
import { capiRequestContext } from "@/lib/capi-context";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
import { resolveStoreTenant } from "@/lib/route-guards";
import { storeKeyFromRequest } from "@/lib/store-host";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server copy of a browser funnel event (ViewContent / AddToCart /
// InitiateCheckout), the "redundant setup" Meta's Conversions API best
// practices ask for. The browser pixel fires the same event with the same
// eventID, so Meta keeps one of the two; the server copy still arrives when an
// ad blocker or the browser drops the pixel's request, and it carries the
// first-party cookies, IP and user agent from the request itself.
//
// Unauthenticated by nature, like the pixel: everything it forwards (product
// ids, value) is what any page could already send to the store's public pixel
// id. What it adds is the store's token, which never leaves the server. Only a
// live store with a Conversions API token sends; the token is read through a
// 60 s cache, so the route costs the database ~one read per store per minute.

const contentSchema = z.object({
  id: z.string().min(1).max(64),
  quantity: z.number().int().min(0).max(1000),
  item_price: z.number().min(0).max(1e9),
});
const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  event_name: z.enum(META_BROWSE_EVENTS),
  event_id: z.string().min(8).max(64),
  value: z.number().min(0).max(1e10),
  contents: z.array(contentSchema).min(1).max(50),
});

// Forged beacons (a rival scripting fake funnel events) would skew the store's
// ad optimisation or A/B result. A real shopper sends a handful per page; the
// cap is far above that. Fail-open: an analytics beacon must never break a
// page, and a limiter outage only loses the cap, not the event's checks.
const BEACONS_PER_IP = 120;
const BEACON_WINDOW_SECONDS = 600;

const NO_CONTENT = (): NextResponse => new NextResponse(null, { status: 204 });

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const body = parsed.data;

  // Crawlers run page JS too; they are not shoppers. A request without the
  // proxy's visitor cookie did not come from a store page.
  if (isLikelyBot(req.headers.get("user-agent"))) return NO_CONTENT();
  if (!(await cookies()).get("sb_vid")?.value) return NO_CONTENT();
  const ip = clientIp(req.headers);
  if (ip !== "unknown") {
    const cap = await consumeRateLimit(`meta-event:ip:${ip}`, BEACONS_PER_IP, BEACON_WINDOW_SECONDS, "fail-open");
    if (!cap.allowed) return NO_CONTENT();
  }

  // The store is the one whose page sent the beacon (host, or /s/<slug> on
  // the root domain), never just the body: a beacon naming another store is
  // dropped, so nobody can spend a rival's Conversions API token from here.
  const storeKey = storeKeyFromRequest(req.headers);
  if (!storeKey) return NO_CONTENT();
  const store = await resolveStoreTenant(storeKey);
  if (!store || store.id !== body.tenant_id || store.is_draft_view) return NO_CONTENT();

  const analytics = await liveStoreAnalytics(body.tenant_id);
  if (!analytics?.meta_pixel_id || !analytics.meta_capi_token) return NO_CONTENT();

  const input = {
    analytics,
    tenantId: body.tenant_id,
    eventName: body.event_name,
    eventId: body.event_id,
    value: body.value,
    contents: body.contents,
    // Read while the request is in scope; the page sending the beacon is its
    // Referer, which is the event's source URL.
    context: await capiRequestContext(body.tenant_id),
  };
  after(() => sendMetaBrowseCapi(input));
  return NO_CONTENT();
}
