import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createSupabasePublicClient } from "./supabase/server";
import type { Tables } from "@scheniders/supabase";
import type { ProductReview, ProductAttributeDef } from "@scheniders/shared";
import { parseProductAttributeDefs, resolveProductAttributes } from "@scheniders/shared";
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

/**
 * The tenant's attribute taxonomy. Small (a handful of rows per tenant) and
 * read on any page that renders or filters attributes, so it gets its own
 * cache entry rather than riding along with a product query.
 *
 * Malformed rows are dropped by `parseProductAttributeDefs` — the database
 * CHECK already ties each kind to its required shape, so this is the second
 * line of defence, not the first.
 */
export const listAttributeDefs = cache(
  (tenantId: string): Promise<ProductAttributeDef[]> =>
    publicCache(["listAttributeDefs", tenantId], async (supabase) => {
      const { data, error } = await supabase
        .from("product_attribute_defs")
        .select(
          "id, key, name_i18n, kind, options, group_keys, range_min, range_max, unit_i18n, is_filterable, is_comparable, display_order",
        )
        .eq("tenant_id", tenantId)
        .order("display_order", { ascending: true });

      if (error) {
        console.error("[queries.listAttributeDefs]", error);
        return [];
      }
      return parseProductAttributeDefs(data ?? []);
    }),
);

/**
 * Attach merchant-defined attributes to a batch of products in ONE extra
 * indexed query, mirroring `withReviewStats`. Products with no values pass
 * through untouched, so `attributes` stays absent rather than empty — a
 * section can then tell "this tenant has no taxonomy" from "this product
 * has no values", and render nothing in both cases.
 *
 * On any error the products pass through without attributes: an attribute
 * block is enrichment, and must never cost the page its product.
 */
/** ~100 uuids keeps the PostgREST URL near 4KB, well under proxy limits. */
const ATTRIBUTE_ID_CHUNK = 100;

async function withAttributes(
  supabase: PublicClient,
  tenantId: string,
  products: Product[],
): Promise<Product[]> {
  if (products.length === 0) return products;

  const defs = await listAttributeDefs(tenantId);
  if (defs.length === 0) return products;

  // The catalogue and search pages pass the whole catalogue. One `.in()` with
  // hundreds of uuids overflows the request URL, so query in chunks.
  const ids = products.map((p) => p.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ATTRIBUTE_ID_CHUNK) {
    chunks.push(ids.slice(i, i + ATTRIBUTE_ID_CHUNK));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("product_attribute_values")
        .select("product_id, attribute_def_id, value")
        .eq("tenant_id", tenantId)
        .in("product_id", chunk),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("[queries.withAttributes]", failed.error);
    return products;
  }
  const data = results.flatMap((r) => r.data ?? []);
  if (data.length === 0) return products;

  const byProduct = new Map<string, typeof data>();
  for (const row of data) {
    const list = byProduct.get(row.product_id);
    if (list) list.push(row);
    else byProduct.set(row.product_id, [row]);
  }

  return products.map((p) => {
    const rows = byProduct.get(p.id);
    if (!rows) return p;
    const attributes = resolveProductAttributes(defs, rows);
    return attributes.length > 0 ? { ...p, attributes } : p;
  });
}

/** The product columns every storefront product read selects. One list so a
 *  new public column cannot reach the PDP through one query and be missing
 *  from another. Each name must be in anon's column grant on products (see
 *  20260817125055_anon_products_column_lockdown.sql and later grants) —
 *  an ungranted column fails the whole anon select. */
export const PRODUCT_COLUMNS =
  "id, tenant_id, name, slug, description, short_description, price, website_price, compare_at_price, image_url, gallery_urls, feature_cards, stock_quantity, reserved_quantity, sku, is_archived, is_visible, display_order, category_id, created_at, bestseller_rank, brand, size_ml, display_name";


export const listProducts = cache(
  (
    tenantId: string,
    opts: {
      categoryId?: string;
      limit?: number;
      offset?: number;
      /**
       * Attach merchant-defined attributes. Opt-in because only the pages
       * that offer facet filtering need them — the home grid would pay for
       * an extra query and a bigger payload to render nothing.
       */
      withAttributes?: boolean;
    } = {},
  ): Promise<Product[]> =>
    publicCache(["listProducts", tenantId, JSON.stringify(opts)], async (supabase) => {
      let q = supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("is_visible", true)
        .eq("status", "active")
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
      const products = await withReviewStats(
        supabase,
        (data ?? []).map(normalizeProduct),
      );
      return opts.withAttributes
        ? withAttributes(supabase, tenantId, products)
        : products;
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
      const columns = PRODUCT_COLUMNS;

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
          .eq("status", "active")
          .eq("is_archived", false)
          .not("is_supply", "is", true); // exclude supplies (packaging, etc.)

      // The PDP is the one page that renders attributes today, so it is the
      // only place that pays for the extra query. Grids stay lean until
      // facet filtering needs them.
      const withStats = async (row: Record<string, unknown>) => {
        const withReviews = await withReviewStats(supabase, [normalizeProduct(row)]);
        return (await withAttributes(supabase, tenantId, withReviews))[0] ?? null;
      };

      const { data: bySlug } = await baseQuery().eq("slug", key).maybeSingle();
      if (bySlug) return withStats(bySlug);

      if (UUID_RE.test(key)) {
        const { data: byId } = await baseQuery().eq("id", key).maybeSingle();
        if (byId) return withStats(byId);
      }

      return null;
    }),
);

/** Newest-first cap for the SSR review list — the section paints these in
 *  the first HTML; anything beyond is pagination territory, not first paint. */
const SSR_REVIEW_LIMIT = 20;

/**
 * P1-13: the approved reviews of ONE product, resolved server-side so the
 * product page can hand them to the reviews section (no client fetch, no
 * layout jump). Same columns, filters and ordering as `/api/reviews` GET —
 * tenant-scoped, approved only, newest first — on the anon client under the
 * `reviews_public_read` RLS policy, inside the shared 60s catalog cache.
 */
export const listApprovedReviews = cache(
  (tenantId: string, productId: string): Promise<ProductReview[]> =>
    publicCache(["listApprovedReviews", tenantId, productId], async (supabase) => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("id,product_id,rating,title,body,author_name,photo_urls,created_at")
        .eq("tenant_id", tenantId)
        .eq("product_id", productId)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(SSR_REVIEW_LIMIT);
      if (error) {
        console.error("[queries.listApprovedReviews]", error);
        return [];
      }
      return data ?? [];
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
      // A disabled variant is not for sale; `is_enabled` is nullable and null
      // means enabled (the column arrived after the rows).
      const { data } = await supabase
        .from("product_variants")
        .select(
          "id, product_id, tenant_id, name, price, stock_quantity, reserved_quantity, sku, compare_at_price, image_url, display_order",
        )
        .eq("product_id", productId)
        .or("is_enabled.is.null,is_enabled.eq.true")
        .order("display_order", { ascending: true, nullsFirst: false });
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

/**
 * Live product ids per category id.
 *
 * This is the single source for BOTH a category's count (the array length)
 * and for filtering the catalogue by category. Deriving them separately is
 * how a chip ends up advertising 19 and opening onto 14.
 *
 * Membership must come from the join table: a product belongs to up to six
 * categories, so `products.category_id` — only the primary — filters wrongly.
 *
 * Uses the SAME visibility filter as `listProductsInCategory`, including the
 * `status = active` guard that keeps a merchant's Draft products out of every
 * count and every filter.
 */
export const listCategoryProductIds = cache(
  (tenantId: string): Promise<Record<string, string[]>> =>
    publicCache(["listCategoryProductIds", tenantId], async (supabase) => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("category_id, product_id, products!inner(id, is_visible, is_archived, is_supply)")
        .eq("tenant_id", tenantId)
        .eq("products.status", "active")
        .eq("products.is_visible", true)
        .eq("products.is_archived", false)
        .not("products.is_supply", "is", true);

      if (error) {
        console.error("[queries.listCategoryProductIds]", error);
        return {};
      }

      const byCategory: Record<string, string[]> = {};
      for (const row of (data ?? []) as {
        category_id: string;
        product_id: string;
      }[]) {
        (byCategory[row.category_id] ??= []).push(row.product_id);
      }
      return byCategory;
    }),
);

/**
 * Best discount in the WHOLE catalogue, as a whole percent.
 *
 * The hero's "up to N% off" is a claim about everything the shop sells,
 * so it must not be derived from whatever slice of products a grid on
 * the page happened to load. At 43 visible products against a 24-product
 * fetch, a deeper discount outside that slice would be silently
 * understated. Mirrors `discountPercent` in the sections package: a
 * non-positive price, or a compare-at at or below it, is not a discount.
 *
 * Returns null when nothing is on sale, so the caller drops the claim
 * rather than rendering a zero.
 */
export const getMaxDiscountPercent = cache(
  (tenantId: string): Promise<number | null> =>
    publicCache(["getMaxDiscountPercent", tenantId], async (supabase) => {
      const { data, error } = await supabase
        .from("products")
        .select("price, website_price, compare_at_price")
        .eq("tenant_id", tenantId)
        // A draft product is not for sale, so its discount is not a real
        // offer — advertising "up to N% off" from one would promise a
        // saving on something a shopper cannot buy.
        .eq("status", "active")
        .eq("is_visible", true)
        .eq("is_archived", false)
        .not("is_supply", "is", true)
        .not("compare_at_price", "is", null);

      if (error) {
        console.error("[queries.getMaxDiscountPercent]", error);
        return null;
      }

      let best: number | null = null;
      for (const row of (data ?? []) as {
        price: number | null;
        website_price: number | null;
        compare_at_price: number | null;
      }[]) {
        const price = row.website_price ?? row.price ?? 0;
        const compareAt = row.compare_at_price ?? 0;
        if (!(price > 0) || !(compareAt > price)) continue;
        const pct = Math.round(((compareAt - price) / compareAt) * 100);
        if (best === null || pct > best) best = pct;
      }
      return best;
    }),
);

export interface TenantPublicStats {
  completed_orders: number;
  customers: number;
  governorates_served: number;
}

/**
 * Pre-aggregated public counts. Never reads `orders` — that table is
 * tenant-private and this runs for anon. Returns null when a tenant has
 * no stats row yet, and every consumer must drop its slot rather than
 * render a zero.
 */
export const getTenantPublicStats = cache(
  (tenantId: string): Promise<TenantPublicStats | null> =>
    publicCache(["getTenantPublicStats", tenantId], async (supabase) => {
      const { data, error } = await supabase
        .from("tenant_public_stats")
        .select("completed_orders, customers, governorates_served")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (error) {
        console.error("[queries.getTenantPublicStats]", error);
        return null;
      }
      return (data as TenantPublicStats) ?? null;
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
    opts: { limit?: number; offset?: number; withAttributes?: boolean } = {},
  ): Promise<Product[]> =>
    publicCache(
      ["listProductsInCategory", tenantId, categoryId, JSON.stringify(opts)],
      async (supabase) => {
        let q = supabase
          .from("product_categories")
          .select(
            `products!inner(${PRODUCT_COLUMNS})`,
          )
          .eq("category_id", categoryId)
          .eq("tenant_id", tenantId)
          .eq("products.is_visible", true)
          .eq("products.status", "active")
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
        const products = await withReviewStats(
          supabase,
          rows
            .map((r) => r.products)
            .filter((p): p is Record<string, unknown> => p !== null)
            .map(normalizeProduct),
        );
        return opts.withAttributes
          ? withAttributes(supabase, tenantId, products)
          : products;
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
