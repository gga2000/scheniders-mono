"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/server";

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
  customer: {
    customer_name: string;
    phone: string;
    governorate_code: string;
    city: string;
    address_details: string;
    notes?: string;
  };
  items: CheckoutItem[];
}

interface SubmitCheckoutResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  error?: string;
  total?: number;
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

  // Basic phone validation
  const phone = payload.customer.phone.trim().replace(/\s+/g, "");
  if (phone.length < 10) {
    return { success: false, error: "رقم الهاتف غير صالح" };
  }

  const supabase = createSupabaseServiceClient();

  // Verify tenant status before creating. We pull `restrictions` too, but
  // cast loosely because the shared DB types haven't been regenerated since
  // the column / 'limited' enum value were added.
  const { data: tenantRaw, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, status, restrictions")
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
    const stillPaused =
      pausedUntil === null || (pausedUntil !== null && pausedUntil > Date.now());
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
    .select("id, tenant_id, price, website_price, is_visible, is_archived, is_supply")
    .in("id", productIds)
    .eq("tenant_id", payload.tenantId);

  if (productsErr || !products || products.length !== productIds.length) {
    console.error("[checkout] product lookup failed:", productsErr);
    return { success: false, error: "بعض المنتجات غير متوفرة" };
  }
  const productMap = new Map(products.map((p) => [p.id as string, p]));
  for (const p of products) {
    // Reject hidden, archived, or supply (packaging/internal) items — never orderable on the storefront.
    if (p.is_archived || !p.is_visible || (p as { is_supply?: boolean }).is_supply) {
      return { success: false, error: "بعض المنتجات غير متوفرة" };
    }
  }

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
    if (variantsErr || !variants || variants.length !== variantIds.length) {
      console.error("[checkout] variant lookup failed:", variantsErr);
      return { success: false, error: "بعض المنتجات غير متوفرة" };
    }
    for (const v of variants as VariantRow[]) variantMap.set(v.id, v);
  }

  // Rebuild every item with the server-verified price; reject if a variant
  // doesn't belong to its stated product.
  const verifiedItems: typeof payload.items = [];
  for (const i of payload.items) {
    const product = productMap.get(i.product_id);
    if (!product) {
      return { success: false, error: "بعض المنتجات غير متوفرة" };
    }
    let unitPrice: number;
    if (i.variant_id) {
      const variant = variantMap.get(i.variant_id);
      if (!variant || variant.product_id !== i.product_id) {
        return { success: false, error: "بعض المنتجات غير متوفرة" };
      }
      unitPrice = Number(variant.price ?? product.website_price ?? product.price) || 0;
    } else {
      unitPrice = Number(product.website_price ?? product.price) || 0;
    }
    if (unitPrice <= 0 || !Number.isFinite(unitPrice)) {
      return { success: false, error: "بعض المنتجات غير متوفرة" };
    }
    if (!Number.isInteger(i.quantity) || i.quantity <= 0 || i.quantity > 100) {
      return { success: false, error: "كمية غير صالحة" };
    }
    verifiedItems.push({ ...i, price: unitPrice });
  }

  const totalPrice = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Build the order payload in the shape create_order_atomic expects
  const orderData = {
    customer_name: payload.customer.customer_name.trim(),
    phone,
    governorate_code: payload.customer.governorate_code,
    city: payload.customer.city.trim(),
    address_details: payload.customer.address_details.trim(),
    items: verifiedItems.map((i) => ({
      product_id: i.product_id,
      variant_id: i.variant_id,
      name: i.name,
      variant_name: i.variant_name,
      price: i.price,
      quantity: i.quantity,
    })),
    price: totalPrice,
    status: "new",
    payment_status: "pending",
    source: "storefront",
    is_shop_order: true,
    notes: payload.customer.notes?.trim() || null,
  };

  const { data, error } = await supabase.rpc("create_order_atomic", {
    _order_data: orderData,
    _tenant_id: payload.tenantId,
  });

  if (error) {
    console.error("[checkout] create_order_atomic failed:", error);
    return { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى." };
  }

  // create_order_atomic returns the created order row (or its id)
  const raw = Array.isArray(data) ? data[0] : data;
  const orderRow = raw as Record<string, unknown> | null;
  const orderId = (orderRow?.id ?? orderRow?.order_id ?? null) as string | null;

  return {
    success: true,
    orderId: orderId ?? undefined,
    orderNumber: (orderRow?.order_id as string) ?? undefined,
    total: totalPrice,
  };
}
