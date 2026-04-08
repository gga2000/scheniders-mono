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

  // Verify tenant is active before creating
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, status")
    .eq("id", payload.tenantId)
    .maybeSingle();

  if (tenantErr || !tenant) {
    console.error("[checkout] tenant not found:", tenantErr);
    return { success: false, error: "المتجر غير متاح" };
  }
  if (tenant.status !== "active" && tenant.status !== "trial") {
    return { success: false, error: "المتجر غير نشط حالياً" };
  }

  const totalPrice = payload.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Build the order payload in the shape create_order_atomic expects
  const orderData = {
    customer_name: payload.customer.customer_name.trim(),
    phone,
    governorate_code: payload.customer.governorate_code,
    city: payload.customer.city.trim(),
    address_details: payload.customer.address_details.trim(),
    items: payload.items.map((i) => ({
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
  };
}
