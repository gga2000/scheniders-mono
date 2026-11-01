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

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import type { Category, Product } from "../types";
import { applyCatalog, priceSplitFrom, SORTS } from "./catalog-filter";
import { filterByQuery } from "./product-search";
import type { CatalogSort } from "./catalog-filter";
import { buildFacets, matchesFacets, type FacetId } from "./attribute-facets";
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
  filter: { ar: "فلتر", en: "Filter" },
  filter_title: { ar: "فلتر العطور", en: "Filter perfumes" },
  close: { ar: "سكّر", en: "Close" },
  /** The sheet's primary action carries the live yield: «اعرض 12 عطر». */
  show_results: { ar: "اعرض {label}", en: "Show {label}" },
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
  facets: ReadonlySet<FacetId>,
): string {
  return `${categoryId ?? ""}|${sort}|${price ?? ""}|${pageSize}|${query}|${[...facets].sort().join(",")}`;
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
  showFacets = false,
}: {
  items: CatalogItem[];
  categories: Category[];
  categoryProductIds?: Record<string, string[]>;
  locale: LocaleCode;
  pageSize?: number;
  /** Opt-in: a store with a handful of products does not need a search box. */
  showSearch?: boolean;
  /**
   * Opt-in: one chip row per merchant-defined filterable attribute, built
   * from what the loaded products actually carry. Renders nothing when no
   * product has a filterable attribute value.
   */
  showFacets?: boolean;
}) {
  const allProducts = useMemo(() => items.map((i) => i.product), [items]);
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
  const [selectedFacets, setSelectedFacets] = useState<ReadonlySet<FacetId>>(
    () => new Set(),
  );
  const [shown, setShown] = useState(pageSize);
  const [shownFor, setShownFor] = useState(() =>
    viewKey(null, "bestsellers", null, pageSize, "", new Set()),
  );

  // Facets come from the whole loaded catalogue, so an option never vanishes
  // because another control narrowed the list. Every control below then
  // works on the facet-narrowed set, which keeps each chip's count equal to
  // what it yields.
  const facets = useMemo(
    () => (showFacets ? buildFacets(allProducts, locale) : []),
    [showFacets, allProducts, locale],
  );
  const products = useMemo(
    () =>
      selectedFacets.size === 0
        ? allProducts
        : allProducts.filter((p) => matchesFacets(p, selectedFacets, facets)),
    [allProducts, selectedFacets, facets],
  );
  const toggleFacet = (id: FacetId) =>
    setSelectedFacets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
    const attrs = q.getAll("attr");
    if (attrs.length > 0) setSelectedFacets(new Set(attrs));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    categoryHandle ? q.set("cat", categoryHandle) : q.delete("cat");
    sort === "bestsellers" ? q.delete("sort") : q.set("sort", sort);
    price ? q.set("price", price) : q.delete("price");
    query.trim() ? q.set("q", query.trim()) : q.delete("q");
    q.delete("attr");
    for (const id of selectedFacets) q.append("attr", id);
    const next = q.toString();
    window.history.replaceState(
      null,
      "",
      next ? `${window.location.pathname}?${next}` : window.location.pathname,
    );
  }, [categoryHandle, sort, price, query, selectedFacets]);

  // The split has to divide the set the shopper is looking at, not the shop.
  // A search that leaves two perfumes cannot be halved at the catalogue's
  // median — one side of it would be empty, which is a control that does
  // nothing. `priceSplitFrom` already returns null in that case; it just has
  // to be asked about the right list.
  const searched = useMemo(
    () => (query.trim() ? filterByQuery(products, query, locale) : products),
    [products, query, locale],
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
        locale,
      }),
    [products, sort, categoryId, categoryProductIds, price, threshold, query, locale],
  );

  // Every chip's count is produced by the SAME function that builds the
  // list, so a chip can never advertise a number it does not then yield.
  const chips = useMemo(() => {
    const base = { categoryProductIds, price, threshold, query, locale };
    return categories
      .map((c) => ({
        id: c.id,
        handle: handleOf(c),
        label: c.name,
        count: applyCatalog(products, { ...base, categoryId: c.id }).length,
      }))
      // A chip that opens onto nothing is worse than no chip.
      .filter((c) => c.count > 0);
  }, [categories, products, categoryProductIds, price, threshold, query, locale]);

  /**
   * Each price band's real yield, from the same function as the list. A band
   * that would show nothing is not offered — the rule the category chips
   * already follow.
   */
  const priceCounts = useMemo(() => {
    const base = { categoryProductIds, categoryId, threshold, query, locale };
    return {
      under: applyCatalog(products, { ...base, price: "under" as const }).length,
      over: applyCatalog(products, { ...base, price: "over" as const }).length,
    };
  }, [products, categoryProductIds, categoryId, threshold, query, locale]);
  const showPriceSplit =
    threshold != null && priceCounts.under > 0 && priceCounts.over > 0;

  const allCount = useMemo(
    () =>
      applyCatalog(products, { categoryProductIds, price, threshold, query, locale })
        .length,
    [products, categoryProductIds, price, threshold, query, locale],
  );

  // A changed filter must start at page one — showing page two of a list the
  // shopper has not seen page one of is worse than no paging at all. Adjusted
  // during render, not in an effect: an effect would paint the stale page
  // first and then throw it away.
  const key = viewKey(
    categoryId,
    sort,
    price,
    pageSize,
    query.trim(),
    selectedFacets,
  );
  if (shownFor !== key) {
    setShownFor(key);
    setShown(pageSize);
  }

  // Facets and the price split live in one sheet behind «فلتر» instead of a
  // stack of chip rails over the grid: on a phone those rails pushed every
  // perfume below the first screen. The badge counts what is narrowing the
  // list from inside the sheet, so a closed sheet never hides a live filter.
  const sheetRef = useRef<HTMLDialogElement | null>(null);
  const sheetFilterCount = selectedFacets.size + (price !== null ? 1 : 0);
  const hasSheet = facets.length > 0 || showPriceSplit;
  const openSheet = () => sheetRef.current?.showModal();
  const closeSheet = () => sheetRef.current?.close();

  const filtered =
    categoryId !== null ||
    price !== null ||
    query.trim() !== "" ||
    selectedFacets.size > 0;
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
            {hasSheet && (
              <button
                type="button"
                data-catalog-filter-open
                onClick={openSheet}
                aria-haspopup="dialog"
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 border px-4 font-body text-sm font-semibold",
                  PRESSABLE,
                )}
                style={chipStyle(sheetFilterCount > 0)}
              >
                <MaterialIcon name="tune" className="text-lg" />
                <span>{t("filter", locale)}</span>
                {sheetFilterCount > 0 && (
                  <span
                    data-catalog-filter-count
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums"
                    style={{
                      backgroundColor: "var(--bk-surface, #ffffff)",
                      color: "var(--bk-ink, #1a1a1a)",
                    }}
                  >
                    <bdi>{sheetFilterCount}</bdi>
                  </span>
                )}
              </button>
            )}
            <label
              className="sr-only"
              htmlFor="catalog-sort"
            >
              {t("sort", locale)}
            </label>
            <select
              id="catalog-sort"
              data-catalog-sort
              value={sort}
              onChange={(e) => setSort(e.target.value as CatalogSort)}
              className="min-h-11 border px-3 font-body text-sm font-semibold"
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

        {filtered && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-clear-filters
              onClick={() => {
                setCategoryHandle(null);
                setPrice(null);
                setSelectedFacets(new Set());
              }}
              className={cn("min-h-11 font-body text-sm underline underline-offset-4", PRESSABLE)}
              style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
            >
              {t("clear", locale)}
            </button>
          </div>
        )}

        {hasSheet && (
          // Native <dialog> + showModal(): focus is trapped and returned,
          // Escape closes, and the page behind is inert — no hand-rolled
          // focus code. Clicking the backdrop (the dialog element itself,
          // outside the panel) closes it too.
          <dialog
            ref={sheetRef}
            data-catalog-filter-sheet
            aria-labelledby="catalog-filter-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeSheet();
            }}
            className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-hidden p-0 backdrop:bg-black/30 sm:m-auto sm:max-w-lg"
            style={{
              backgroundColor: "var(--bk-surface, #ffffff)",
              color: "var(--bk-ink, #1a1a1a)",
              borderTopLeftRadius: "var(--bk-radius-card, 1.5rem)",
              borderTopRightRadius: "var(--bk-radius-card, 1.5rem)",
            }}
          >
            <div className="flex max-h-[85dvh] flex-col">
              <div
                className="flex items-center justify-between border-b px-5 py-3"
                style={{ borderColor: "var(--bk-divider, rgb(26 26 26 / 0.1))" }}
              >
                <h2
                  id="catalog-filter-title"
                  className="font-display text-lg font-bold"
                  style={{ fontFamily: "var(--bk-font-display, inherit)" }}
                >
                  {t("filter_title", locale)}
                </h2>
                <button
                  type="button"
                  data-catalog-filter-close
                  onClick={closeSheet}
                  aria-label={t("close", locale)}
                  className={cn("flex h-11 w-11 items-center justify-center rounded-full", PRESSABLE)}
                >
                  <MaterialIcon name="close" className="text-2xl" />
                </button>
              </div>

              <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
                {/* One group per filterable attribute, in the merchant's own
                    order. Options within a group widen the list; groups
                    narrow it. */}
                {facets.map((facet) => (
                  <div
                    key={facet.key}
                    data-attribute-facet={facet.key}
                    className="flex flex-col gap-2"
                  >
                    <span
                      id={`catalog-facet-${facet.key}`}
                      className="font-body text-sm font-bold"
                    >
                      {facet.name}
                    </span>
                    <div
                      role="group"
                      aria-labelledby={`catalog-facet-${facet.key}`}
                      className="flex flex-wrap gap-2"
                    >
                      {facet.options.map((option) => (
                        <Chip
                          key={option.id}
                          label={option.label}
                          count={option.count}
                          active={selectedFacets.has(option.id)}
                          onClick={() => toggleFacet(option.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {showPriceSplit && (
                  <div className="flex flex-col gap-2">
                    {/* Named, because a price chip and a category chip look
                        the same but mean different things. */}
                    <span data-price-label className="font-body text-sm font-bold">
                      {t("price", locale)}
                    </span>
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                  </div>
                )}
              </div>

              <div
                className="flex items-center gap-3 border-t px-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3"
                style={{ borderColor: "var(--bk-divider, rgb(26 26 26 / 0.1))" }}
              >
                {sheetFilterCount > 0 && (
                  <button
                    type="button"
                    data-catalog-filter-reset
                    onClick={() => {
                      setPrice(null);
                      setSelectedFacets(new Set());
                    }}
                    className={cn("min-h-11 px-2 font-body text-sm font-semibold underline underline-offset-4", PRESSABLE)}
                  >
                    {t("clear", locale)}
                  </button>
                )}
                <button
                  type="button"
                  data-catalog-filter-apply
                  onClick={closeSheet}
                  className={cn("min-h-12 flex-1 font-display text-base font-bold", PRESSABLE)}
                  style={{
                    backgroundColor: "var(--bk-ink, #1a1a1a)",
                    color: "var(--bk-surface, #ffffff)",
                    borderRadius: "var(--bk-radius-pill, 9999px)",
                    fontFamily: "var(--bk-font-display, inherit)",
                  }}
                >
                  {t("show_results", locale)
                    .split("{label}")
                    .join(resultLabel(visible.length, locale))}
                </button>
              </div>
            </div>
          </dialog>
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
