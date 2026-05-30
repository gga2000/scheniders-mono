// =====================================================================
// Section — pdp_info_tabs
// =====================================================================
// Tabbed content panel for the PDP. Default tabs are
// Description / Specs / Shipping / Returns, each with its own i18n rich
// body. Reads runtime.product so the Description tab can fall back to
// product.description when no override is set.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { BentoCard } from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  tabs: z.array(
    z.object({
      key: z.string(),
      label_i18n: i18nStringSchema,
      body_i18n: i18nStringOptional,
    }),
  ),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  tabs: [
    {
      key: "description",
      label_i18n: { en: "Description", ar: "الوصف" },
      body_i18n: undefined,
    },
    {
      key: "specs",
      label_i18n: { en: "Specs", ar: "المواصفات" },
      body_i18n: {
        en: "Material, dimensions, and care details.",
        ar: "تفاصيل المواد والأبعاد والعناية.",
      },
    },
    {
      key: "shipping",
      label_i18n: { en: "Shipping", ar: "الشحن" },
      body_i18n: {
        en: "Same-day Baghdad. 1–3 days for other governorates.",
        ar: "نفس اليوم في بغداد، 1-3 أيام للمحافظات الأخرى.",
      },
    },
    {
      key: "returns",
      label_i18n: { en: "Returns", ar: "الإرجاع" },
      body_i18n: {
        en: "14-day free returns on unopened items.",
        ar: "إرجاع مجاني خلال 14 يوماً للمنتجات غير المفتوحة.",
      },
    },
  ],
};

function renderRich(text: string): React.ReactNode {
  if (!text) return null;
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

function PdpInfoTabsRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const product = ctx.product;
  const [active, setActive] = useState(0);

  if (!product) {
    if (process.env.NODE_ENV !== "production") {
      return (
        <div
          data-section-placeholder="pdp_info_tabs"
          style={{
            padding: 12,
            border: "1px dashed #999",
            color: "#666",
            fontSize: 12,
          }}
        >
          pdp_info_tabs — no product in runtime context
        </div>
      );
    }
    return null;
  }

  if (props.tabs.length === 0) return null;

  const activeTab = props.tabs[active] ?? props.tabs[0]!;
  const explicitBody = resolveI18n(activeTab.body_i18n, locale);
  const fallback =
    activeTab.key === "description" && !explicitBody && product.description
      ? product.description
      : "";
  const body = explicitBody || fallback;

  return (
    <section className="px-4 py-6">
      <BentoCard bg="white" size="md" className="p-0 overflow-hidden">
        <div
          role="tablist"
          className="flex gap-1 overflow-x-auto border-b-[3px] border-candy-ink bg-candy-cream p-2 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {props.tabs.map((tab, i) => {
            const label = resolveI18n(tab.label_i18n, locale);
            const isActive = i === active;
            return (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setActive(i)}
                className={
                  "px-4 py-2 rounded-xl font-display font-black text-sm uppercase whitespace-nowrap " +
                  (isActive
                    ? "bg-candy-pink text-white border-[3px] border-candy-ink shadow-bento-sm"
                    : "bg-white border-[3px] border-transparent text-candy-ink/70")
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <div role="tabpanel" className="p-5 sm:p-6 text-candy-ink/85">
          {body ? (
            renderRich(body)
          ) : (
            <p className="font-body text-sm text-candy-ink/50 italic">
              {locale === "ar" ? "لا توجد تفاصيل بعد." : "No details yet."}
            </p>
          )}
        </div>
      </BentoCard>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "pdp_info_tabs",
  category: "page",
  name: { en: "Info tabs", ar: "تبويبات المعلومات" },
  description: {
    en: "Tabbed Description / Specs / Shipping / Returns panel for PDP.",
    ar: "لوحة تبويبات الوصف والمواصفات والشحن والإرجاع لصفحة المنتج.",
  },
  thumbnail: "/sections/pdp_info_tabs.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpInfoTabsRender,
};

registerSection(definition);
export default definition;
