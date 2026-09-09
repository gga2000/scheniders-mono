"use client";

// =====================================================================
// FilterableProductGrid (client)
// =====================================================================
// Category-page product grid with quick-filter chips (On Sale / price),
// Clear All, and Load More. Filtering + pagination are purely client-side
// over the category's already-loaded products — no extra fetch. Used by
// product_grid only on category pages; the home grid stays server-rendered.
// =====================================================================

import { useMemo, useState } from "react";
import { resolveI18n, type LocaleCode, type ResolvedProductAttribute } from "@scheniders/shared";
import type { Product } from "../types";
import { SchneidersProductCard } from "./product-card";
// PricePillCard lives in product_grid, which imports this module — the cycle
// is safe because the binding is only read at render time, and
// search_results_grid.client.tsx already imports it the same way.
import { PricePillCard } from "../product_grid";
import { BentoCard, ChunkyButton, MaterialIcon } from "./primitives";

const PAGE_SIZE = 8;
/** "Under 50K IQD" quick filter — matches the Candy Bento category design. */
const PRICE_THRESHOLD = 50_000;

function isOnSale(p: Product): boolean {
  return p.compare_at_price != null && p.compare_at_price > p.price;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Attribute facets                                                     */
/* ─────────────────────────────────────────────────────────────────── */

/** One selectable value: `<attribute key>:<value>`. */
type FacetId = string;

export interface Facet {
  /** Attribute key — groups options under one heading. */
  key: string;
  name: string;
  options: { id: FacetId; label: string; count: number }[];
}

function facetIdOf(attr: ResolvedProductAttribute): FacetId | null {
  if (attr.kind === "enum") return `${attr.def.key}:${attr.value}`;
  if (attr.kind === "boolean" && attr.value) return `${attr.def.key}:true`;
  return null;
}

/**
 * Facets built from what this page's products actually carry — never from
 * the whole taxonomy. A filter that returns nothing is worse than no
 * filter, so an option only appears if at least one product has it.
 *
 * Only `enum` and `boolean` are offered. A range needs a threshold to
 * filter on, and any threshold this code invented ("4 and above") would be
 * a number no merchant chose — exactly the hardcoding this program exists
 * to remove. Range facets wait until the merchant can express the buckets.
 */
export function buildFacets(products: Product[], locale: LocaleCode): Facet[] {
  const byKey = new Map<string, { name: string; order: number; options: Map<string, { label: string; count: number }> }>();

  for (const p of products) {
    for (const attr of p.attributes ?? []) {
      if (!attr.def.is_filterable) continue;
      const id = facetIdOf(attr);
      if (!id) continue;

      let group = byKey.get(attr.def.key);
      if (!group) {
        group = {
          name: resolveI18n(attr.def.name_i18n, locale) || attr.def.key,
          order: attr.def.display_order,
          options: new Map(),
        };
        byKey.set(attr.def.key, group);
      }

      const label =
        attr.kind === "enum"
          ? resolveI18n(attr.option.label_i18n, locale) || attr.value
          : group.name;
      const existing = group.options.get(id);
      if (existing) existing.count += 1;
      else group.options.set(id, { label, count: 1 });
    }
  }

  return [...byKey.entries()]
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
    .map(([key, g]) => ({
      key,
      name: g.name,
      options: [...g.options.entries()]
        .map(([id, o]) => ({ id, label: o.label, count: o.count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    // Keep a facet only if selecting something in it would actually change
    // the list. That is NOT "more than one option": a boolean carried by
    // some products but not all is a single option that narrows perfectly
    // well, while an enum every product shares narrows nothing.
    .filter((f) => f.options.some((o) => o.count < products.length));
}

export function matchesFacets(p: Product, selected: Set<FacetId>, facets: Facet[]): boolean {
  if (selected.size === 0) return true;
  const own = new Set(
    (p.attributes ?? []).map(facetIdOf).filter((id): id is FacetId => id !== null),
  );
  // Within one attribute the options are alternatives (OR); across different
  // attributes they narrow (AND). Picking "oriental" and "woody" should widen
  // the list, not empty it.
  for (const facet of facets) {
    const picked = facet.options.map((o) => o.id).filter((id) => selected.has(id));
    if (picked.length === 0) continue;
    if (!picked.some((id) => own.has(id))) return false;
  }
  return true;
}

function FilterChip({
  active,
  onClick,
  activeBg,
  children,
}: {
  active: boolean;
  onClick: () => void;
  activeBg: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1 px-3.5 h-9 font-label font-bold text-xs uppercase tracking-wide transition-transform active:scale-95"
      style={{
        backgroundColor: active ? activeBg : "var(--bk-surface, #ffffff)",
        color: "var(--bk-ink, #1a1a1a)",
        border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
        borderRadius: "var(--bk-radius-pill, 9999px)",
        boxShadow: active
          ? "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)"
          : "none",
      }}
    >
      {active && <MaterialIcon name="check" className="text-sm" />}
      {children}
    </button>
  );
}

export function FilterableProductGrid({
  products,
  locale,
  whatsappPhone,
  cardStyle = "standard",
  showStars = false,
}: {
  products: Product[];
  locale: LocaleCode;
  whatsappPhone: string | null;
  /** Match the card the surrounding grid would have drawn. */
  cardStyle?: "standard" | "price_pill";
  showStars?: boolean;
}) {
  const t = locale !== "en";
  const [onSale, setOnSale] = useState(false);
  const [underPrice, setUnderPrice] = useState(false);
  const [selected, setSelected] = useState<Set<FacetId>>(() => new Set());
  const [visible, setVisible] = useState(PAGE_SIZE);

  const facets = useMemo(() => buildFacets(products, locale), [products, locale]);

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (onSale && !isOnSale(p)) return false;
        if (underPrice && p.price >= PRICE_THRESHOLD) return false;
        if (!matchesFacets(p, selected, facets)) return false;
        return true;
      }),
    [products, onSale, underPrice, selected, facets],
  );

  const anyFilter = onSale || underPrice || selected.size > 0;
  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  // Toggling a filter resets pagination so the visitor sees the new top of list.
  const toggleSale = () => {
    setOnSale((v) => !v);
    setVisible(PAGE_SIZE);
  };
  const togglePrice = () => {
    setUnderPrice((v) => !v);
    setVisible(PAGE_SIZE);
  };
  const toggleFacet = (id: FacetId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setVisible(PAGE_SIZE);
  };
  const clearAll = () => {
    setOnSale(false);
    setUnderPrice(false);
    setSelected(new Set());
    setVisible(PAGE_SIZE);
  };

  const hasSaleItems = useMemo(() => products.some(isOnSale), [products]);

  return (
    <div>
      {/* One row per filterable attribute, in the merchant's own order. */}
      {facets.map((facet) => (
        <div key={facet.key} className="mb-bk-sm">
          <p
            id={`facet-${facet.key}`}
            className="mb-bk-2xs font-label font-bold text-[11px] uppercase tracking-[0.15em] text-bk-ink-soft"
          >
            {facet.name}
          </p>
          <div
            role="group"
            aria-labelledby={`facet-${facet.key}`}
            className="flex flex-wrap items-center gap-bk-xs"
          >
            {facet.options.map((option) => (
              <FilterChip
                key={option.id}
                active={selected.has(option.id)}
                onClick={() => toggleFacet(option.id)}
                activeBg="var(--bk-decor-a, #7cf0bd)"
              >
                {option.label}
                <span className="tabular-nums opacity-60">{option.count}</span>
              </FilterChip>
            ))}
          </div>
        </div>
      ))}

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-bk-xs mb-bk-md">
        {hasSaleItems && (
          <FilterChip
            active={onSale}
            onClick={toggleSale}
            activeBg="var(--bk-decor-a, #7cf0bd)"
          >
            {t ? "تخفيضات" : "On Sale"}
          </FilterChip>
        )}
        <FilterChip
          active={underPrice}
          onClick={togglePrice}
          activeBg="var(--bk-primary, #ff5a8a)"
        >
          {t ? "أقل من ٥٠ ألف" : "Under 50K"}
        </FilterChip>
        {anyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 px-3 h-9 font-label font-bold text-xs uppercase tracking-wide text-bk-ink-soft hover:text-bk-ink transition-colors"
          >
            {t ? "مسح الكل" : "Clear all"}
            <MaterialIcon name="close" className="text-sm" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <BentoCard bg="cream" size="md" className="p-bk-xl text-center">
          <p className="font-display font-black uppercase text-base mb-bk-xs">
            {t ? "لا توجد منتجات مطابقة" : "No products match"}
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="font-label font-bold text-sm underline"
            style={{ color: "var(--bk-primary, #ff5a8a)" }}
          >
            {t ? "مسح عوامل التصفية" : "Clear filters"}
          </button>
        </BentoCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4">
            {shown.map((product, i) =>
              cardStyle === "price_pill" ? (
                <PricePillCard
                  key={product.id}
                  product={product}
                  locale={locale}
                  priority={i < 4}
                  showStars={showStars}
                />
              ) : (
                <SchneidersProductCard
                  key={product.id}
                  product={product}
                  index={i}
                  priority={i < 4}
                  whatsappPhone={whatsappPhone}
                  locale={locale}
                />
              ),
            )}
          </div>

          <div className="mt-bk-lg flex flex-col items-center gap-bk-xs">
            {hasMore && (
              <ChunkyButton
                type="button"
                bg="butter"
                size="lg"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                {t ? "عرض المزيد" : "Load more"}
              </ChunkyButton>
            )}
            <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
              {t
                ? `عرض ${shown.length} من ${filtered.length}`
                : `Showing ${shown.length} of ${filtered.length}`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
