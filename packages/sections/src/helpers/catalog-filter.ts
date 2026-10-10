// =====================================================================
// catalog-filter — the pure core behind the catalogue controls
// =====================================================================
// No React. Every chip count is `applyCatalog(...).length` from this same
// function, so a chip can never advertise a number the chip does not then
// produce. That divergence — a count computed one way and the list built
// another — is the failure this project has already fixed twice.
// =====================================================================

import type { Product } from "../types";
import { filterByQuery } from "./product-search";

export const SORTS = ["bestsellers", "price_asc", "price_desc", "newest"] as const;
export type CatalogSort = (typeof SORTS)[number];

export interface CatalogOpts {
  sort?: CatalogSort;
  categoryId?: string | null;
  /** Real membership: products belong to up to six categories. */
  categoryProductIds?: Record<string, string[]>;
  price?: "under" | "over" | null;
  threshold?: number | null;
  /** Free-text search. Shares the matcher with the /search page. */
  query?: string;
}

/** Buyable now — drives the unbuyable-last rule, not visibility. */
function inStock(p: Product): boolean {
  return (p.stock_quantity ?? 0) - (p.reserved_quantity ?? 0) > 0;
}

/**
 * A price threshold the catalogue actually divides on: the median, rounded
 * down to the nearest 5,000 so it reads as a round number to a shopper.
 *
 * Null when a split would be meaningless — fewer than two products, or a
 * threshold that leaves one side empty. A control that cannot divide
 * anything should not be offered at all.
 */
export function priceSplitFrom(prices: number[]): number | null {
  const usable = prices.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (usable.length < 2) return null;

  // Nearest 5,000, not floor: a 38,500 median reads as "under ٤٠ ألف", which
  // is a rounder anchor for a shopper than "under ٣٥ ألف" and sits closer to
  // the middle of the catalogue.
  const median = usable[Math.floor(usable.length / 2)];
  const threshold = Math.round(median / 5000) * 5000;
  if (threshold <= 0) return null;

  const under = usable.filter((n) => n < threshold).length;
  if (under === 0 || under === usable.length) return null;
  return threshold;
}

/**
 * Filter then sort. Never mutates the input.
 *
 * Products that cannot be bought always sort last, under every order. The
 * catalogue still lists them — this is the full catalogue, not a
 * merchandising grid — but they never take the first screen.
 */
export function applyCatalog(products: Product[], opts: CatalogOpts): Product[] {
  let out = products.slice();

  if (opts.categoryId) {
    const members = new Set(opts.categoryProductIds?.[opts.categoryId] ?? []);
    out = out.filter((p) => members.has(p.id));
  }

  // Search before the price split, so the "under / over" counts describe the
  // searched set rather than the whole catalogue.
  if (opts.query) out = filterByQuery(out, opts.query);

  if (opts.price && opts.threshold != null) {
    out = out.filter((p) =>
      opts.price === "under" ? p.price < opts.threshold! : p.price >= opts.threshold!,
    );
  }

  const rank = (p: Product) =>
    typeof p.bestseller_rank === "number" && p.bestseller_rank > 0
      ? p.bestseller_rank
      : Number.POSITIVE_INFINITY;
  const createdAt = (p: Product) =>
    (p as Product & { created_at?: string }).created_at ?? "";

  const by: Record<CatalogSort, (a: Product, b: Product) => number> = {
    bestsellers: (a, b) => rank(a) - rank(b) || (a.display_order ?? 0) - (b.display_order ?? 0),
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    newest: (a, b) => createdAt(b).localeCompare(createdAt(a)),
  };
  const compare = by[opts.sort ?? "bestsellers"];

  return out.sort((a, b) => {
    // Unbuyable last, whatever the chosen order.
    const stockGap = Number(inStock(b)) - Number(inStock(a));
    return stockGap !== 0 ? stockGap : compare(a, b);
  });
}
