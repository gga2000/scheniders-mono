import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { consumeRateLimit } from "@/lib/rate-limit";

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
//   * `tenant_id` arrives from the client and used to be inserted verbatim, so
//     a caller could attribute events to any uuid at all — junk rows for
//     tenants that do not exist, or noise in a real merchant's funnel. It is
//     now resolved against a servable tenant first, and a request naming
//     anything else is dropped.
//   * Nothing bounded volume. Twenty rows per request, unlimited requests, no
//     authentication: the table grew as fast as anyone cared to push. Each
//     visitor now gets a fixed window.
//
// A determined caller with a real tenant's id can still spend its own window
// adding noise to that merchant's counts. That is the residual, and it is
// bounded and attributable rather than unlimited.
const eventSchema = z.object({
  type: z.enum(["page_view", "view_product", "add_to_cart", "initiate_checkout"]),
  page_id: z.string().max(64).optional(),
  product_id: z.string().uuid().optional(),
});
const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  events: z.array(eventSchema).min(1).max(20),
});

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
  const visitorKey = (await cookies()).get("sb_vid")?.value;
  // Nothing to attribute to — a beacon is fire-and-forget, 204 is the answer.
  if (!visitorKey) return new NextResponse(null, { status: 204 });

  // One window per visitor per store. Generous enough that a real shopper
  // browsing quickly never notices, small enough that the table cannot be
  // grown without bound. A beacon never reports failure to the page, so an
  // exhausted window is a silent 204 like every other outcome here.
  const limit = await consumeRateLimit(
    `events:${parsed.data.tenant_id}:${visitorKey}`,
    120,
    60,
  );
  if (!limit.allowed) return new NextResponse(null, { status: 204 });

  const svc = createSupabaseServiceClient();

  // The client says which store this belongs to; the database decides whether
  // that is a store at all. `cancelled` and `suspended` tenants are not served
  // to shoppers, so they have no funnel to record either.
  const { data: tenant } = await svc
    .from("tenants")
    .select("id")
    .eq("id", parsed.data.tenant_id)
    .in("status", ["active", "trial"])
    .maybeSingle();
  if (!tenant) return new NextResponse(null, { status: 204 });

  const { error } = await svc.from("storefront_events").insert(
    parsed.data.events.map((e) => ({
      tenant_id: parsed.data.tenant_id,
      visitor_key: visitorKey,
      event_type: e.type,
      page_id: e.page_id ?? null,
      product_id: e.product_id ?? null,
    })),
  );
  if (error) console.error("[events] insert failed:", error);
  return new NextResponse(null, { status: 204 });
}
