// =====================================================================
// Section — search_results_grid
// =====================================================================
// Renders product search results. Reads `?q=` from `window.location` on
// the client; on the server we fall back to the full product list so
// SSR has something to paint. Matches against product `name`, `sku`,
// and (when present) `description`. A plain GET search form sits at the
// top so the page works without a header search (and without JS).
// =====================================================================

"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import {
  ChunkyButton,
  MaterialIcon,
  Section,
  WhatsAppButton,
} from "./helpers/primitives";
import { SchneidersProductCard } from "./helpers/product-card";
import { PricePillCard } from "./product_grid";
import { useStoreBase } from "./helpers/store-context";
import { formatCount } from "./helpers/format";
import { resolveTenantWhatsapp, whatsappDigits } from "./helpers/whatsapp";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

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

const schema = z.object({
  empty_state_message_i18n: i18nStringSchema,
  cols_mobile: z.union([z.literal(1), z.literal(2)]),
  cols_desktop: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  /** Mirrors product_grid: "standard" = bento card, "price_pill" = soft
   *  rounded photo card. Optional so stored configs keep parsing. */
  card_style: z.enum(["standard", "price_pill"]).optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  empty_state_message_i18n: {
    en: "No products matched your search.",
    ar: "لا توجد منتجات تطابق بحثك.",
  },
  cols_mobile: 2,
  cols_desktop: 4,
};

function SearchResultsGridRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const base = useStoreBase();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const params = new URLSearchParams(window.location.search);
      const q = (params.get("q") ?? "").trim();
      setQuery(q);
      setDraft(q);
    };
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  const results = useMemo(() => {
    if (!query) return ctx.products;
    const needle = query.toLowerCase();
    return ctx.products.filter((p) => {
      const hay = [
        p.name,
        p.sku ?? "",
        (p as unknown as { description?: string | null }).description ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [ctx.products, query]);

  const emptyMessage = resolveI18n(props.empty_state_message_i18n, locale);
  const phone = resolveTenantWhatsapp(ctx.tenant);

  const mobileCols = props.cols_mobile === 1 ? "grid-cols-1" : "grid-cols-2";
  const desktopCols =
    props.cols_desktop === 2
      ? "sm:grid-cols-2"
      : props.cols_desktop === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-4";

  // Plain GET form: works before hydration and without a header search. The
  // storefront /search page reads `?q=` and this section re-reads it on mount.
  const searchForm = (
    <form
      role="search"
      method="get"
      action={`${base}/search`}
      className="mb-bk-md flex gap-bk-xs"
    >
      <label htmlFor={searchId} className="sr-only">
        {resolveI18n(STRINGS.searchLabel, locale)}
      </label>
      <input
        id={searchId}
        type="search"
        name="q"
        autoComplete="off"
        enterKeyHint="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={resolveI18n(STRINGS.searchLabel, locale)}
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

  if (results.length === 0) {
    return (
      <Section density="dense">
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
      {searchForm}
      {query && (
        <p
          aria-live="polite"
          className="mb-bk-md font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft"
        >
          {resultsLine(results.length, query, locale)}
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

const definition: SectionDefinition<Props> = {
  type: "search_results_grid",
  category: "page",
  name: { en: "Search results", ar: "نتائج البحث" },
  description: {
    en: "Search form + results grid filtered by ?q= with empty-state fallback.",
    ar: "نموذج بحث وشبكة نتائج مفلترة من ?q= مع حالة فارغة.",
  },
  thumbnail: "/sections/search_results_grid.svg",
  valid_on: ["search"],
  schema,
  defaultProps,
  render: SearchResultsGridRender,
};

registerSection(definition);
export default definition;
