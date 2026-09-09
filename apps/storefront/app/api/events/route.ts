import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// First-party funnel beacon. The visitor key is the httpOnly sb_vid cookie
// the proxy sets — never a client value — so a page cannot forge another
// visitor. `purchase` is deliberately not accepted here: the checkout route
// records it server-side with the server-computed total.
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

  const svc = createSupabaseServiceClient();
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
