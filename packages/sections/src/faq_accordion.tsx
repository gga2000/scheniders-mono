// =====================================================================
// Section — faq_accordion
// =====================================================================
// Localised Q&A accordion. Wraps the existing `FaqAccordion` primitive
// after resolving the per-locale strings.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import {
  BentoCard,
  MaterialIcon,
  ScribbleHeading,
  Section,
} from "./helpers/primitives";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  items: z.array(
    z.object({
      q_i18n: i18nStringSchema,
      a_i18n: i18nStringSchema,
    }),
  ),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Frequently asked", ar: "الأسئلة الشائعة" },
  items: [
    {
      q_i18n: {
        en: "How long does delivery take?",
        ar: "كم تستغرق مدة التوصيل؟",
      },
      a_i18n: {
        en: "Same-day inside Baghdad, 1–3 days for other governorates.",
        ar: "نفس اليوم داخل بغداد، 1-3 أيام للمحافظات الأخرى.",
      },
    },
    {
      q_i18n: { en: "Can I pay on delivery?", ar: "هل يمكن الدفع عند الاستلام؟" },
      a_i18n: {
        en: "Yes — cash on delivery is supported across Iraq.",
        ar: "نعم — الدفع عند الاستلام متاح في جميع المحافظات.",
      },
    },
    {
      q_i18n: { en: "What is the return policy?", ar: "ما هي سياسة الإرجاع؟" },
      a_i18n: {
        en: "14-day free returns on unopened items.",
        ar: "إرجاع مجاني خلال 14 يوماً للمنتجات غير المفتوحة.",
      },
    },
  ],
};

function FaqAccordionRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: { runtime: { locale: "ar" | "en" | "ku" } };
}) {
  const locale = ctx.runtime.locale;
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const tints = [
    "bg-candy-mint",
    "bg-candy-butter",
    "bg-candy-sky",
    "bg-candy-lilac",
  ] as const;
  const tintVars = [
    "var(--bk-success, #7cf0bd)",
    "var(--bk-accent, #ffd84a)",
    "#9ad8ff",
    "var(--bk-secondary, #c5b6ff)",
  ] as const;

  const heading = resolveI18n(props.heading_i18n, locale);

  return (
    <Section>
      {heading && (
        <div data-i18n-field="heading_i18n" className="mb-bk-lg">
          <ScribbleHeading color="mint">{heading}</ScribbleHeading>
        </div>
      )}
      <div className="space-y-bk-sm">
        {props.items.map((item, i) => {
          const q = resolveI18n(item.q_i18n, locale);
          const a = resolveI18n(item.a_i18n, locale);
          const open = openIdx === i;
          const tint = tints[i % tints.length];
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
                className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left"
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
                    tint,
                    open && "rotate-45",
                  )}
                  style={{
                    backgroundColor: tintVar,
                    border:
                      "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
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
                  className="px-4 pb-4 font-body text-sm leading-relaxed text-bk-ink-soft border-t-[3px] border-dashed border-candy-ink/10 pt-3"
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

const def: SectionDefinition<Props> = {
  type: "faq_accordion",
  category: "content",
  name: { en: "FAQ accordion", ar: "أسئلة شائعة" },
  description: {
    en: "Localised Q&A accordion with chunky bento cards.",
    ar: "أكوردين أسئلة وأجوبة بتصميم بنتو.",
  },
  thumbnail: "/sections/faq_accordion.svg",
  valid_on: ["faq", "home", "product"],
  schema,
  defaultProps,
  render: FaqAccordionRender,
};

registerSection(def);
export default def;
