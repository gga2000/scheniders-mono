// =====================================================================
// Section — search_results_grid
// =====================================================================
// Renders product search results. Reads `?q=` from `window.location` on
// the client; on the server we fall back to the full product list so
// SSR has something to paint. Matches against product `name`, `sku`,
// and (when present) `description`.
// =====================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { BentoCard, Section } from "./helpers/primitives";
import { SchneidersProductCard } from "./helpers/product-card";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  empty_state_message_i18n: i18nStringSchema,
  cols_mobile: z.union([z.literal(1), z.literal(2)]),
  cols_desktop: z.union([z.literal(2), z.literal(3), z.literal(4)]),
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
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        setQuery((params.get("q") ?? "").trim());
      } catch {
        setQuery("");
      }
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

  const mobileCols =
    props.cols_mobile === 1 ? "grid-cols-1" : "grid-cols-2";
  const desktopCols =
    props.cols_desktop === 2
      ? "sm:grid-cols-2"
      : props.cols_desktop === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-4";

  if (results.length === 0) {
    return (
      <Section density="dense">
        <BentoCard bg="cream" size="md" className="p-bk-xl text-center">
          <p className="font-display font-black text-xl uppercase text-bk-ink">
            {emptyMessage}
          </p>
          {query && (
            <p className="mt-bk-xs font-body text-sm text-bk-ink-soft">
              {locale === "ar" ? `بحثت عن: "${query}"` : `Searched for: "${query}"`}
            </p>
          )}
        </BentoCard>
      </Section>
    );
  }

  return (
    <Section density="dense">
      {query && (
        <p className="mb-bk-md font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
          {locale === "ar"
            ? `${results.length} نتيجة لـ "${query}"`
            : `${results.length} results for "${query}"`}
        </p>
      )}
      <div className={`grid ${mobileCols} ${desktopCols} gap-bk-sm sm:gap-bk-md`}>
        {results.map((p, i) => (
          <SchneidersProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "search_results_grid",
  category: "page",
  name: { en: "Search results", ar: "نتائج البحث" },
  description: {
    en: "Search results grid filtered by ?q= with empty-state fallback.",
    ar: "شبكة نتائج البحث المفلترة من ?q= مع حالة فارغة.",
  },
  thumbnail: "/sections/search_results_grid.svg",
  valid_on: ["search"],
  schema,
  defaultProps,
  render: SearchResultsGridRender,
};

registerSection(definition);
export default definition;
