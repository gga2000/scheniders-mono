import { cache } from "react";
import { createSupabaseServerClient } from "./supabase/server";
import type { Tables } from "@scheniders/supabase";
import type { Product, Category, ProductVariant } from "./types";

export const listProducts = cache(
  async (
    tenantId: string,
    opts: { categoryId?: string; limit?: number; offset?: number } = {},
  ): Promise<Product[]> => {
    const supabase = await createSupabaseServerClient();
    let q = supabase
      .from("products")
      .select(
        "id, tenant_id, name, slug, description, short_description, price, website_price, compare_at_price, image_url, stock_quantity, reserved_quantity, sku, is_archived, is_visible, display_order, category_id",
      )
      .eq("tenant_id", tenantId)
      .eq("is_visible", true)
      .eq("is_archived", false)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
    if (opts.limit) q = q.limit(opts.limit);
    if (opts.offset)
      q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);

    const { data, error } = await q;
    if (error) {
      console.error("[queries.listProducts]", error);
      return [];
    }
    return (data ?? []).map(normalizeProduct);
  },
);

export const getProductBySlug = cache(
  async (tenantId: string, slug: string): Promise<Product | null> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, tenant_id, name, slug, description, short_description, price, website_price, compare_at_price, image_url, stock_quantity, reserved_quantity, sku, is_archived, is_visible, display_order, category_id",
      )
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .eq("is_visible", true)
      .eq("is_archived", false)
      .maybeSingle();

    if (error || !data) return null;
    return normalizeProduct(data);
  },
);

export const getProductImages = cache(async (productId: string): Promise<string[]> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("product_images")
    .select("image_url, display_order")
    .eq("product_id", productId)
    .order("display_order", { ascending: true })
    .returns<Pick<Tables<"product_images">, "image_url" | "display_order">[]>();
  return (data ?? []).map((r) => r.image_url);
});

export const getProductVariants = cache(
  async (productId: string): Promise<ProductVariant[]> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("product_variants")
      .select("id, product_id, tenant_id, name, price, stock_quantity, sku")
      .eq("product_id", productId);
    return (data ?? []) as ProductVariant[];
  },
);

export const listCategories = cache(async (tenantId: string): Promise<Category[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, tenant_id, name, slug, description, image_url, parent_id, display_order")
    .eq("tenant_id", tenantId)
    .eq("is_visible", true)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[queries.listCategories]", error);
    return [];
  }
  return (data ?? []) as Category[];
});

export const getCategoryBySlug = cache(
  async (tenantId: string, slug: string): Promise<Category | null> => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("categories")
      .select("id, tenant_id, name, slug, description, image_url, parent_id, display_order")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .maybeSingle();
    return (data as unknown as Category) ?? null;
  },
);

function normalizeProduct(row: Record<string, unknown>): Product {
  const r = row as unknown as Product & { website_price?: number | null };
  return {
    ...r,
    // Use website_price if set, else fall back to internal price
    price: r.website_price ?? r.price,
  };
}
