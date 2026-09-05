import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createSupabasePublicClient } from "./supabase/server";
import type { Tables } from "@scheniders/supabase";
import type { Product, Category, ProductVariant } from "./types";

type PublicClient = ReturnType<typeof createSupabasePublicClient>;

/**
 * EC29: serve a PUBLIC catalog read from Next's cross-request data cache
 * (60s TTL) instead of a DB round-trip per request — so a viral WhatsApp/Meta
 * spike can't melt the database. The read runs on the cookie-free anon client
 * (required: `unstable_cache` runs outside the request scope and rejects
 * `cookies()`), so RLS still confines it to public, published data. Tagged for
 * future on-demand revalidation (a platform→storefront publish webhook).
 */
const STOREFRONT_CACHE_SECONDS = 60;

function publicCache<R>(
  keyParts: string[],
  read: (supabase: PublicClient) => Promise<R>,
): Promise<R> {
  return unstable_cache(
    () => read(createSupabasePublicClient()),
    ["storefront-catalog", ...keyParts],
    { revalidate: STOREFRONT_CACHE_SECONDS, tags: ["storefront-catalog"] },
  )();
}

/**
 * Honest review stats: aggregate APPROVED reviews for a batch of products in
 * ONE extra indexed query (no N+1) and merge `review_count` + `avg_rating`
 * onto each product. Runs on the anon client — the `reviews_public_read` RLS
 * policy already confines it to approved reviews of live tenants — and always
 * inside `publicCache`, so the aggregate shares the catalog's 60s TTL.
 * PostgREST aggregate functions are not enabled on Supabase by default, so we
 * fetch the (product_id, rating) pairs (served by the partial index
 * `idx_product_reviews_product_approved`) and group in JS. On any error the
 * products pass through without stats — sections hide rating UI when absent.
 */
async function withReviewStats(
  supabase: PublicClient,
  products: Product[],
): Promise<Product[]> {
  if (products.length === 0) return products;

  const { data, error } = await supabase
    .from("product_reviews")
    .select("product_id, rating")
    .eq("status", "approved")
    .in(
      "product_id",
      products.map((p) => p.id),
    );

  if (error) {
    console.error("[queries.withReviewStats]", error);
    return products;
  }

  const sums = new Map<string, { count: number; total: number }>();
  for (const row of data ?? []) {
    const acc = sums.get(row.product_id) ?? { count: 0, total: 0 };
    acc.count += 1;
    acc.total += row.rating;
    sums.set(row.product_id, acc);
  }
  if (sums.size === 0) return products;

  return products.map((p) => {
    const acc = sums.get(p.id);
    if (!acc) return p;
    return {
      ...p,
      review_count: acc.count,
      avg_rating: acc.total / acc.count,
    };
  });
}

export const listProducts = cache(
  (
    tenantId: string,
    opts: { categoryId?: string; limit?: number; offset?: number } = {},
  ): Promise<Product[]> =>
    publicCache(["listProducts", tenantId, JSON.stringify(opts)], async (supabase) => {
      let q = supabase
        .from("products")
        .select(
          "id, tenant_id, name, slug, description, short_description, price, website_price, compare_at_price, image_url, gallery_urls, feature_cards, stock_quantity, reserved_quantity, sku, is_archived, is_visible, display_order, category_id, created_at",
        )
        .eq("tenant_id", tenantId)
        .eq("is_visible", true)
        .eq("is_archived", false)
        .not("is_supply", "is", true) // supplies (packaging, etc.) are never storefront products
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
      return withReviewStats(supabase, (data ?? []).map(normalizeProduct));
    }),
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Decode a route param that may still be percent-encoded. A no-op for plain
 *  ASCII (no "%"). try/catch is deliberate — a malformed sequence from a junk
 *  URL falls back to the raw value, which simply won't match (→ 404). */
function decodeSlugParam(value: string): string {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const getProductBySlug = cache(
  (tenantId: string, slugOrId: string): Promise<Product | null> =>
    publicCache(["getProductBySlug", tenantId, slugOrId], async (supabase) => {
      const columns =
        "id, tenant_id, name, slug, description, short_description, price, website_price, compare_at_price, image_url, gallery_urls, feature_cards, stock_quantity, reserved_quantity, sku, is_archived, is_visible, display_order, category_id, created_at";

      // The dynamic route param can arrive still percent-encoded, so a non-ASCII
      // slug (e.g. an Arabic slug like "ويفر") comes through as "%D9%88..." and
      // would never match the stored value. Decode before matching.
      const key = decodeSlugParam(slugOrId);

      // ProductCard links to /products/{slug ?? id}, so the route param can be
      // either a slug or a UUID. Try both paths so slug-less products still work.
      const baseQuery = () =>
        supabase
          .from("products")
          .select(columns)
          .eq("tenant_id", tenantId)
          .eq("is_visible", true)
          .eq("is_archived", false)
          .not("is_supply", "is", true); // exclude supplies (packaging, etc.)

      const withStats = async (row: Record<string, unknown>) =>
        (await withReviewStats(supabase, [normalizeProduct(row)]))[0] ?? null;

      const { data: bySlug } = await baseQuery().eq("slug", key).maybeSingle();
      if (bySlug) return withStats(bySlug);

      if (UUID_RE.test(key)) {
        const { data: byId } = await baseQuery().eq("id", key).maybeSingle();
        if (byId) return withStats(byId);
      }

      return null;
    }),
);

export const getProductImages = cache((productId: string): Promise<string[]> =>
  publicCache(["getProductImages", productId], async (supabase) => {
    const { data } = await supabase
      .from("product_images")
      .select("image_url, display_order")
      .eq("product_id", productId)
      .order("display_order", { ascending: true })
      .returns<Pick<Tables<"product_images">, "image_url" | "display_order">[]>();
    return (data ?? []).map((r) => r.image_url);
  }),
);

export const getProductVariants = cache(
  (productId: string): Promise<ProductVariant[]> =>
    publicCache(["getProductVariants", productId], async (supabase) => {
      const { data } = await supabase
        .from("product_variants")
        .select("id, product_id, tenant_id, name, price, stock_quantity, sku")
        .eq("product_id", productId);
      return (data ?? []) as ProductVariant[];
    }),
);

export const listCategories = cache((tenantId: string): Promise<Category[]> =>
  publicCache(["listCategories", tenantId], async (supabase) => {
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
  }),
);

export const getCategoryBySlug = cache(
  (tenantId: string, slug: string): Promise<Category | null> =>
    publicCache(["getCategoryBySlug", tenantId, slug], async (supabase) => {
      // The dynamic route param can arrive still percent-encoded, so a non-ASCII
      // Arabic slug (e.g. "العطور") comes through as "%D8%A7..." and would never
      // match the stored value — same fix as getProductBySlug.
      const key = decodeSlugParam(slug);
      const { data } = await supabase
        .from("categories")
        .select("id, tenant_id, name, slug, description, image_url, parent_id, display_order")
        .eq("tenant_id", tenantId)
        .eq("slug", key)
        .maybeSingle();
      return (data as unknown as Category) ?? null;
    }),
);

// Junction-first lookup: a product can live in multiple categories via
// product_categories. Legacy listProducts({categoryId}) still works by filtering
// products.category_id (the primary category), so this coexists with it.
export const listProductsInCategory = cache(
  (
    tenantId: string,
    categoryId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<Product[]> =>
    publicCache(
      ["listProductsInCategory", tenantId, categoryId, JSON.stringify(opts)],
      async (supabase) => {
        let q = supabase
          .from("product_categories")
          .select(
            "products!inner(id, tenant_id, name, slug, description, short_description, price, website_price, compare_at_price, image_url, gallery_urls, feature_cards, stock_quantity, reserved_quantity, sku, is_archived, is_visible, display_order, category_id, created_at)",
          )
          .eq("category_id", categoryId)
          .eq("tenant_id", tenantId)
          .eq("products.is_visible", true)
          .eq("products.is_archived", false)
          .not("products.is_supply", "is", true); // exclude supplies

        if (opts.limit) q = q.limit(opts.limit);
        if (opts.offset)
          q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);

        const { data, error } = await q;
        if (error) {
          console.error("[queries.listProductsInCategory]", error);
          return [];
        }

        type Row = { products: Record<string, unknown> | null };
        const rows = (data ?? []) as Row[];
        return withReviewStats(
          supabase,
          rows
            .map((r) => r.products)
            .filter((p): p is Record<string, unknown> => p !== null)
            .map(normalizeProduct),
        );
      },
    ),
);

/** `gallery_urls` is jsonb, so it arrives as unknown-shaped Json — coerce
 *  defensively to a clean array of non-empty strings (anything else, or a
 *  non-array value, becomes an empty gallery rather than a runtime surprise). */
function coerceGalleryUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}

/** `feature_cards` is jsonb — keep only well-shaped {title, body, image_url?}
 *  entries so a malformed row degrades to no cards, never a render crash. */
function coerceFeatureCards(
  value: unknown,
): { image_url?: string; title: string; body: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (typeof v !== "object" || v === null) return [];
    const o = v as Record<string, unknown>;
    if (typeof o.title !== "string" || typeof o.body !== "string") return [];
    return [
      {
        title: o.title,
        body: o.body,
        ...(typeof o.image_url === "string" && o.image_url.length > 0
          ? { image_url: o.image_url }
          : {}),
      },
    ];
  });
}

function normalizeProduct(row: Record<string, unknown>): Product {
  const r = row as unknown as Product & { website_price?: number | null };
  return {
    ...r,
    // Use website_price if set, else fall back to internal price
    price: r.website_price ?? r.price,
    gallery_urls: coerceGalleryUrls(row.gallery_urls),
    feature_cards: coerceFeatureCards(row.feature_cards),
  };
}
