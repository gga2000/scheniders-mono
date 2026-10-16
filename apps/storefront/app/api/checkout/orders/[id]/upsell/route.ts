import { NextResponse } from "next/server";
import { z } from "zod";
import {
  computeDeliveryFee,
  eligiblePostPurchaseOffers,
  postPurchasePrice,
  resolveTierPrice,
  stackDiscounts,
  type GovernorateCode,
  type OrderBumpOffer,
  type PriceTier,
  type StoreConfigV2,
} from "@scheniders/shared";
import type { Json } from "@scheniders/supabase";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  UPSELL_WINDOW_MS,
  upsellProofSecret,
  verifyUpsellProof,
} from "@/lib/order-upsell-proof";
import { tenantOrderBlock, type TenantOrderGateRow } from "@/lib/tenant-order-gate";
import { productsSoldByVariant, VariantReadError } from "@/lib/variant-products";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// =====================================================================
// Post-purchase upsell — GET lists offers, POST accepts one
// =====================================================================
// The thank-you page may offer one more add-on and append it to the order
// that was JUST placed, without a second checkout. Who may do that, and
// when, is the whole design:
//
//   - WHO: the caller presents the `x-upsell-proof` the checkout minted in
//     the response that created this order (lib/order-upsell-proof). The
//     order id alone proves nothing — it reaches merchant tools, webhooks
//     and couriers — and the order number is sequential. The tenant comes
//     from the proof, never from the request.
//   - WHEN: the order is still `new` (ops have not touched it) and under
//     UPSELL_WINDOW_MS old, checked against the database row, not the proof.
//   - WHAT: offers are the merchant's own order bumps for something in the
//     order; eligibility and price are re-derived from the database on every
//     POST. The GET is only a suggestion.
//
// Every refusal of WHO or WHEN is the same 404, so the route cannot be used
// to learn whether an order exists. This does not touch /api/checkout/orders;
// that contract is frozen.
// =====================================================================

const PROOF_HEADER = "x-upsell-proof";

const acceptSchema = z.object({ product_id: z.string().uuid() });

type Svc = ReturnType<typeof createSupabaseServiceClient>;

/** What a stored order line must look like for eligibility. Lines that do
 *  not parse are kept on the order untouched — only their ids are needed
 *  here, and rewriting a line we do not understand would lose data. */
const lineSchema = z.object({ product_id: z.string(), quantity: z.number() });

interface OwnedOrder {
  id: string;
  tenantId: string;
  /** The stored items array, exactly as read — appended to, never rebuilt. */
  rawItems: Json[];
  lines: Array<{ product_id: string; quantity: number }>;
  price: number;
  deliveryFee: number;
  discountAmount: number;
  governorate: string | null;
  version: number;
}

class UpsellReadError extends Error {}

const notFound = () => NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
const unavailable = () =>
  NextResponse.json({ success: false, error: "Try again shortly" }, { status: 503 });

/** The proof's claims, when it is valid for THIS order id. */
function provenTenant(req: Request, orderId: string): string | null {
  const secret = upsellProofSecret();
  if (!secret) return null;
  const proof = verifyUpsellProof(req.headers.get(PROOF_HEADER), secret);
  if (!proof || proof.orderId !== orderId) return null;
  return proof.tenantId;
}

async function loadOrder(svc: Svc, orderId: string, tenantId: string): Promise<OwnedOrder | null> {
  const { data: order, error } = await svc
    .from("orders")
    .select("id, tenant_id, status, items, price, delivery_fee, discount_amount, governorate_code, created_at, version, deleted_at")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new UpsellReadError(`order read failed: ${error.message}`);
  if (!order || order.deleted_at) return null;
  if (order.status !== "new") return null;
  if (Date.now() - new Date(order.created_at).getTime() > UPSELL_WINDOW_MS) return null;

  const rawItems: Json[] = Array.isArray(order.items) ? order.items : [];
  const lines = rawItems.flatMap((item) => {
    const parsed = lineSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    id: order.id,
    tenantId,
    rawItems,
    lines,
    price: Number(order.price) || 0,
    deliveryFee: Number(order.delivery_fee) || 0,
    discountAmount: Number(order.discount_amount) || 0,
    governorate: order.governorate_code,
    version: order.version,
  };
}

interface TenantRow extends TenantOrderGateRow {
  store_config_v2: StoreConfigV2 | null;
}

async function loadTenant(svc: Svc, tenantId: string): Promise<TenantRow | null> {
  const { data, error } = await svc
    .from("tenants")
    .select("status, restrictions, store_config_v2")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new UpsellReadError(`tenant read failed: ${error.message}`);
  // Cast for the same reason as the checkout: `restrictions` and the
  // 'limited' status are newer than the generated DB types.
  return (data as unknown as TenantRow | null) ?? null;
}

interface PricedOffer {
  product_id: string;
  name: string;
  image_url: string | null;
  base_price: number;
  offer_price: number;
  discount_percentage: number;
  headline: string | null;
  description: string | null;
}

async function loadOffers(svc: Svc, order: OwnedOrder): Promise<PricedOffer[]> {
  const orderedIds = [...new Set(order.lines.map((l) => l.product_id))];
  if (orderedIds.length === 0) return [];

  const { data: bumpRows, error: bumpsErr } = await svc
    .from("product_order_bumps")
    .select("product_id, bump_product_id, discount_percentage, headline, description, is_active, display_order")
    .in("product_id", orderedIds)
    .eq("tenant_id", order.tenantId)
    .eq("is_active", true);
  if (bumpsErr) throw new UpsellReadError(`bump read failed: ${bumpsErr.message}`);

  const bumps: OrderBumpOffer[] = (bumpRows ?? []).map((b) => ({
    product_id: b.product_id,
    bump_product_id: b.bump_product_id,
    discount_percentage: Number(b.discount_percentage),
    headline: b.headline,
    description: b.description,
    is_active: b.is_active,
    display_order: b.display_order,
  }));
  const offers = eligiblePostPurchaseOffers(order.lines, bumps);
  if (offers.length === 0) return [];
  const offerIds = offers.map((o) => o.product_id);

  // Only orderable products: the same visible / active / not archived / not
  // supply bar the checkout applies to a cart line, plus stock on hand.
  const { data: products, error: productsErr } = await svc
    .from("products")
    .select("id, name, short_name, image_url, price, website_price, status, is_visible, is_archived, is_supply, stock_quantity, reserved_quantity")
    .in("id", offerIds)
    .eq("tenant_id", order.tenantId)
    .eq("is_visible", true)
    .eq("status", "active")
    .eq("is_archived", false)
    .not("is_supply", "is", true);
  if (productsErr) throw new UpsellReadError(`product read failed: ${productsErr.message}`);

  // The add-on's own quantity tier for one unit, so the discount lands on the
  // same unit price the checkout bump uses.
  const { data: tierRows, error: tiersErr } = await svc
    .from("product_tiered_pricing")
    .select("product_id, min_quantity, max_quantity, price")
    .in("product_id", offerIds)
    .eq("tenant_id", order.tenantId);
  if (tiersErr) throw new UpsellReadError(`tier read failed: ${tiersErr.message}`);
  const tiersByProduct = new Map<string, PriceTier[]>();
  for (const t of tierRows ?? []) {
    const list = tiersByProduct.get(t.product_id) ?? [];
    list.push({ min_quantity: t.min_quantity, max_quantity: t.max_quantity, price: Number(t.price) });
    tiersByProduct.set(t.product_id, list);
  }

  // A product sold by variant cannot be appended as a variant-less line: the
  // shopper never chose a size, and the checkout refuses such lines too (the
  // same rule, lib/variant-products). Such add-ons are not offered here.
  const hasVariants = await productsSoldByVariant(svc, order.tenantId, offerIds);

  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  return offers.flatMap((offer) => {
    const p = byId.get(offer.product_id);
    if (!p || hasVariants.has(p.id)) return [];
    if ((p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0) <= 0) return [];
    const listed = Number(p.website_price ?? p.price) || 0;
    if (listed <= 0) return [];
    const base = resolveTierPrice(tiersByProduct.get(p.id), 1, listed);
    return [
      {
        product_id: p.id,
        name: p.short_name?.trim() || p.name,
        image_url: p.image_url,
        base_price: base,
        offer_price: postPurchasePrice(base, offer),
        discount_percentage: offer.discount_percentage,
        headline: offer.headline ?? null,
        description: offer.description ?? null,
      },
    ];
  });
}

/** What the courier collects: line subtotal, less discounts, plus delivery —
 *  the same sum the checkout returns as `total`. */
/** The stored discount is capped at the line subtotal, the same arithmetic the
 *  checkout uses (`stackDiscounts`), so a total is never below delivery. */
const orderTotal = (price: number, discount: number, delivery: number) =>
  price - stackDiscounts(price, [discount]).total + delivery;

const alreadyAdded = (order: OwnedOrder) =>
  NextResponse.json({
    success: true,
    already_added: true,
    total: orderTotal(order.price, order.discountAmount, order.deliveryFee),
  });

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return notFound();
  const tenantId = provenTenant(req, id);
  if (!tenantId) return notFound();

  const svc = createSupabaseServiceClient();
  try {
    const [order, tenant] = await Promise.all([loadOrder(svc, id, tenantId), loadTenant(svc, tenantId)]);
    if (!order || !tenant || tenantOrderBlock(tenant)) return notFound();
    return NextResponse.json({ success: true, offers: await loadOffers(svc, order) });
  } catch (e) {
    if (!(e instanceof UpsellReadError || e instanceof VariantReadError)) throw e;
    console.error("[upsell] GET", e.message);
    return unavailable();
  }
}

export async function POST(req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return notFound();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = acceptSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }
  const productId = parsed.data.product_id;

  const tenantId = provenTenant(req, id);
  if (!tenantId) return notFound();

  const svc = createSupabaseServiceClient();
  try {
    const [order, tenant] = await Promise.all([loadOrder(svc, id, tenantId), loadTenant(svc, tenantId)]);
    if (!order || !tenant || tenantOrderBlock(tenant)) return notFound();

    // Idempotent: a double tap, or a retry after a lost response, finds the
    // add-on already on the order and reports the order as it stands rather
    // than appending a second one.
    if (order.lines.some((l) => l.product_id === productId)) return alreadyAdded(order);

    // Re-derive eligibility and price HERE. The GET response is a suggestion;
    // this is the only place the number that lands on the order is decided.
    const offer = (await loadOffers(svc, order)).find((o) => o.product_id === productId);
    if (!offer) {
      return NextResponse.json({ success: false, error: "Offer not available" }, { status: 409 });
    }

    const line = {
      product_id: offer.product_id,
      variant_id: null,
      name: offer.name,
      variant_name: null,
      price: offer.offer_price,
      quantity: 1,
    };
    const newPrice = order.price + offer.offer_price;

    // Delivery is the shared engine's call, exactly as at checkout: a basket
    // that now clears the free-delivery threshold stops paying for it. A fee
    // someone on the merchant's side already changed by hand is theirs and is
    // left alone — recompute only when the stored fee is still the engine's.
    const shipping = tenant.store_config_v2?.commerce?.shipping;
    const governorate = order.governorate as GovernorateCode | null;
    const paidCount = order.lines.reduce((n, l) => n + l.quantity, 0);
    const engineFee = computeDeliveryFee(order.price, paidCount, { shipping, governorate });
    const newDeliveryFee =
      order.deliveryFee === engineFee
        ? computeDeliveryFee(newPrice, paidCount + 1, { shipping, governorate })
        : order.deliveryFee;

    // Optimistic on `version`, which a BEFORE UPDATE trigger bumps on every
    // write: if anything changed the order since the read above, zero rows
    // match and nothing lands on top of that change. `status = new` is
    // re-asserted in the same statement. Inventory: `new` maps to the CLOSED
    // phase (inv_phase), so this items change reserves nothing now; the move
    // to `confirmed` applies inv_apply to every line, the add-on included.
    const { data: updated, error: updateErr } = await svc
      .from("orders")
      .update({ items: [...order.rawItems, line], price: newPrice, delivery_fee: newDeliveryFee })
      .eq("id", order.id)
      .eq("tenant_id", order.tenantId)
      .eq("version", order.version)
      .eq("status", "new")
      .select("price, delivery_fee, discount_amount")
      .maybeSingle();
    if (updateErr) {
      console.error("[upsell] POST update failed", updateErr.message);
      return unavailable();
    }
    if (!updated) {
      // Lost a race. If the race was this same add-on (a concurrent double
      // submit), that is success; anything else changed the order under us.
      const current = await loadOrder(svc, id, tenantId);
      if (current?.lines.some((l) => l.product_id === productId)) return alreadyAdded(current);
      return NextResponse.json({ success: false, error: "Order changed" }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      offer_price: offer.offer_price,
      total: orderTotal(
        Number(updated.price) || 0,
        Number(updated.discount_amount) || 0,
        Number(updated.delivery_fee) || 0,
      ),
    });
  } catch (e) {
    if (!(e instanceof UpsellReadError || e instanceof VariantReadError)) throw e;
    console.error("[upsell] POST", e.message);
    return unavailable();
  }
}
