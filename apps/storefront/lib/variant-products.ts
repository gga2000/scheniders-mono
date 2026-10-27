// =====================================================================
// Which products are sold by variant?
// =====================================================================
// A product with enabled variants is bought as one of them — a size, a
// colour — priced from the variant row. A line naming the product with no
// variant has neither a size for the courier nor a price the merchant set
// for it, so every server path that accepts or creates order lines treats
// such a line as unavailable. One read, one rule, shared by the checkout and
// the post-purchase upsell.
//
// `is_enabled` is nullable; only an explicit `false` takes a variant off
// sale, matching how the storefront lists variants.
// =====================================================================

import type { createSupabaseServiceClient } from "@/lib/supabase/server";

type Svc = ReturnType<typeof createSupabaseServiceClient>;

export class VariantReadError extends Error {
  /** The failed read's SQLSTATE / PostgREST code — what tells a transient
   *  failure (resend the same request) from a refused one. */
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.code = code;
  }
}

/** Product ids (of `productIds`) that have at least one enabled variant. */
export async function productsSoldByVariant(
  svc: Svc,
  tenantId: string,
  productIds: readonly string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const { data, error } = await svc
    .from("product_variants")
    .select("product_id, is_enabled")
    .in("product_id", [...productIds])
    .eq("tenant_id", tenantId);
  if (error) throw new VariantReadError(`variant read failed: ${error.message}`, error.code ?? null);
  return new Set((data ?? []).filter((v) => v.is_enabled !== false).map((v) => v.product_id));
}
