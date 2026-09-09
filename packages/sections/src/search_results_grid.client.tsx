// =====================================================================
// Section — search_results_grid
// =====================================================================
// Renders product search results. The query arrives server-side as
// `ctx.runtime.search_query` (the storefront /search route copies `?q=`
// into the runtime), so the SSR pass already paints the filtered list —
// no flash of the full catalogue, no layout shift after hydration
// (P0-7 / P2-27). Matches every whitespace-separated token against
// product `name`, `sku` and (when present) `description`. A plain GET
// search form sits at the top so the page works without a header search
// (and without JS); it is prefilled with the current query.
// =====================================================================
// Client half of `search_results_grid` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./search_results_grid.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useId } from "react";
import { resolveI18n, matchesAllTokens, searchTokens } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { ChunkyButton, MaterialIcon, Section, WhatsAppButton } from "./helpers/primitives";
import { SchneidersProductCard } from "./helpers/product-card";
import { PricePillCard } from "./product_grid";
import { useStoreBase } from "./helpers/store-context";
import { formatCount } from "./helpers/format";
import { resolveTenantWhatsapp, whatsappDigits } from "./helpers/whatsapp";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import type { Props } from "./search_results_grid";

const STRINGS = {
  searchLabel: { en: "Search products", ar: "ابحث عن منتج" },
  searchButton: { en: "Search", ar: "بحث" },
  searchedFor: { en: "Searched for", ar: "بحثت عن" },
  helpTitle: {
    en: "Can't find what you want?",
    ar: "ما لقيت اللي تبحث عنه؟",
  },
  helpBody: {
    en: "Our personal shoppers are ready to help you find the perfect piece.",
    ar: "فريق التسوّق الشخصي جاهز لمساعدتك في إيجاد القطعة المثالية.",
  },
  askUs: { en: "Ask us", ar: "اسألنا" },
} as const;

const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";

/**
 * Everything about a product that is worth searching: its own text, plus
 * the merchant's attribute values. A shopper looking for "عنبر" means a
 * perfume with amber in it, not a product whose description happens to say
 * the word — and only the attributes know that.
 *
 * Only the human-readable side is indexed: option LABELS rather than their
 * machine values, so nobody finds a product by typing "oriental" at an
 * Arabic storefront.
 */
function searchableText(p: Product, locale: LocaleCode): string {
  const parts = [p.name, p.sku ?? "", p.description ?? "", p.short_description ?? ""];

  for (const attr of p.attributes ?? []) {
    parts.push(resolveI18n(attr.def.name_i18n, locale));
    switch (attr.kind) {
      case "enum":
        parts.push(resolveI18n(attr.option.label_i18n, locale) || attr.value);
        break;
      case "group_list":
        for (const items of Object.values(attr.value)) parts.push(items.join(" "));
        break;
      case "text":
        parts.push(resolveI18n(attr.value, locale));
        break;
      default:
        // A number or a yes/no is not something anyone types into search.
        break;
    }
  }
  return parts.join(" ");
}

/**
 * Server-safe product search: every token of `query` must appear in the
 * product's text or its attribute values. An empty query returns the full
 * list unchanged.
 *
 * Both sides are folded by `normalizeArabic`, so the same word spelled the
 * several legitimate ways Arabic allows still matches — see
 * packages/shared/src/arabic-search.ts.
 */
export function filterProductsByQuery(
  products: Product[],
  query: string,
  locale: LocaleCode = "ar",
): Product[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return products;
  return products.filter((p) => matchesAllTokens(searchableText(p, locale), tokens));
}

function resultsLine(count: number, query: string, locale: LocaleCode): string {
  const line =
    locale === "en"
      ? formatCount(count, locale, {
          one: "{count} result for",
          other: "{count} results for",
        })
      : formatCount(count, locale, {
          one: "نتيجة واحدة لـ",
          two: "نتيجتان لـ",
          few: "{count} نتائج لـ",
          many: "{count} نتيجة لـ",
          other: "{count} نتيجة لـ",
        });
  return `${line} "${query}"`;
}

/** "Personal shopper" help card shown under the results (and the empty
 *  state) — a friendly WhatsApp escape hatch when search comes up short. */
function HelpCard({
  locale,
  phone,
}: {
  locale: LocaleCode;
  phone: string | null;
}) {
  return (
    <div
      className="mt-bk-md p-bk-lg text-center"
      style={{
        backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
        border: INK_BORDER,
        borderRadius: "var(--bk-radius-card, 1rem)",
      }}
    >
      <h2 className="font-display font-black text-bk-h3 text-bk-ink text-balance">
        {resolveI18n(STRINGS.helpTitle, locale)}
      </h2>
      <p className="mt-bk-2xs font-body text-sm text-bk-ink-soft">
        {resolveI18n(STRINGS.helpBody, locale)}
      </p>
      {phone && (
        <WhatsAppButton
          href={`https://wa.me/${whatsappDigits(phone)}`}
          tone="outline"
          className="mt-bk-sm"
        >
          {resolveI18n(STRINGS.askUs, locale)}
        </WhatsAppButton>
      )}
    </div>
  );
}

export function SearchResultsGridRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const base = useStoreBase();
  const searchId = useId();
  const query = ctx.runtime.search_query?.trim() ?? "";
  const results = filterProductsByQuery(ctx.products, query, ctx.runtime.locale);

  const emptyMessage = resolveI18n(props.empty_state_message_i18n, locale);
  const phone = resolveTenantWhatsapp(ctx.tenant);
  const searchLabel = resolveI18n(STRINGS.searchLabel, locale);

  const mobileCols = props.cols_mobile === 1 ? "grid-cols-1" : "grid-cols-2";
  const desktopCols =
    props.cols_desktop === 2
      ? "sm:grid-cols-2"
      : props.cols_desktop === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-4";

  // Plain GET form: works before hydration and without a header search.
  // Uncontrolled input keyed on the query so a client-side navigation to a
  // new `?q=` re-syncs the field instead of keeping the stale draft.
  const searchForm = (
    <form
      key={query}
      role="search"
      method="get"
      action={`${base}/search`}
      className="mb-bk-md flex gap-bk-xs"
    >
      <label htmlFor={searchId} className="sr-only">
        {searchLabel}
      </label>
      <input
        id={searchId}
        type="search"
        name="q"
        autoComplete="off"
        enterKeyHint="search"
        defaultValue={query}
        placeholder={searchLabel}
        className="min-w-0 flex-1 px-3 py-3 font-body text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
        style={{
          backgroundColor: "var(--bk-surface, #ffffff)",
          border: INK_BORDER,
          borderRadius: "var(--bk-radius-input, 0.75rem)",
          color: "var(--bk-ink, #1a1a1a)",
        }}
      />
      <ChunkyButton type="submit" bg="pink" size="md">
        <MaterialIcon name="search" className="text-xl" />
        <span className="sr-only sm:not-sr-only">
          {resolveI18n(STRINGS.searchButton, locale)}
        </span>
      </ChunkyButton>
    </form>
  );

  // The page's h1 — the results line is the meaningful title when a query
  // is present; otherwise the plain search label.
  const heading = query
    ? resultsLine(results.length, query, locale)
    : searchLabel;

  if (results.length === 0) {
    return (
      <Section density="dense">
        <h1 className="sr-only">{heading}</h1>
        {searchForm}
        <div
          className="p-bk-xl text-center"
          style={{
            backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
            border: INK_BORDER,
            borderRadius: "var(--bk-radius-card, 1rem)",
          }}
        >
          <p
            className="font-display font-black text-bk-h3 text-bk-ink text-balance"
            data-i18n-field="empty_state_message_i18n"
          >
            {emptyMessage}
          </p>
          {query && (
            <p className="mt-bk-xs font-body text-sm text-bk-ink-soft">
              {resolveI18n(STRINGS.searchedFor, locale)}: "{query}"
            </p>
          )}
        </div>
        <HelpCard locale={locale} phone={phone} />
      </Section>
    );
  }

  return (
    <Section density="dense">
      <h1 className="sr-only">{heading}</h1>
      {searchForm}
      {query && (
        <p
          aria-live="polite"
          className="mb-bk-md font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft tabular-nums"
        >
          {heading}
        </p>
      )}
      <div
        className={`grid ${mobileCols} ${desktopCols} gap-bk-sm sm:gap-bk-md`}
      >
        {results.map((p, i) =>
          props.card_style === "price_pill" ? (
            <PricePillCard
              key={p.id}
              product={p}
              locale={locale}
              priority={i < 4}
            />
          ) : (
            <SchneidersProductCard
              key={p.id}
              product={p}
              index={i}
              priority={i < 4}
              locale={locale}
              whatsappPhone={phone}
            />
          ),
        )}
      </div>
      <HelpCard locale={locale} phone={phone} />
    </Section>
  );
}
