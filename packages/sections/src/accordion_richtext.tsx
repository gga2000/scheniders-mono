// =====================================================================
// Section — accordion_richtext
// =====================================================================
// Generic accordion for long-form rich-text content — shipping, terms,
// privacy, returns, sizing, etc. Different from `faq_accordion` which
// is Q&A; here each panel is a titled section with a multi-paragraph
// body. Renders paragraphs split on blank lines.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import {
  BentoCard,
  MaterialIcon,
  Section,
  SectionHeader,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  allow_multiple: z.boolean(),
  items: z.array(
    z.object({
      title_i18n: i18nStringSchema,
      body_i18n: i18nStringSchema,
    }),
  ),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Details", ar: "التفاصيل" },
  allow_multiple: false,
  items: [
    {
      title_i18n: { en: "Shipping", ar: "الشحن" },
      body_i18n: {
        en: "Same-day delivery in Baghdad on orders placed before 4pm.\n\nOther governorates ship in 1–3 working days.",
        ar: "توصيل بنفس اليوم في بغداد للطلبات قبل الرابعة عصراً.\n\nبقية المحافظات خلال 1-3 أيام عمل.",
      },
    },
    {
      title_i18n: { en: "Returns", ar: "الإرجاع" },
      body_i18n: {
        en: "14-day free returns on unopened items.\n\nContact support to start a return.",
        ar: "إرجاع مجاني خلال 14 يوماً للمنتجات غير المفتوحة.\n\nتواصل مع الدعم لبدء عملية الإرجاع.",
      },
    },
  ],
};

function renderParagraphs(text: string): React.ReactNode {
  return text.split(/\n{2,}/).map((p, i) => (
    <p key={i} className="mb-3 last:mb-0 font-body text-sm leading-relaxed">
      {p.split(/\n/).map((line, j, arr) => (
        <span key={j}>
          {line}
          {j < arr.length - 1 && <br />}
        </span>
      ))}
    </p>
  ));
}

function AccordionRichtextRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const [openSet, setOpenSet] = useState<Set<number>>(new Set([0]));

  if (props.items.length === 0) return null;

  const heading = resolveI18n(props.heading_i18n, locale);

  function toggle(i: number) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        if (!props.allow_multiple) next.clear();
        next.add(i);
      }
      return next;
    });
  }

  const tints = ["mint", "butter", "sky", "lilac", "cream"] as const;

  return (
    <Section>
      {heading && <SectionHeader title={heading} color="butter" />}
      <div className="space-y-bk-sm">
        {props.items.map((item, i) => {
          const title = resolveI18n(item.title_i18n, locale);
          const body = resolveI18n(item.body_i18n, locale);
          const open = openSet.has(i);
          const tint = tints[i % tints.length];
          return (
            <BentoCard
              key={`${i}-${title}`}
              bg="white"
              rotate={open ? 0 : i % 2 === 0 ? 0.5 : -0.5}
              className="p-0 overflow-hidden"
              style={{ borderRadius: "var(--bk-radius-card, 1.25rem)" }}
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={open}
                className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left"
              >
                <span className="font-display font-black text-base sm:text-lg uppercase leading-tight flex-1">
                  {title}
                </span>
                <span
                  className={cn(
                    "w-9 h-9 rounded-xl border-bk-bold border-bk-ink flex items-center justify-center shrink-0 transition-transform",
                    `bg-candy-${tint}`,
                    open && "rotate-45",
                  )}
                >
                  <MaterialIcon name="add" className="text-xl" />
                </span>
              </button>
              {open && (
                <div className="px-4 pb-4 text-bk-ink-soft border-t-[3px] border-dashed border-bk-ink/10 pt-3">
                  {renderParagraphs(body)}
                </div>
              )}
            </BentoCard>
          );
        })}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "accordion_richtext",
  category: "content",
  name: { en: "Rich-text accordion", ar: "أكوردين نص غني" },
  description: {
    en: "Accordion with rich-text bodies for terms, shipping, returns, etc.",
    ar: "أكوردين بمحتوى نصّي غني للسياسات والشحن والإرجاع.",
  },
  thumbnail: "/sections/accordion_richtext.svg",
  valid_on: [
    "home",
    "about",
    "faq",
    "policy_shipping",
    "policy_returns",
    "policy_privacy",
    "policy_terms",
    "product",
  ],
  schema,
  defaultProps,
  render: AccordionRichtextRender,
};

registerSection(definition);
export default definition;
