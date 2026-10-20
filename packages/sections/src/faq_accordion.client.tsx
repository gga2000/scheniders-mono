// =====================================================================
// Section — faq_accordion
// =====================================================================
// Localised Q&A accordion. Wraps the existing `FaqAccordion` primitive
// after resolving the per-locale strings.
// =====================================================================
// Client half of `faq_accordion` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./faq_accordion.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useState } from "react";
import { resolveI18n } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { BentoCard, MaterialIcon, ScribbleHeading, Section } from "./helpers/primitives";
import type { Props } from "./faq_accordion";

export function FaqAccordionRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: { runtime: { locale: "ar" | "en" | "ku" } };
}) {
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [query, setQuery] = useState("");

  const tintVars = [
    "var(--bk-decor-a, #7cf0bd)",
    "var(--bk-accent, #ffd84a)",
    "var(--bk-decor-c, #9ad8ff)",
    "var(--bk-decor-b, #c5b6ff)",
  ] as const;

  const heading = resolveI18n(props.heading_i18n, locale);

  // Resolve once, keep the original index (drives tint + open state).
  const resolved = props.items.map((item, i) => ({
    i,
    q: resolveI18n(item.q_i18n, locale),
    a: resolveI18n(item.a_i18n, locale),
  }));
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? resolved.filter(
        (r) => r.q.toLowerCase().includes(needle) || r.a.toLowerCase().includes(needle),
      )
    : resolved;

  return (
    <Section>
      {heading && (
        <div data-i18n-field="heading_i18n" className="mb-bk-md">
          <ScribbleHeading color="mint">{heading}</ScribbleHeading>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-bk-md">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-bk-ink-soft">
          <MaterialIcon name="search" className="text-xl" />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t ? "ابحث في الأسئلة…" : "Search FAQs…"}
          className="w-full bg-bk-surface-alt pl-11 pr-4 py-3 font-body text-base focus:outline-none"
          style={{
            border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
            borderRadius: "var(--bk-radius-input, 0.75rem)",
            color: "var(--bk-ink, #1a1a1a)",
            boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
          }}
        />
      </div>

      <div className="space-y-bk-sm">
        {visible.length === 0 && (
          <p className="font-body text-sm text-bk-ink-soft py-bk-md text-center">
            {t ? "لا توجد نتائج مطابقة." : "No matching questions."}
          </p>
        )}
        {visible.map(({ i, q, a }) => {
          const open = openIdx === i;
          const tintVar = tintVars[i % tintVars.length];
          return (
            <BentoCard
              key={`${i}-${q}`}
              bg="white"
              rotate={open ? 0 : i % 2 === 0 ? 0.5 : -0.5}
              className="p-0 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenIdx(open ? null : i)}
                aria-expanded={open}
                className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left transition-colors"
                style={open ? { backgroundColor: tintVar } : undefined}
              >
                <span
                  data-i18n-field={`items[${i}].q_i18n`}
                  className="font-display font-black text-base uppercase leading-tight flex-1"
                >
                  {q}
                </span>
                <span
                  className={cn(
                    "w-9 h-9 flex items-center justify-center shrink-0 transition-transform",
                    open && "rotate-45",
                  )}
                  style={{
                    // When open, the header bar is already tinted — invert the
                    // chip to the card surface so it stays legible ("lit"
                    // state). Not literal white: on a dark kit the chip's ink
                    // glyph is light and vanished against #ffffff.
                    backgroundColor: open ? "var(--bk-surface-alt, #ffffff)" : tintVar,
                    border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                    borderRadius: "var(--bk-radius-input, 0.75rem)",
                    color: "var(--bk-ink, #1a1a1a)",
                  }}
                >
                  <MaterialIcon name="add" className="text-xl" />
                </span>
              </button>
              {open && (
                <div
                  data-i18n-field={`items[${i}].a_i18n`}
                  className="px-4 pb-4 pt-3 font-body text-sm leading-relaxed text-bk-ink-soft"
                  style={{ backgroundColor: "var(--bk-surface, #fff7ed)" }}
                >
                  {a}
                </div>
              )}
            </BentoCard>
          );
        })}
      </div>
    </Section>
  );
}
