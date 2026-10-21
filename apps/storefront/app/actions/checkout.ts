"use server";

import {
  computeDeliveryFee,
  computeDiscount,
  stackDiscounts,
  computeBundleDiscounts,
  computePointsRedemption,
  computeReferralDiscount,
  stampCodRisk,
  normalizeReferralCode,
  normalizeIraqiMobile,
  priceOrderLines,
  resolveFreeGift,
  qualifiesForFreeGift,
  type PriceTier,
  type OrderBumpOffer,
} from "@scheniders/shared";
import type {
  StoreConfigV2,
  GovernorateCode,
  AnalyticsConfig,
} from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendPurchaseCapi } from "@/lib/capi";
import { isDraftViewRequest } from "@/lib/draft-view";
import { tenantOrderBlock, type TenantOrderGateRow } from "@/lib/tenant-order-gate";
import { productsSoldByVariant, VariantReadError } from "@/lib/variant-products";
import { signUpsellProof, upsellProofSecret } from "@/lib/order-upsell-proof";
import { isTransientDbError } from "@/lib/transient-db-error";
import { DUPLICATE_ORDER_WINDOW_MINUTES, isDuplicateGuardRow } from "@/lib/order-duplicate-guard";
import { queueOrderConfirmation } from "@/lib/order-confirmation-queue";

interface CheckoutItem {
  product_id: string;
  variant_id: string | null;
  name: string;
  variant_name: string | null;
  price: number;
  quantity: number;
}

interface SubmitCheckoutPayload {
  tenantId: string;
  /** EC17: dedupe key for a re-submitted order (flaky-3G retry). */
  idempotencyKey?: string;
  /** Discount engine: coupon code (validated + priced server-side). */
  couponCode?: string;
  /** Pixel Purchase event_id — reused by the CAPI server twin for dedup. */
  purchaseEventId?: string;
  /** Loyalty: points the customer chose to redeem (server re-validates). */
  redeemPoints?: number;
  /** Referral: a friend's code; eligibility + amount are re-resolved here. */
  referralCode?: string;
  customer: {
    customer_name: string;
    phone: string;
    /** Already-normalised (07XXXXXXXXX) alternative number, or null. */
    alt_phone?: string | null;
    governorate_code: string;
    city: string;
    address_details: string;
    notes?: string;
  };
  items: CheckoutItem[];
}

/** EC24: why a specific cart line couldn't be ordered, so the client can act
 *  (remove it / update its price) instead of dead-ending on a generic error. */
export type CheckoutIssueReason =
  | "unavailable" // archived / hidden / deleted / supply / bad variant
  | "price_changed" // merchant repriced since add-to-cart
  | "invalid_quantity";

export interface CheckoutIssue {
  product_id: string;
  variant_id: string | null;
  reason: CheckoutIssueReason;
  /** For `price_changed`: the new server price (IQD). */
  new_price?: number;
}

interface SubmitCheckoutResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  error?: string;
  total?: number;
  /** Discount engine: the applied coupon, so the client can confirm/recap it. */
  discount?: { code: string; amount: number };
  /** EC24: populated on a validation failure so the client can self-heal. */
  issues?: CheckoutIssue[];
  /** Proof that the receiving browser placed this order, for the thank-you
   *  page's post-purchase offer (see lib/order-upsell-proof). Only the
   *  response that created the order carries it. */
  upsellToken?: string;
  /** EC17: this answers an order the same idempotency key already placed, so
   *  callers must not record its side effects (funnel purchase) again. */
  replayed?: boolean;
  /** The failure is the platform's (a read or write that did not complete),
   *  not the order's: the same request — same idempotency key — may succeed
   *  when sent again. The route answers it with 503 instead of 422. */
  retryable?: boolean;
  /** Soft duplicate guard: this phone placed an order holding these products
   *  minutes ago, and no new order was created. Always with `replayed`, and
   *  with no order id or number — a phone and a product are not proof of
   *  being that buyer, and an order number plus the phone opens /track. */
  duplicate?: boolean;
}

/** The answer for an order this idempotency key already placed: what was
 *  recorded, with none of a new order's side effects. */
function replayResult(row: {
  id: string;
  order_id: string | null;
  price: number | null;
  discount_amount: number | null;
  delivery_fee: number | null;
}): SubmitCheckoutResult {
  const price = Number(row.price) || 0;
  const discount = stackDiscounts(price, [Number(row.discount_amount) || 0]).total;
  return {
    success: true,
    orderId: row.id,
    orderNumber: row.order_id ?? undefined,
    total: price - discount + (Number(row.delivery_fee) || 0),
    replayed: true,
  };
}

/** create_order_atomic flags a replay once migration
 *  20261017120000_create_order_atomic_reports_idempotent_replay is applied;
 *  before that the key is simply absent. */
function isReplayRow(row: Record<string, unknown> | null): boolean {
  return row?.idempotent_replay === true;
}

/**
 * Creates an order in the platform DB via the create_storefront_order RPC —
 * create_order_atomic, unchanged, behind the soft duplicate guard.
 * Uses the service role client to bypass RLS — the storefront is trusted server code.
 *
 * Mirrors the order shape used by `hooks/use-order-crud.ts` in the platform repo.
 */
export async function submitCheckout(
  payload: SubmitCheckoutPayload,
): Promise<SubmitCheckoutResult> {
  if (payload.items.length === 0) {
    return { success: false, error: "السلة فارغة" };
  }

  // EC23: COD needs a reachable number. Validate as a real Iraqi mobile and
  // store the canonical 07XXXXXXXXX form — landlines, 0000000000, and
  // punctuation junk (which the old `length >= 10` check let through) become
  // unconfirmable, undeliverable orders.
  const phone = normalizeIraqiMobile(payload.customer.phone);
  if (!phone) {
    return { success: false, error: "رقم الهاتف غير صالح" };
  }

  const supabase = createSupabaseServiceClient();

  // Verify tenant status before creating. We pull `restrictions` too, but
  // cast loosely because the shared DB types haven't been regenerated since
  // the column / 'limited' enum value were added.
  const { data: tenantRaw, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, status, restrictions, store_config_v2")
    .eq("id", payload.tenantId)
    .maybeSingle();

  if (tenantErr) {
    console.error("[checkout] tenant lookup failed:", tenantErr);
    return { success: false, error: "المتجر غير متاح", retryable: isTransientDbError(tenantErr) };
  }
  if (!tenantRaw) {
    console.error("[checkout] tenant not found:", payload.tenantId);
    return { success: false, error: "المتجر غير متاح" };
  }

  const tenant = tenantRaw as unknown as TenantOrderGateRow & {
    id: string;
    store_config_v2: StoreConfigV2 | null;
  };

  // Inactive, or paused by an admin with new orders blocked.
  const blocked = tenantOrderBlock(tenant);
  if (blocked) {
    return { success: false, error: blocked };
  }

  // EC17 replay: this key already placed an order (the response was lost and
  // the shopper tapped again). Answer with THAT order and do nothing else — no
  // points redeemed or earned a second time, no new post-purchase proof, no
  // second CAPI purchase. create_order_atomic would return the existing row
  // too, but only after the redemption below had already run.
  if (payload.idempotencyKey) {
    const { data: existing, error: existingErr } = await supabase
      .from("orders")
      .select("id, order_id, price, discount_amount, delivery_fee")
      .eq("tenant_id", payload.tenantId)
      .eq("idempotency_key", payload.idempotencyKey)
      .maybeSingle();
    if (existingErr) {
      console.error("[checkout] idempotency lookup failed:", existingErr);
      return { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى.", retryable: isTransientDbError(existingErr) };
    }
    if (existing) return replayResult(existing);
  }

  // Re-fetch canonical prices from the DB — never trust client-supplied amounts.
  const productIds = Array.from(new Set(payload.items.map((i) => i.product_id)));
  const { data: products, error: productsErr } = await supabase
    .from("products")
    .select("id, tenant_id, name, short_name, price, website_price, status, is_visible, is_archived, is_supply")
    .in("id", productIds)
    .eq("tenant_id", payload.tenantId);

  if (productsErr || !products) {
    console.error("[checkout] product lookup failed:", productsErr);
    return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(productsErr) };
  }
  const productMap = new Map(products.map((p) => [p.id as string, p]));

  const variantIds = payload.items
    .map((i) => i.variant_id)
    .filter((v): v is string => !!v);
  type VariantRow = {
    id: string;
    product_id: string;
    price: number | null;
    tenant_id: string;
    is_enabled: boolean | null;
  };
  const variantMap = new Map<string, VariantRow>();
  // Products sold by variant: a line for one of them must name an enabled
  // variant (see lib/variant-products).
  let soldByVariant: Set<string>;
  try {
    soldByVariant = await productsSoldByVariant(supabase, payload.tenantId, productIds);
  } catch (e) {
    if (!(e instanceof VariantReadError)) throw e;
    console.error("[checkout]", e.message);
    // Classified from the failed read's own code (carried by VariantReadError)
    // like every other read here — never assumed transient.
    return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(e) };
  }
  if (variantIds.length > 0) {
    const { data: variants, error: variantsErr } = await supabase
      .from("product_variants")
      .select("id, product_id, price, tenant_id, is_enabled")
      .in("id", variantIds)
      .eq("tenant_id", payload.tenantId);
    if (variantsErr || !variants) {
      console.error("[checkout] variant lookup failed:", variantsErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(variantsErr) };
    }
    for (const v of variants as VariantRow[]) variantMap.set(v.id, v);
  }

  // Quantity price breaks. Fetched here so the server derives the SAME unit
  // price the product page showed — the price check below rejects any
  // mismatch, so a client-only ladder would bounce every tiered order.
  // Tenant-scoped like everything else; a merchant with no tiers pays for an
  // empty read and nothing changes.
  const tiersByProduct = new Map<string, PriceTier[]>();
  {
    const { data: tierRows, error: tiersErr } = await supabase
      .from("product_tiered_pricing")
      .select("product_id, min_quantity, max_quantity, price")
      .in("product_id", productIds)
      .eq("tenant_id", payload.tenantId);
    if (tiersErr || !tierRows) {
      // Fail closed, like the product lookup above. Pricing at the base
      // instead would tell a shopper who was shown a tier price that their
      // prices "changed" upward when nothing had.
      console.error("[checkout] tier lookup failed:", tiersErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(tiersErr) };
    }
    for (const row of tierRows) {
      const list = tiersByProduct.get(row.product_id) ?? [];
      list.push({
        min_quantity: row.min_quantity,
        max_quantity: row.max_quantity,
        price: Number(row.price),
      });
      tiersByProduct.set(row.product_id, list);
    }
  }

  // Order bumps. Like tiers, the server derives the discounted price itself:
  // the price check below rejects anything it did not compute. The discount
  // only applies when the bump's PARENT product is in this same order —
  // otherwise the bump price would be a coupon claimable by ordering the
  // add-on on its own.
  const bumpOffers: OrderBumpOffer[] = [];
  {
    const { data: bumpRows, error: bumpsErr } = await supabase
      .from("product_order_bumps")
      .select("product_id, bump_product_id, discount_percentage, is_active")
      .in("product_id", productIds)
      .eq("tenant_id", payload.tenantId);
    if (bumpsErr || !bumpRows) {
      // Fail closed, for the same reason as the tier read above.
      console.error("[checkout] bump lookup failed:", bumpsErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(bumpsErr) };
    }
    for (const row of bumpRows) {
      bumpOffers.push({
        product_id: row.product_id,
        bump_product_id: row.bump_product_id,
        discount_percentage: Number(row.discount_percentage),
        is_active: row.is_active,
      });
    }
  }

  // EC24: validate every line and COLLECT per-item issues (unavailable /
  // repriced / bad quantity) instead of dead-ending on the first one with a
  // generic message — so the client can remove or re-price the offending lines
  // and the shopper isn't stuck in a retry loop.
  const issues: CheckoutIssue[] = [];
  // Lines that passed the per-line checks, with their catalogue base price.
  // Pricing itself is order-level (a bump's discount depends on the other
  // lines), so it runs once over all of them below.
  const candidates: Array<{ item: CheckoutItem; basePrice: number }> = [];
  // A product + variant appears once per order. The cart merges repeats, so
  // a duplicate only comes from a hand-built request — the shape of the
  // "N copies of a one-unit bump line" trick — and is refused, not merged.
  const seenLines = new Set<string>();
  for (const i of payload.items) {
    const issue = (reason: CheckoutIssueReason, new_price?: number): void => {
      issues.push({ product_id: i.product_id, variant_id: i.variant_id, reason, new_price });
    };
    const product = productMap.get(i.product_id);
    // Deleted, hidden, draft, archived, or supply (packaging/internal) → not
    // orderable. status carries the merchant's Draft/Archived choice from the
    // product editor, which is_visible does not.
    if (
      !product ||
      product.is_archived ||
      product.status !== "active" ||
      !product.is_visible ||
      (product as { is_supply?: boolean }).is_supply
    ) {
      issue("unavailable");
      continue;
    }
    let unitPrice: number;
    if (i.variant_id) {
      const variant = variantMap.get(i.variant_id);
      if (!variant || variant.product_id !== i.product_id || variant.is_enabled === false) {
        issue("unavailable");
        continue;
      }
      unitPrice = Number(variant.price ?? product.website_price ?? product.price) || 0;
    } else {
      // No variant named for a product sold by variant: no size for the
      // courier and no price the merchant set — and a variant priced above
      // the parent would otherwise be bought at the parent's price.
      if (soldByVariant.has(i.product_id)) {
        issue("unavailable");
        continue;
      }
      unitPrice = Number(product.website_price ?? product.price) || 0;
    }
    if (unitPrice <= 0 || !Number.isFinite(unitPrice)) {
      issue("unavailable");
      continue;
    }
    if (!Number.isInteger(i.quantity) || i.quantity <= 0 || i.quantity > 100) {
      issue("invalid_quantity");
      continue;
    }
    const lineKey = `${i.product_id}:${i.variant_id ?? ""}`;
    if (seenLines.has(lineKey)) {
      issue("invalid_quantity");
      continue;
    }
    seenLines.add(lineKey);
    candidates.push({ item: i, basePrice: unitPrice });
  }

  // The quantity break, then an order-bump discount — the one shared rule the
  // cart and the product page also price with (@scheniders/shared
  // line-pricing). A bump discounts one unit of its add-on per order, only
  // beside a full-price parent, and only for a line priced at the bump (an
  // offer the shopper accepted, not a rule: the cart has no bump UI).
  const serverPrices = priceOrderLines(
    candidates.map(({ item, basePrice }) => ({
      productId: item.product_id,
      basePrice,
      quantity: item.quantity,
      shownPrice: item.price,
      tiers: tiersByProduct.get(item.product_id),
    })),
    bumpOffers,
  );
  const verifiedItems: CheckoutItem[] = [];
  candidates.forEach(({ item }, idx) => {
    const unitPrice = serverPrices[idx];
    // Price moved since add-to-cart (or was tampered with) — surface it, don't
    // silently charge a different amount than the shopper saw; they
    // re-confirm at the server's price.
    if (Math.round(item.price) !== Math.round(unitPrice)) {
      issues.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        reason: "price_changed",
        new_price: unitPrice,
      });
      return;
    }
    verifiedItems.push({ ...item, price: unitPrice });
  });

  if (issues.length > 0) {
    const hasPriceChange = issues.some((x) => x.reason === "price_changed");
    return {
      success: false,
      error: hasPriceChange
        ? "تغيّرت أسعار بعض المنتجات — يرجى مراجعة سلتك وتأكيد الطلب."
        : "بعض المنتجات في سلتك لم تعد متوفرة — تمت إزالتها، راجع سلتك.",
      issues,
    };
  }

  // Subtotal of line items (server-verified prices — never the client's).
  const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  // What the shopper is PAYING for, frozen before the server adds anything of
  // its own. The engines that decide what was earned (bundles, delivery) read
  // this, never the final line list: a free gift naming a bundle's product
  // must not complete that bundle and pay out a discount nobody chose.
  const paidItems: readonly CheckoutItem[] = [...verifiedItems];

  // Free gift. Added HERE, by the server, from the verified subtotal — a
  // zero-price line accepted from the client would be a free item anyone
  // could post. The subtotal above excludes the gift by construction (it is
  // appended after), so a free line can never count toward the threshold
  // that earns it.
  const freeGift = resolveFreeGift(tenant.store_config_v2?.commerce?.free_gift);
  if (freeGift.productId && qualifiesForFreeGift(tenant.store_config_v2?.commerce?.free_gift, subtotal)) {
    const giftId = freeGift.productId;
    // Never gift something already being paid for: the shopper would lose a
    // line they chose, or be handed a duplicate.
    const alreadyInOrder = paidItems.some((i) => i.product_id === giftId);
    if (!alreadyInOrder) {
      const { data: gift, error: giftErr } = await supabase
        .from("products")
        .select("id, name, short_name, status, is_visible, is_archived, is_supply, stock_quantity, reserved_quantity")
        .eq("id", giftId)
        .eq("tenant_id", payload.tenantId)
        .maybeSingle();
      if (giftErr) {
        // Fail closed like every other catalogue read here: the storefront
        // promised this shopper a gift, so placing the order without it on a
        // transient error would break that promise silently.
        console.error("[checkout] free gift lookup failed:", giftErr);
        return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(giftErr) };
      }
      const giftOrderable =
        gift !== null &&
        gift.status === "active" &&
        !gift.is_archived &&
        gift.is_visible &&
        !gift.is_supply &&
        (gift.stock_quantity ?? 0) - (gift.reserved_quantity ?? 0) > 0;
      if (gift && giftOrderable) {
        verifiedItems.push({
          product_id: gift.id,
          variant_id: null,
          name: gift.short_name || gift.name,
          variant_name: null,
          price: 0,
          quantity: 1,
        });
      }
      // Withdrawn, Draft or out of stock: the order proceeds without it. The
      // shopper loses nothing they paid for.
    }
  }

  // EC2: record the SAME delivery fee the storefront displays + the courier
  // collects (shared source of truth), so the order's recorded total
  // (price + delivery_fee) matches what the customer agreed to pay. Recomputed
  // server-side from the verified subtotal — the client value is never trusted.
  const itemCount = paidItems.reduce((n, i) => n + i.quantity, 0);
  // Per-governorate shipping engine (falls back to the legacy flat fee when the
  // merchant hasn't configured rates). Same inputs the storefront displays.
  const deliveryFee = computeDeliveryFee(subtotal, itemCount, {
    shipping: tenant.store_config_v2?.commerce?.shipping,
    governorate: payload.customer.governorate_code as GovernorateCode,
  });
  // Discount engine: re-resolve the coupon against the PUBLISHED discounts
  // server-side (never trust a client-supplied amount); records discount_amount
  // and reduces the collected total. Free-shipping threshold stays on the
  // pre-discount subtotal.
  const discount = computeDiscount(
    subtotal,
    payload.couponCode,
    tenant.store_config_v2?.commerce?.discounts,
    new Date(),
  );
  const couponAmount = discount?.amount_iqd ?? 0;
  // Bundle engine: re-resolve "frequently bought together" bundles against the
  // PUBLISHED config (never trust the client). Bundle savings fold into the
  // order's total discount_amount alongside any coupon, so the recorded total
  // and the courier-collected amount both reflect them.
  const bundleSummary = computeBundleDiscounts(
    paidItems,
    tenant.store_config_v2?.commerce?.bundles,
  );
  // Referral: a friend's code on a FIRST order. Eligibility is one SQL rule
  // (referral_check) that the preview endpoint also runs: the code exists in
  // THIS tenant, it is not the buyer's own, and the buyer — by normalised
  // phone — has no earlier live order with this store. The amount comes from
  // the PUBLISHED config, never the client. It does not stack on a coupon.
  let referral: { code: string; referrer_phone: string } | null = null;
  let referralWanted = 0;
  const referralCode = normalizeReferralCode(payload.referralCode);
  if (referralCode && !discount) {
    const commerce = tenant.store_config_v2?.commerce;
    const amount = computeReferralDiscount(subtotal, commerce?.referral, commerce?.loyalty);
    if (amount > 0) {
      const { data: check, error: checkErr } = await supabase.rpc("referral_check", {
        _tenant_id: payload.tenantId,
        _code: referralCode,
        _phone: phone,
      });
      if (checkErr) {
        // Fail closed: the form previewed this discount, so placing the order
        // without it on a transient error would charge more than was shown.
        console.error("[checkout] referral check failed:", checkErr);
        return { success: false, error: "تعذّر التحقق من رمز الصديق. حاول مرة أخرى.", retryable: isTransientDbError(checkErr) };
      }
      const row = Array.isArray(check) ? check[0] : null;
      // The SQL already refuses a buyer's own code; the phone comparison here
      // is the same rule, kept so no SQL change can quietly reopen it.
      if (row?.ok && row.referrer_phone && row.referrer_phone !== phone) {
        referral = { code: referralCode, referrer_phone: row.referrer_phone };
        referralWanted = amount;
      }
    }
  }

  // Each engine caps itself at the subtotal; their SUM must be capped too, or a
  // coupon plus a bundle records a negative total. Applied in sequence, each
  // against what the previous left — and points are then priced against the
  // remainder, so no points are spent on a discount the order cannot take.
  const [couponApplied, bundleApplied, referralApplied] = stackDiscounts(subtotal, [
    couponAmount,
    bundleSummary.total_amount_iqd,
    referralWanted,
  ]).applied;
  const remainingForPoints = subtotal - couponApplied - bundleApplied - referralApplied;
  // Loyalty: redeem the points the customer chose to spend. Re-resolve against
  // the PUBLISHED config + the AUTHORITATIVE balance, then deduct atomically
  // (the RPC blocks an overdraw) BEFORE the order so the discount is baked into
  // discount_amount; refunded below if the order then fails.
  const loyaltyCfg = tenant.store_config_v2?.commerce?.loyalty;
  let pointsUsed = 0;
  let pointsDiscount = 0;
  if (payload.redeemPoints && payload.redeemPoints > 0 && loyaltyCfg?.enabled) {
    const { data: bal } = await supabase
      .from("customer_points")
      .select("balance")
      .eq("tenant_id", payload.tenantId)
      .eq("phone", phone)
      .maybeSingle();
    const redemption = computePointsRedemption({
      balance: bal?.balance ?? 0,
      requestedPoints: payload.redeemPoints,
      subtotalIqd: remainingForPoints,
      cfg: loyaltyCfg,
    });
    if (redemption.discount_iqd > 0) {
      const { error: redeemErr } = await supabase.rpc("adjust_customer_points", {
        _tenant_id: payload.tenantId,
        _phone: phone,
        _delta: -redemption.points_used,
        _reason: "redeem",
        _order_id: undefined,
      });
      if (!redeemErr) {
        pointsUsed = redemption.points_used;
        pointsDiscount = redemption.discount_iqd;
      }
    }
  }

  const discountAmount = stackDiscounts(subtotal, [
    couponApplied,
    bundleApplied,
    referralApplied,
    pointsDiscount,
  ]).total;
  const grandTotal = subtotal - discountAmount + deliveryFee;

  // COD risk signals: the same two-axis verdict the customers console
  // computes, plus what only checkout can see (a duplicate open order, three
  // orders in an hour, a two-word address). Stamped onto the order so ops see
  // it the moment the order lands. Best-effort — a failed lookup is "no
  // signal", never a blocked checkout.
  const { data: riskVerdict, error: riskErr } = await supabase.rpc("cod_risk_signals", {
    _tenant_id: payload.tenantId,
    _phone: phone,
    _address: payload.customer.address_details,
  });
  if (riskErr) console.error("[checkout] cod_risk_signals failed:", riskErr);
  const risk = riskErr ? null : stampCodRisk(riskVerdict);

  // Build the order payload in the shape create_order_atomic expects.
  // Convention (see waseet-api): `price` is the line-item subtotal and the
  // courier collects `price + delivery_fee`.
  const orderData = {
    customer_name: payload.customer.customer_name.trim(),
    phone,
    // create_order_atomic reads `_order_data->>'secondary_phone'`.
    secondary_phone: payload.customer.alt_phone ?? null,
    governorate_code: payload.customer.governorate_code,
    city: payload.customer.city.trim(),
    address_details: payload.customer.address_details.trim(),
    items: verifiedItems.map((i) => {
      // Snapshot the merchant's internal ops name (short_name) rather than the
      // client-supplied marketing title: orders.items[].name is what employees
      // read on the orders page, printing, labels and WhatsApp templates, and
      // it must never be client-controlled anyway. Falls back to the canonical
      // products.name, then to the cart's name for safety.
      const product = productMap.get(i.product_id) as
        | { name?: string | null; short_name?: string | null }
        | undefined;
      return {
        product_id: i.product_id,
        variant_id: i.variant_id,
        name: product?.short_name?.trim() || product?.name || i.name,
        variant_name: i.variant_name,
        price: i.price,
        quantity: i.quantity,
      };
    }),
    price: subtotal,
    delivery_fee: deliveryFee,
    discount_amount: discountAmount,
    status: "new",
    payment_status: "pending",
    source: "storefront",
    ...(risk
      ? {
          risk_metadata: risk.risk_metadata,
          needs_attention: risk.needs_attention,
          attention_reasons: risk.attention_reasons,
        }
      : {}),
    is_shop_order: true,
    notes: payload.customer.notes?.trim() || null,
    // EC17: create_order_atomic returns the existing order for a repeated key
    // instead of inserting a duplicate.
    idempotency_key: payload.idempotencyKey ?? null,
  };

  // create_order_atomic (unchanged, called inside) behind the soft duplicate
  // guard, both under create_order_atomic's own transaction lock — see
  // migration 20261021142000_create_storefront_order_duplicate_guard. Only
  // the products the buyer is PAYING for count: a server-added gift must not
  // make two different orders look alike.
  const { data, error } = await supabase.rpc("create_storefront_order", {
    _order_data: orderData,
    _tenant_id: payload.tenantId,
    _paid_product_ids: Array.from(new Set(paidItems.map((i) => i.product_id))),
    _duplicate_window_minutes: DUPLICATE_ORDER_WINDOW_MINUTES,
  });

  // Give back points deducted for a redemption this call did not end up using.
  const refundRedemption = async (): Promise<void> => {
    if (pointsUsed <= 0) return;
    const { error: refundErr } = await supabase.rpc("adjust_customer_points", {
      _tenant_id: payload.tenantId,
      _phone: phone,
      _delta: pointsUsed,
      _reason: "redeem_refund",
      _order_id: undefined,
    });
    if (refundErr) console.error("[checkout] points refund failed:", refundErr);
  };

  if (error) {
    console.error("[checkout] create_storefront_order failed:", error);
    // The RPC's transaction rolled back — or, for a transport failure, its
    // outcome is unknown; the client's same-key resend is then answered by
    // the replay lookup above.
    await refundRedemption();
    return { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى.", retryable: isTransientDbError(error) };
  }

  // create_order_atomic returns the created order row (or its id)
  const raw = Array.isArray(data) ? data[0] : data;
  const orderRow = raw as Record<string, unknown> | null;
  const orderId = (orderRow?.id ?? orderRow?.order_id ?? null) as string | null;

  // Soft duplicate guard (create_storefront_order): this phone placed an
  // order holding every product of this one minutes ago, and that order came
  // back instead of a new one. Its redemption was never used — refund it —
  // and none of a new order's side effects apply. The answer names no order
  // (see SubmitCheckoutResult.duplicate).
  if (orderRow && isDuplicateGuardRow(orderRow)) {
    await refundRedemption();
    return { success: true, replayed: true, duplicate: true };
  }

  // A concurrent submit with the same key placed the order first: this call
  // got that order back. Its redemption was never used — refund it — and
  // none of a new order's side effects below apply.
  if (orderRow && orderId && isReplayRow(orderRow)) {
    await refundRedemption();
    return replayResult({
      id: orderId,
      order_id: typeof orderRow.order_id === "string" ? orderRow.order_id : null,
      price: Number(orderRow.price),
      discount_amount: Number(orderRow.discount_amount),
      delivery_fee: Number(orderRow.delivery_fee),
    });
  }

  // Draft view: a request carrying a valid draft-view preview token for this
  // tenant is the merchant testing unpublished changes, not a shopper. Decided
  // from the httpOnly cookie (never the payload), so it covers every caller
  // and the checkout body is unchanged.
  const draftView = await isDraftViewRequest(tenant.id);

  // Flag the draft-view order as a test so it stays out of the public stats
  // (`tenant_public_stats` skips is_test) and shows the Test badge in the
  // order book. `create_order_atomic` does not read `is_test` from
  // `_order_data`, so the flag is set right after it, tenant-scoped, on the
  // same service-role client. A change to `is_test` alone is a no-op for every
  // orders UPDATE trigger (inventory, loyalty and referral key off status /
  // items; the notification trigger off status / name / phone / items; trust
  // only recomputes). The INSERT-time triggers (log_order_notification,
  // log_order_creation_history) have already fired by now — only a change to
  // the RPC itself could keep them quiet for a test order.
  if (draftView && orderRow?.id) {
    const { error: testFlagErr } = await supabase
      .from("orders")
      .update({ is_test: true })
      .eq("id", String(orderRow.id))
      .eq("tenant_id", tenant.id);
    if (testFlagErr) {
      console.error("[checkout] could not flag draft-view order as test:", testFlagErr);
    }
  }

  // Instant WhatsApp confirmation, the same cod_order_confirm a Lightfunnels
  // order gets. Queued only for an order THIS call created (both replay paths
  // returned above) and never for a draft-view test order. Only the id
  // travels: the platform endpoint re-reads the row, takes the tenant from it
  // and applies every other gate. The publish runs after the response
  // (next/server `after`), so it never delays or fails the order.
  const createdRowId = orderRow?.id;
  if (typeof createdRowId === "string" && !draftView) {
    queueOrderConfirmation({ id: createdRowId, tenantId: tenant.id });
  }

  // Referral attribution: the row trg_referral_order_changed pays the
  // referrer from when THIS order is delivered (and takes back if it leaves
  // that state). Written only for a new order — a replay returned above. The
  // order is already placed and priced; a failed write loses the referrer's
  // points, so it is logged, not hidden.
  if (referral && orderId) {
    const { error: referralErr } = await supabase.from("referrals").insert({
      tenant_id: payload.tenantId,
      order_id: orderId,
      code: referral.code,
      referrer_phone: referral.referrer_phone,
      referee_phone: phone,
      discount_iqd: referralApplied,
    });
    if (referralErr) console.error("[checkout] referral attribution failed:", referralErr);
  }

  // Loyalty earn is NOT credited here. A COD order placed is not an order
  // paid: points are credited by trg_loyalty_order_changed when the order
  // reaches delivered/completed, and taken back if it leaves that state
  // (live migrations 20260909225706 + 20260909225854). Redemption above
  // stays at placement because the discount is baked into the order total.

  // Abandoned-cart recovery: this phone just ordered — mark any pending cart
  // recovered so the WhatsApp reminder sweep skips it. Best-effort: a failure
  // here must never fail the order.
  await supabase
    .from("abandoned_carts")
    .update({ recovered_at: new Date().toISOString() })
    .eq("tenant_id", payload.tenantId)
    .eq("phone", phone)
    .is("recovered_at", null);

  // Server-side Purchase (Meta/TikTok CAPI), deduped with the browser pixel via
  // the shared event_id. Best-effort — never block or fail the order.
  // A draft-view order never reaches the merchant's ad accounts (the browser
  // pixels are not even mounted in draft view).
  const analytics = tenant.store_config_v2?.globals?.analytics_pixels?.base as
    | AnalyticsConfig
    | undefined;
  if (payload.purchaseEventId && analytics && !draftView) {
    try {
      await sendPurchaseCapi({
        analytics,
        eventId: payload.purchaseEventId,
        customer: { phone, name: payload.customer.customer_name },
        value: grandTotal,
        contents: verifiedItems.map((i) => ({
          id: i.product_id,
          quantity: i.quantity,
          item_price: i.price,
        })),
      });
    } catch {
      /* CAPI is best-effort */
    }
  }

  // Post-purchase offer: hand THIS browser — and only this one — the proof
  // that it placed the order. The upsell route re-derives everything else.
  const proofSecret = upsellProofSecret();
  const upsellToken =
    orderId && proofSecret
      ? signUpsellProof({ tenantId: payload.tenantId, orderId }, proofSecret)
      : undefined;

  return {
    success: true,
    orderId: orderId ?? undefined,
    orderNumber: (orderRow?.order_id as string) ?? undefined,
    total: grandTotal,
    ...(discount
      ? { discount: { code: discount.code, amount: couponApplied } }
      : referral
        ? { discount: { code: referral.code, amount: referralApplied } }
        : {}),
    ...(upsellToken ? { upsellToken } : {}),
  };
}
