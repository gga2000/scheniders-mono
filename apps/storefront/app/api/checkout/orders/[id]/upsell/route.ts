import { NextResponse } from "next/server";
import { z } from "zod";
import {
  eligiblePostPurchaseOffers,
  normalizeIraqiMobile,
  postPurchasePrice,
  type OrderBumpOffer,
} from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// =====================================================================
// Post-purchase upsell — GET lists offers, POST accepts one
// =====================================================================
// The thank-you page may offer one more add-on and append it to the order
// that was JUST placed, without a second checkout. That "just placed" is
// the whole security model, so it is enforced strictly:
//
//   - the order must still be `new` — once ops have touched it, it is
//     theirs, and a line appearing after a confirmation call is a mess
//   - it must be less than UPSELL_WINDOW_MS old
//   - the caller must know the order id AND the phone it was placed with
//     (last ten digits, the same rule `lookup_order` uses)
//
// This does NOT touch /api/checkout/orders. That contract is frozen; this
// is a separate endpoint with its own, narrower job.
// =====================================================================

/** An hour matches the thank-you page's own stash TTL. */
const UPSELL_WINDOW_MS = 60 * 60 * 1000;

const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  phone: z.string().min(7),
});

const acceptSchema = bodySchema.extend({
  product_id: z.string().uuid(),
});

type OrderLine = {
  product_id: string;
  variant_id: string | null;
  name: string;
  variant_name: string | null;
  price: number;
  quantity: number;
};

function lastTen(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function isLine(v: unknown): v is OrderLine {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.product_id === "string" &&
    typeof o.price === "number" &&
    typeof o.quantity === "number"
  );
}

/**
 * Load the order and prove the caller may act on it. Every failure is the
 * same 404 on purpose: distinguishing "wrong phone" from "no such order"
 * would let someone probe order ids.
 */
async function loadOwnedOrder(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  orderId: string,
  tenantId: string,
  phone: string,
) {
  const normalized = normalizeIraqiMobile(phone);
  if (!normalized) return null;

  const { data: order, error } = await svc
    .from("orders")
    .select("id, tenant_id, status, phone, items, price, delivery_fee, created_at, version, deleted_at")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !order || order.deleted_at) return null;
  if (order.status !== "new") return null;
  if (Date.now() - new Date(order.created_at).getTime() > UPSELL_WINDOW_MS) return null;
  if (lastTen(order.phone ?? "") !== lastTen(normalized)) return null;

  const items = Array.isArray(order.items) ? order.items.filter(isLine) : [];
  return { ...order, items };
}

async function loadOffers(
  svc: ReturnType<typeof createSupabaseServiceClient>,
  tenantId: string,
  items: OrderLine[],
) {
  const orderedIds = [...new Set(items.map((i) => i.product_id))];
  const { data: bumpRows } = await svc
    .from("product_order_bumps")
    .select("product_id, bump_product_id, discount_percentage, headline, description, is_active, display_order")
    .in("product_id", orderedIds)
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const bumps: OrderBumpOffer[] = (bumpRows ?? []).map((b) => ({
    product_id: b.product_id,
    bump_product_id: b.bump_product_id,
    discount_percentage: Number(b.discount_percentage),
    headline: b.headline,
    description: b.description,
    is_active: b.is_active,
    display_order: b.display_order,
  }));
  const offers = eligiblePostPurchaseOffers(items, bumps);
  if (offers.length === 0) return [];

  // Only public, in-stock products can be offered — the same bar the
  // storefront applies everywhere else.
  const { data: products } = await svc
    .from("products")
    .select("id, name, short_name, image_url, price, website_price, is_visible, is_archived, is_supply, stock_quantity, reserved_quantity")
    .in("id", offers.map((o) => o.product_id))
    .eq("tenant_id", tenantId);
  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  return offers.flatMap((offer) => {
    const p = byId.get(offer.product_id);
    if (!p || p.is_archived || !p.is_visible || (p as { is_supply?: boolean }).is_supply) return [];
    if ((p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0) <= 0) return [];
    const base = Number(p.website_price ?? p.price) || 0;
    if (base <= 0) return [];
    return [{
      product_id: p.id,
      name: p.short_name || p.name,
      image_url: p.image_url,
      base_price: base,
      offer_price: postPurchasePrice(base, offer),
      discount_percentage: offer.discount_percentage,
      headline: offer.headline ?? null,
      description: offer.description ?? null,
    }];
  });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  const url = new URL(req.url);
  const parsed = bodySchema.safeParse({
    tenant_id: url.searchParams.get("tenant_id"),
    phone: url.searchParams.get("phone"),
  });
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ offers: [] }, { status: 400 });
  }

  const svc = createSupabaseServiceClient();
  const order = await loadOwnedOrder(svc, id, parsed.data.tenant_id, parsed.data.phone);
  if (!order) return NextResponse.json({ offers: [] }, { status: 404 });

  const offers = await loadOffers(svc, parsed.data.tenant_id, order.items);
  return NextResponse.json({ offers });
}

export async function POST(req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = acceptSchema.safeParse(raw);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const svc = createSupabaseServiceClient();
  const order = await loadOwnedOrder(svc, id, parsed.data.tenant_id, parsed.data.phone);
  if (!order) return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });

  // Re-derive eligibility and price HERE. The GET response is a suggestion;
  // this is the only place the number that lands on the order is decided.
  const offers = await loadOffers(svc, parsed.data.tenant_id, order.items);
  const offer = offers.find((o) => o.product_id === parsed.data.product_id);
  if (!offer) {
    return NextResponse.json({ success: false, error: "Offer not available" }, { status: 409 });
  }

  const line: OrderLine = {
    product_id: offer.product_id,
    variant_id: null,
    name: offer.name,
    variant_name: null,
    price: offer.offer_price,
    quantity: 1,
  };
  const newPrice = Number(order.price) + offer.offer_price;

  // Optimistic on `version`: a BEFORE UPDATE trigger bumps it on every write,
  // so if ops touched the order between our read and this write, zero rows
  // match and nothing is appended over their change. Updating `items` fires
  // the inventory trigger, which reserves the new line's stock.
  const { data: updated, error } = await svc
    .from("orders")
    .update({ items: [...order.items, line], price: newPrice })
    .eq("id", order.id)
    .eq("version", order.version)
    .eq("status", "new")
    .select("price, delivery_fee")
    .maybeSingle();
  if (error || !updated) {
    return NextResponse.json({ success: false, error: "Order changed — please refresh" }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    offer_price: offer.offer_price,
    total: Number(updated.price) + Number(updated.delivery_fee ?? 0),
  });
}
