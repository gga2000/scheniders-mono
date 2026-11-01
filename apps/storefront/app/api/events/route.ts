import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
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
//     against a publicly live tenant first, and anything else is dropped.
//   * Volume must be bounded. Each address and each visitor gets a fixed
//     window. The address window matters because a script can send any
//     sb_vid it likes: a per-visitor window alone is one fresh cookie away
//     from unlimited.
//
// A determined caller with a real tenant's id can still spend its own windows
// adding noise to that merchant's counts. That is the residual, and it is
// bounded rather than unlimited.

/** Tenant statuses whose storefront is publicly live — mirrors the anon
 *  `public_storefront_read` RLS gate. Only those have a funnel to record. */
const LIVE_TENANT_STATUSES = ["active", "trial"] as const;

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

  // Fail open: the funnel is a nice-to-have count, and a limiter outage must
  // not take the storefront's beacon down. A beacon never reports failure to
  // the page, so an exhausted window is a silent 204 like every other outcome.
  const ip = clientIp(req.headers);
  const [byIp, byVisitor] = await Promise.all([
    ip !== "unknown"
      ? consumeRateLimit(`events:ip:${ip}`, BATCHES_PER_IP_PER_MINUTE, WINDOW_SECONDS, "fail-open")
      : null,
    consumeRateLimit(
      `events:visitor:${tenant_id}:${visitorKey}`,
      BATCHES_PER_VISITOR_PER_MINUTE,
      WINDOW_SECONDS,
      "fail-open",
    ),
  ]);
  if ((byIp && !byIp.allowed) || !byVisitor.allowed) return NO_CONTENT();

  const svc = createSupabaseServiceClient();

  // The client says which store this belongs to; the database decides whether
  // that is a live store at all.
  const { data: tenant, error: tenantError } = await svc
    .from("tenants")
    .select("id")
    .eq("id", tenant_id)
    .in("status", LIVE_TENANT_STATUSES)
    .maybeSingle();
  if (tenantError) {
    console.error("[events] tenant lookup failed:", tenantError);
    return NO_CONTENT();
  }
  if (!tenant) return NO_CONTENT();

  const { error } = await svc.from("storefront_events").insert(
    events.map((e) => ({
      tenant_id: tenant.id,
      visitor_key: visitorKey,
      event_type: e.type,
      page_id: e.page_id ?? null,
      product_id: e.product_id ?? null,
    })),
  );
  if (error) console.error("[events] insert failed:", error);
  return NO_CONTENT();
}
