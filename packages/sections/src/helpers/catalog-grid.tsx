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

import { Fragment, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import type { Category, Product } from "../types";
import { applyCatalog, priceSplitFrom, SORTS } from "./catalog-filter";
import { filterByQuery } from "./product-search";
import type { CatalogSort } from "./catalog-filter";
import { formatCount, formatPrice } from "./format";
import { cn, PRESSABLE } from "./utils";
import { MaterialIcon } from "./primitives";

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
  search: { ar: "دور على عطر", en: "Find a perfume" },
  search_clear: { ar: "مسح البحث", en: "Clear search" },
  no_match: {
    ar: "ما لكينا عطر بهذا الاسم. جرب كلمة أقصر.",
    en: "Nothing by that name. Try a shorter word.",
  },
  price: { ar: "السعر", en: "Price" },
  empty: { ar: "ما لكينا عطور بهذا الفلتر.", en: "No perfumes match this filter." },
  /** Progress under the reveal control: "12 من 43". */
  shown_of: { ar: "معروض {shown} من {total}", en: "Showing {shown} of {total}" },
  more_tile_kicker: { ar: "بعدهم أكثر", en: "More to see" },
  more_tile_note: { ar: "عطر ثاني بانتظارك", en: "more perfumes waiting" },
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
  query: string,
): string {
  return `${categoryId ?? ""}|${sort}|${price ?? ""}|${pageSize}|${query}`;
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

/**
 * One product and the card already rendered for it.
 *
 * The card arrives as a rendered element rather than a render function: this
 * is a client component, and a function prop cannot cross the server/client
 * boundary — React throws "Functions cannot be passed directly to Client
 * Components". Passing elements keeps card rendering with the page, so the
 * catalogue never forks the card design, and every card stays a server
 * component.
 */
export interface CatalogItem {
  product: Product;
  card: ReactNode;
}

export function CatalogGrid({
  items,
  categories,
  categoryProductIds,
  locale,
  pageSize = 12,
  showSearch = false,
}: {
  items: CatalogItem[];
  categories: Category[];
  categoryProductIds?: Record<string, string[]>;
  locale: LocaleCode;
  pageSize?: number;
  /** Opt-in: a store with a handful of products does not need a search box. */
  showSearch?: boolean;
}) {
  const products = useMemo(() => items.map((i) => i.product), [items]);
  const cardById = useMemo(
    () => new Map(items.map((i) => [i.product.id, i.card])),
    [items],
  );
  // The URL carries the category's slug so a shared link reads as the
  // category it opens. State holds that handle and the id is derived, which
  // keeps both effects below independent of `categories`.
  const [categoryHandle, setCategoryHandle] = useState<string | null>(null);
  const [sort, setSort] = useState<CatalogSort>("bestsellers");
  const [price, setPrice] = useState<"under" | "over" | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(pageSize);
  const [shownFor, setShownFor] = useState(() =>
    viewKey(null, "bestsellers", null, pageSize, ""),
  );

  const categoryId = useMemo(() => {
    if (!categoryHandle) return null;
    const match = categories.find(
      (c) => c.slug === categoryHandle || c.id === categoryHandle,
    );
    return match?.id ?? null;
  }, [categoryHandle, categories]);
  /** What a chip puts in the URL: its slug, or its id when it has none. */
  const handleOf = (c: Category) => c.slug ?? c.id;

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
    if (cat) setCategoryHandle(cat);
    if (s && (SORTS as readonly string[]).includes(s)) setSort(s);
    if (pr === "under" || pr === "over") setPrice(pr);
    const search = q.get("q");
    if (search) setQuery(search);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    categoryHandle ? q.set("cat", categoryHandle) : q.delete("cat");
    sort === "bestsellers" ? q.delete("sort") : q.set("sort", sort);
    price ? q.set("price", price) : q.delete("price");
    query.trim() ? q.set("q", query.trim()) : q.delete("q");
    const next = q.toString();
    window.history.replaceState(
      null,
      "",
      next ? `${window.location.pathname}?${next}` : window.location.pathname,
    );
  }, [categoryHandle, sort, price, query]);

  // The split has to divide the set the shopper is looking at, not the shop.
  // A search that leaves two perfumes cannot be halved at the catalogue's
  // median — one side of it would be empty, which is a control that does
  // nothing. `priceSplitFrom` already returns null in that case; it just has
  // to be asked about the right list.
  const searched = useMemo(
    () => (query.trim() ? filterByQuery(products, query) : products),
    [products, query],
  );
  const threshold = useMemo(
    () => priceSplitFrom(searched.map((p) => p.price)),
    [searched],
  );

  const visible = useMemo(
    () =>
      applyCatalog(products, {
        sort,
        categoryId,
        categoryProductIds,
        price,
        threshold,
        query,
      }),
    [products, sort, categoryId, categoryProductIds, price, threshold, query],
  );

  // Every chip's count is produced by the SAME function that builds the
  // list, so a chip can never advertise a number it does not then yield.
  const chips = useMemo(() => {
    const base = { categoryProductIds, price, threshold, query };
    return categories
      .map((c) => ({
        id: c.id,
        handle: handleOf(c),
        label: c.name,
        count: applyCatalog(products, { ...base, categoryId: c.id }).length,
      }))
      // A chip that opens onto nothing is worse than no chip.
      .filter((c) => c.count > 0);
  }, [categories, products, categoryProductIds, price, threshold, query]);

  /**
   * Each price band's real yield, from the same function as the list. A band
   * that would show nothing is not offered — the rule the category chips
   * already follow.
   */
  const priceCounts = useMemo(() => {
    const base = { categoryProductIds, categoryId, threshold, query };
    return {
      under: applyCatalog(products, { ...base, price: "under" as const }).length,
      over: applyCatalog(products, { ...base, price: "over" as const }).length,
    };
  }, [products, categoryProductIds, categoryId, threshold, query]);
  const showPriceSplit =
    threshold != null && priceCounts.under > 0 && priceCounts.over > 0;

  const allCount = useMemo(
    () =>
      applyCatalog(products, { categoryProductIds, price, threshold, query })
        .length,
    [products, categoryProductIds, price, threshold, query],
  );

  // A changed filter must start at page one — showing page two of a list the
  // shopper has not seen page one of is worse than no paging at all. Adjusted
  // during render, not in an effect: an effect would paint the stale page
  // first and then throw it away.
  const key = viewKey(categoryId, sort, price, pageSize, query.trim());
  if (shownFor !== key) {
    setShownFor(key);
    setShown(pageSize);
  }

  const filtered = categoryId !== null || price !== null || query.trim() !== "";
  const page = visible.slice(0, shown);

  return (
    <div data-catalog-grid>
      {/* Controls. Quiet by design — the grid below is the content. */}
      <div className="mb-bk-md flex flex-col gap-3">
        {showSearch && (
          <div className="relative">
            {/* The glyph is what makes an empty rounded box read as a search
                field rather than a blank input. Faint on purpose: the
                perfumes are the content. */}
            <span
              className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2"
              style={{ color: "var(--bk-ink-faint, rgb(26 26 26 / 0.45))" }}
            >
              <MaterialIcon name="search" className="block text-xl" />
            </span>
            <input
              data-catalog-search
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search", locale)}
              aria-label={t("search", locale)}
              className="w-full border py-3 pe-12 ps-12 font-body text-base outline-none"
              style={{
                backgroundColor: "var(--bk-surface, #ffffff)",
                color: "var(--bk-ink, #1a1a1a)",
                borderColor: "var(--bk-divider, rgb(26 26 26 / 0.15))",
                borderRadius: "var(--bk-radius-pill, 9999px)",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
            />
            {/* `type="search"` gives a native clear on desktop and nothing on
                most mobile keyboards, which is the surface that matters here. */}
            {query !== "" && (
              <button
                type="button"
                data-catalog-search-clear
                onClick={() => setQuery("")}
                aria-label={t("search_clear", locale)}
                className={cn(
                  "absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full font-body text-lg leading-none",
                  PRESSABLE,
                )}
                style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
              >
                ×
              </button>
            )}
          </div>
        )}
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
            onClick={() => setCategoryHandle(null)}
          />
          {chips.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              count={c.count}
              active={categoryId === c.id}
              onClick={() =>
                setCategoryHandle(categoryId === c.id ? null : c.handle)
              }
            />
          ))}
        </div>

        {(showPriceSplit || filtered) && (
          <div className="flex flex-wrap items-center gap-2">
            {showPriceSplit && (
              <>
                {/* Named, because a price chip and a category chip look the
                    same but mean different things. Without the label the row
                    reads as two more categories. */}
                <span
                  data-price-label
                  className="font-body text-xs"
                  style={{ color: "var(--bk-ink-faint, rgb(26 26 26 / 0.45))" }}
                >
                  {t("price", locale)}
                </span>
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
                  setCategoryHandle(null);
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
          {t(query.trim() ? "no_match" : "empty", locale)}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {page.map((product) => (
            <Fragment key={product.id}>{cardById.get(product.id)}</Fragment>
          ))}
          {/* The reveal control lives IN the grid, shaped like the cards it
              sits beside, rather than as a lone button under everything.
              A shopper who has scrolled the shelf meets it where their eye
              already is, and it says how much is left rather than just
              "more". */}
          {shown < visible.length && (
            <button
              type="button"
              data-load-more
              onClick={() => setShown((n) => n + pageSize)}
              className={cn(
                "group flex h-full flex-col items-center justify-center gap-1 overflow-hidden text-center",
                PRESSABLE,
              )}
              style={{
                backgroundColor: "var(--bk-surface, #ffffff)",
                borderRadius: "var(--bk-radius-card, 1.5rem)",
                boxShadow:
                  "var(--bk-shadow-card, 0 8px 24px rgb(26 26 26 / 0.08))",
                minHeight: "12rem",
              }}
            >
              <span
                className="font-body text-[11px] font-semibold tracking-wide"
                style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
              >
                {t("more_tile_kicker", locale)}
              </span>
              <span
                data-remaining
                className="font-display text-3xl font-black leading-none tabular-nums"
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                <bdi>+{visible.length - page.length}</bdi>
              </span>
              <span
                className="px-3 font-body text-[11px]"
                style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
              >
                {t("more_tile_note", locale)}
              </span>
              <span
                className="mt-2 inline-flex items-center px-4 py-2 font-display text-sm font-bold"
                style={{
                  backgroundColor: "var(--bk-ink, #1a1a1a)",
                  color: "var(--bk-surface, #ffffff)",
                  borderRadius: "var(--bk-radius-pill, 9999px)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {t("more", locale)}
              </span>
            </button>
          )}
        </div>
      )}

      {shown < visible.length && (
        <p
          data-shown-of
          className="mt-bk-md text-center font-body text-xs tabular-nums"
          style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
        >
          {t("shown_of", locale)
            .split("{shown}")
            .join(String(page.length))
            .split("{total}")
            .join(String(visible.length))}
        </p>
      )}
    </div>
  );
}
