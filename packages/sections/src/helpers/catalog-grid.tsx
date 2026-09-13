"use client";
// =====================================================================
// CatalogGrid — the full-catalogue controls
// =====================================================================
// A chip rail, a sort control, a price split, and load-more, over the
// products already on the page. Filtering is client-side because the
// whole catalogue is already loaded; there is nothing to fetch and so
// nothing to spin on.
//
// Design: the products are the content, so every control is quiet.
// `--bk-primary` (the brand yellow) is deliberately NOT used here — it
// belongs to buying. Spending it on filter chips would dilute the one
// colour that means "act". An active chip is brand ink; an inactive one
// is a hairline outline.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import type { Category, Product } from "../types";
import { applyCatalog, priceSplitFrom, SORTS } from "./catalog-filter";
import type { CatalogSort } from "./catalog-filter";
import { formatCount, formatPrice } from "./format";
import { cn, PRESSABLE } from "./utils";

const SORT_LABELS: Record<CatalogSort, Record<"ar" | "en", string>> = {
  bestsellers: { ar: "الأكثر مبيعاً", en: "Best selling" },
  price_asc: { ar: "الأرخص أولاً", en: "Price: low to high" },
  price_desc: { ar: "الأغلى أولاً", en: "Price: high to low" },
  newest: { ar: "الأحدث", en: "Newest" },
};

const T = {
  all: { ar: "الكل", en: "All" },
  clear: { ar: "مسح الفلاتر", en: "Clear filters" },
  more: { ar: "شوف أكثر", en: "Show more" },
  under: { ar: "أقل من", en: "Under" },
  over: { ar: "وأكثر", en: "and up" },
  sort: { ar: "ترتيب", en: "Sort" },
  empty: { ar: "ما لكينا عطور بهذا الفلتر.", en: "No perfumes match this filter." },
} as const;

function t(key: keyof typeof T, locale: LocaleCode): string {
  return T[key][locale === "en" ? "en" : "ar"];
}

/** "٤٣ عطر" — the live result count, in the merchant's plural forms. */
function resultLabel(n: number, locale: LocaleCode): string {
  return formatCount(n, locale, {
    one: locale === "en" ? "1 perfume" : "عطر واحد",
    two: "عطران",
    few: "{count} عطور",
    many: "{count} عطراً",
    other: locale === "en" ? "{count} perfumes" : "{count} عطر",
  });
}

/** Identity of the current view. When it changes, paging starts over. */
function viewKey(
  categoryId: string | null,
  sort: CatalogSort,
  price: "under" | "over" | null,
  pageSize: number,
): string {
  return `${categoryId ?? ""}|${sort}|${price ?? ""}|${pageSize}`;
}

function chipStyle(active: boolean): CSSProperties {
  return active
    ? {
        backgroundColor: "var(--bk-ink, #1a1a1a)",
        color: "var(--bk-surface, #ffffff)",
        borderColor: "var(--bk-ink, #1a1a1a)",
        borderRadius: "var(--bk-radius-pill, 9999px)",
      }
    : {
        backgroundColor: "transparent",
        color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
        borderColor: "var(--bk-divider, rgb(26 26 26 / 0.15))",
        borderRadius: "var(--bk-radius-pill, 9999px)",
      };
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border px-4 py-2 font-body text-sm font-semibold",
        PRESSABLE,
      )}
      style={chipStyle(active)}
    >
      <span>{label}</span>
      {count != null && (
        <span className="text-xs font-medium tabular-nums opacity-60">
          <bdi>{count}</bdi>
        </span>
      )}
    </button>
  );
}

export function CatalogGrid({
  products,
  categories,
  categoryProductIds,
  locale,
  pageSize = 12,
  renderCard,
}: {
  products: Product[];
  categories: Category[];
  categoryProductIds?: Record<string, string[]>;
  locale: LocaleCode;
  pageSize?: number;
  /** The page owns card rendering so the catalogue never forks card design. */
  renderCard: (product: Product, index: number) => React.ReactNode;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sort, setSort] = useState<CatalogSort>("bestsellers");
  const [price, setPrice] = useState<"under" | "over" | null>(null);
  const [shown, setShown] = useState(pageSize);
  const [shownFor, setShownFor] = useState(() =>
    viewKey(null, "bestsellers", null, pageSize),
  );

  // Read state back out of the URL on mount so a filtered view survives a
  // share, a reload, and — the one that matters on mobile — the back button
  // after tapping into a product.
  //
  // This has to be an effect. `window` does not exist on the server, and
  // seeding the initial state from the URL during the first client render
  // would produce markup the server never sent, which is a hydration break.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const cat = q.get("cat");
    const s = q.get("sort") as CatalogSort | null;
    const pr = q.get("price");
    if (cat) setCategoryId(cat);
    if (s && (SORTS as readonly string[]).includes(s)) setSort(s);
    if (pr === "under" || pr === "over") setPrice(pr);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    categoryId ? q.set("cat", categoryId) : q.delete("cat");
    sort === "bestsellers" ? q.delete("sort") : q.set("sort", sort);
    price ? q.set("price", price) : q.delete("price");
    const next = q.toString();
    window.history.replaceState(
      null,
      "",
      next ? `${window.location.pathname}?${next}` : window.location.pathname,
    );
  }, [categoryId, sort, price]);

  const threshold = useMemo(
    () => priceSplitFrom(products.map((p) => p.price)),
    [products],
  );

  const visible = useMemo(
    () =>
      applyCatalog(products, {
        sort,
        categoryId,
        categoryProductIds,
        price,
        threshold,
      }),
    [products, sort, categoryId, categoryProductIds, price, threshold],
  );

  // Every chip's count is produced by the SAME function that builds the
  // list, so a chip can never advertise a number it does not then yield.
  const chips = useMemo(() => {
    const base = { categoryProductIds, price, threshold };
    return categories
      .map((c) => ({
        id: c.id,
        label: c.name,
        count: applyCatalog(products, { ...base, categoryId: c.id }).length,
      }))
      // A chip that opens onto nothing is worse than no chip.
      .filter((c) => c.count > 0);
  }, [categories, products, categoryProductIds, price, threshold]);

  const allCount = useMemo(
    () => applyCatalog(products, { categoryProductIds, price, threshold }).length,
    [products, categoryProductIds, price, threshold],
  );

  // A changed filter must start at page one — showing page two of a list the
  // shopper has not seen page one of is worse than no paging at all. Adjusted
  // during render, not in an effect: an effect would paint the stale page
  // first and then throw it away.
  const key = viewKey(categoryId, sort, price, pageSize);
  if (shownFor !== key) {
    setShownFor(key);
    setShown(pageSize);
  }

  const filtered = categoryId !== null || price !== null;
  const page = visible.slice(0, shown);

  return (
    <div data-catalog-grid>
      {/* Controls. Quiet by design — the grid below is the content. */}
      <div className="mb-bk-md flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            data-result-count
            className="font-body text-sm tabular-nums"
            style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
          >
            {resultLabel(visible.length, locale)}
          </span>

          <div className="flex items-center gap-2">
            <label
              className="font-body text-xs"
              style={{ color: "var(--bk-ink-faint, rgb(26 26 26 / 0.45))" }}
              htmlFor="catalog-sort"
            >
              {t("sort", locale)}
            </label>
            <select
              id="catalog-sort"
              data-catalog-sort
              value={sort}
              onChange={(e) => setSort(e.target.value as CatalogSort)}
              className="border px-3 py-2 font-body text-sm font-semibold"
              style={{
                backgroundColor: "var(--bk-surface, #ffffff)",
                color: "var(--bk-ink, #1a1a1a)",
                borderColor: "var(--bk-divider, rgb(26 26 26 / 0.15))",
                borderRadius: "var(--bk-radius-pill, 9999px)",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s][locale === "en" ? "en" : "ar"]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rail bleeds to the screen edge on mobile so chips scroll past the
            gutter; the first chip still lines up with the content. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip
            label={t("all", locale)}
            count={allCount}
            active={categoryId === null}
            onClick={() => setCategoryId(null)}
          />
          {chips.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              count={c.count}
              active={categoryId === c.id}
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
            />
          ))}
        </div>

        {(threshold != null || filtered) && (
          <div className="flex flex-wrap items-center gap-2">
            {threshold != null && (
              <>
                <Chip
                  label={`${t("under", locale)} ${formatPrice(threshold, locale)}`}
                  active={price === "under"}
                  onClick={() => setPrice(price === "under" ? null : "under")}
                />
                <Chip
                  label={`${formatPrice(threshold, locale)} ${t("over", locale)}`}
                  active={price === "over"}
                  onClick={() => setPrice(price === "over" ? null : "over")}
                />
              </>
            )}
            {filtered && (
              <button
                type="button"
                data-clear-filters
                onClick={() => {
                  setCategoryId(null);
                  setPrice(null);
                }}
                className={cn("font-body text-sm underline underline-offset-4", PRESSABLE)}
                style={{ color: "var(--bk-ink-faint, rgb(26 26 26 / 0.45))" }}
              >
                {t("clear", locale)}
              </button>
            )}
          </div>
        )}
      </div>

      {page.length === 0 ? (
        <p
          className="py-bk-lg text-center font-body text-sm"
          style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
        >
          {t("empty", locale)}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4">
          {page.map((product, i) => renderCard(product, i))}
        </div>
      )}

      {shown < visible.length && (
        <div className="mt-bk-lg flex justify-center">
          <button
            type="button"
            data-load-more
            onClick={() => setShown((n) => n + pageSize)}
            className={cn(
              "inline-flex items-center border px-6 py-3 font-display text-base font-bold",
              PRESSABLE,
            )}
            style={{
              backgroundColor: "var(--bk-surface, #ffffff)",
              color: "var(--bk-ink, #1a1a1a)",
              borderColor: "var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-pill, 9999px)",
              boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
            {t("more", locale)}
          </button>
        </div>
      )}
    </div>
  );
}
