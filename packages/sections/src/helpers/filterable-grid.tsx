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
import type { LocaleCode } from "@scheniders/shared";
import { buildFacets, matchesFacets, type FacetId } from "./attribute-facets";
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
  showDiscountBadge = false,
  lowStockThreshold,
}: {
  products: Product[];
  locale: LocaleCode;
  whatsappPhone: string | null;
  /** Match the card the surrounding grid would have drawn. */
  cardStyle?: "standard" | "price_pill";
  /** price_pill card options, forwarded so the card matches the flat grid. */
  showStars?: boolean;
  showDiscountBadge?: boolean;
  lowStockThreshold?: number;
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
                  showDiscountBadge={showDiscountBadge}
                  lowStockThreshold={lowStockThreshold}
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
