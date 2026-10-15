"use server";

import {
  computeDeliveryFee,
  computeDiscount,
  computeBundleDiscounts,
  computePointsEarned,
  computePointsRedemption,
  normalizeIraqiMobile,
  resolveTierPrice,
  type PriceTier,
} from "@scheniders/shared";
import type {
  StoreConfigV2,
  GovernorateCode,
  AnalyticsConfig,
} from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { sendPurchaseCapi } from "@/lib/capi";

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
}

/**
 * Creates an order in the platform DB via the create_order_atomic RPC.
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

  if (tenantErr || !tenantRaw) {
    console.error("[checkout] tenant not found:", tenantErr);
    return { success: false, error: "المتجر غير متاح" };
  }

  const tenant = tenantRaw as unknown as {
    id: string;
    status: string;
    restrictions: {
      paused_until?: string | null;
      reason?: string | null;
      blocks?: { new_orders?: boolean };
    } | null;
    store_config_v2: StoreConfigV2 | null;
  };

  if (
    tenant.status !== "active" &&
    tenant.status !== "trial" &&
    tenant.status !== "limited"
  ) {
    return { success: false, error: "المتجر غير نشط حالياً" };
  }

  // Tenant pause guard — when admin paused the merchant with new_orders blocked,
  // refuse the checkout. An expired pause window is treated as inactive.
  if (tenant.status === "limited") {
    const restrictions = tenant.restrictions ?? null;
    const pausedUntil = restrictions?.paused_until
      ? Date.parse(restrictions.paused_until)
      : null;
    // Lift the pause ONLY for a valid timestamp that is in the past. A missing
    // OR unparseable (NaN) end date fails CLOSED — the store stays paused —
    // rather than letting a malformed `paused_until` silently accept orders.
    const stillPaused =
      pausedUntil === null ||
      Number.isNaN(pausedUntil) ||
      pausedUntil > Date.now();
    if (stillPaused && restrictions?.blocks?.new_orders) {
      return {
        success: false,
        error: restrictions.reason || "المتجر متوقف مؤقتاً عن استقبال الطلبات",
      };
    }
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
    return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى." };
  }
  const productMap = new Map(products.map((p) => [p.id as string, p]));

  const variantIds = payload.items
    .map((i) => i.variant_id)
    .filter((v): v is string => !!v);
  type VariantRow = { id: string; product_id: string; price: number | null; tenant_id: string };
  const variantMap = new Map<string, VariantRow>();
  if (variantIds.length > 0) {
    const { data: variants, error: variantsErr } = await supabase
      .from("product_variants")
      .select("id, product_id, price, tenant_id")
      .in("id", variantIds)
      .eq("tenant_id", payload.tenantId);
    if (variantsErr || !variants) {
      console.error("[checkout] variant lookup failed:", variantsErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى." };
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
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى." };
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

  // EC24: validate every line and COLLECT per-item issues (unavailable /
  // repriced / bad quantity) instead of dead-ending on the first one with a
  // generic message — so the client can remove or re-price the offending lines
  // and the shopper isn't stuck in a retry loop.
  const issues: CheckoutIssue[] = [];
  const verifiedItems: typeof payload.items = [];
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
      if (!variant || variant.product_id !== i.product_id) {
        issue("unavailable");
        continue;
      }
      unitPrice = Number(variant.price ?? product.website_price ?? product.price) || 0;
    } else {
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
    // Quantity break, after the base price is known and the quantity is
    // known good. A product with no tiers is unaffected.
    unitPrice = resolveTierPrice(tiersByProduct.get(i.product_id), i.quantity, unitPrice);
    // Price moved since add-to-cart — surface it (don't silently charge a
    // different amount than the shopper saw); they re-confirm at the new price.
    if (Math.round(i.price) !== Math.round(unitPrice)) {
      issue("price_changed", unitPrice);
      continue;
    }
    verifiedItems.push({ ...i, price: unitPrice });
  }

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
  // EC2: record the SAME delivery fee the storefront displays + the courier
  // collects (shared source of truth), so the order's recorded total
  // (price + delivery_fee) matches what the customer agreed to pay. Recomputed
  // server-side from the verified subtotal — the client value is never trusted.
  const itemCount = verifiedItems.reduce((n, i) => n + i.quantity, 0);
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
    verifiedItems,
    tenant.store_config_v2?.commerce?.bundles,
  );
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
      subtotalIqd: subtotal,
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

  const discountAmount =
    couponAmount + bundleSummary.total_amount_iqd + pointsDiscount;
  const grandTotal = subtotal - discountAmount + deliveryFee;

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
    is_shop_order: true,
    notes: payload.customer.notes?.trim() || null,
    // EC17: create_order_atomic returns the existing order for a repeated key
    // instead of inserting a duplicate.
    idempotency_key: payload.idempotencyKey ?? null,
  };

  const { data, error } = await supabase.rpc("create_order_atomic", {
    _order_data: orderData,
    _tenant_id: payload.tenantId,
  });

  if (error) {
    console.error("[checkout] create_order_atomic failed:", error);
    // Refund any points deducted for a redemption — the order didn't go through.
    if (pointsUsed > 0) {
      await supabase.rpc("adjust_customer_points", {
        _tenant_id: payload.tenantId,
        _phone: phone,
        _delta: pointsUsed,
        _reason: "redeem_refund",
        _order_id: undefined,
      });
    }
    return { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى." };
  }

  // create_order_atomic returns the created order row (or its id)
  const raw = Array.isArray(data) ? data[0] : data;
  const orderRow = raw as Record<string, unknown> | null;
  const orderId = (orderRow?.id ?? orderRow?.order_id ?? null) as string | null;

  // Loyalty: award points earned on this order. Best-effort — never fail it.
  if (loyaltyCfg?.enabled) {
    const earned = computePointsEarned(subtotal, loyaltyCfg);
    if (earned > 0) {
      await supabase.rpc("adjust_customer_points", {
        _tenant_id: payload.tenantId,
        _phone: phone,
        _delta: earned,
        _reason: "earn",
        _order_id: orderId ?? undefined,
      });
    }
  }

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
  const analytics = tenant.store_config_v2?.globals?.analytics_pixels?.base as
    | AnalyticsConfig
    | undefined;
  if (payload.purchaseEventId && analytics) {
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

  return {
    success: true,
    orderId: orderId ?? undefined,
    orderNumber: (orderRow?.order_id as string) ?? undefined,
    total: grandTotal,
    ...(discount
      ? { discount: { code: discount.code, amount: discount.amount_iqd } }
      : {}),
  };
}
