import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { clientIp } from "@/lib/rate-limit";
import { isLikelyBot } from "@/lib/bot-user-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// First-party funnel beacon. The visitor key is the httpOnly sb_vid cookie
// the proxy sets — never a client value — so a page cannot forge another
// visitor. `purchase` is deliberately not accepted here: the checkout route
// records it server-side with the server-computed total.
//
// This route is unauthenticated by nature: it counts anonymous shoppers. That
// makes two things load-bearing, because it writes with the service role and
// so answers to no RLS policy of its own:
//
//   * `tenant_id` arrives from the client. Inserted verbatim it would let a
//     caller attribute events to any uuid at all — junk rows for tenants that
//     do not exist, or noise in a real merchant's funnel. It is resolved
//     against a publicly live tenant (status active or trial, the anon
//     storefront gate) inside record_storefront_beacon; anything else is dropped.
//   * Volume must be bounded. Each address and each visitor gets a fixed
//     window. The address window matters because a script can send any
//     sb_vid it likes: a per-visitor window alone is one fresh cookie away
//     from unlimited.
//
// A determined caller with a real tenant's id can still spend its own windows
// adding noise to that merchant's counts. That is the residual, and it is
// bounded rather than unlimited.

/** Beacon requests (each up to 20 events) per address and per visitor, per
 *  minute. A real shopper browsing fast sends a handful of batches a minute;
 *  the address limit leaves room for a household or office behind one NAT. */
const BATCHES_PER_VISITOR_PER_MINUTE = 120;
const BATCHES_PER_IP_PER_MINUTE = 600;
const WINDOW_SECONDS = 60;

const eventSchema = z.object({
  type: z.enum(["page_view", "view_product", "add_to_cart", "initiate_checkout"]),
  page_id: z.string().max(64).optional(),
  product_id: z.string().uuid().optional(),
});
const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  events: z.array(eventSchema).min(1).max(20),
});
/** The proxy mints a UUID; anything else did not come from it. */
const visitorKeySchema = z.string().uuid();

const NO_CONTENT = (): NextResponse => new NextResponse(null, { status: 204 });

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { tenant_id, events } = parsed.data;

  // Nothing to attribute to — a beacon is fire-and-forget, 204 is the answer.
  const visitor = visitorKeySchema.safeParse((await cookies()).get("sb_vid")?.value);
  if (!visitor.success) return NO_CONTENT();
  const visitorKey = visitor.data;

  // Crawlers run the page's JS too; they are not shoppers and would drag the
  // merchant's conversion rate down.
  if (isLikelyBot(req.headers.get("user-agent"))) return NO_CONTENT();

  // One round trip: record_storefront_beacon spends the address and visitor
  // windows, checks the tenant is live and inserts the batch, in that order.
  // It used to be four PostgREST calls per batch, about half of all storefront
  // database traffic under ad bursts. A beacon never reports failure to the
  // page, so a spent window, a dead tenant and a database error are all a
  // silent 204; only the error is logged.
  const ip = clientIp(req.headers);
  const { error } = await createSupabaseServiceClient().rpc("record_storefront_beacon", {
    _tenant_id: tenant_id,
    _visitor_key: visitorKey,
    _visitor_key_limit_key: `events:visitor:${tenant_id}:${visitorKey}`,
    _visitor_limit: BATCHES_PER_VISITOR_PER_MINUTE,
    _ip_limit: BATCHES_PER_IP_PER_MINUTE,
    _window_seconds: WINDOW_SECONDS,
    _events: events,
    ...(ip !== "unknown" ? { _ip_key: `events:ip:${ip}` } : {}),
  });
  if (error) console.error("[events] record failed:", error);
  return NO_CONTENT();
}
