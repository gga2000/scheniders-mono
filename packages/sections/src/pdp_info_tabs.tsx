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
import { BentoCard, Section } from "./helpers/primitives";
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
    <Section>
      <BentoCard bg="white" size="md" className="p-0 overflow-hidden">
        <div
          role="tablist"
          className="flex gap-bk-2xs overflow-x-auto bg-candy-cream p-bk-xs scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            backgroundColor: "var(--bk-surface, #fff7ed)",
            borderBottom:
              "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
          }}
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
                className="px-4 py-2 font-display font-black text-sm uppercase whitespace-nowrap"
                style={
                  isActive
                    ? {
                        backgroundColor: "var(--bk-primary, #ff5a8a)",
                        color: "var(--bk-on-primary, #ffffff)",
                        border:
                          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                        borderRadius: "var(--bk-radius-input, 0.75rem)",
                        boxShadow:
                          "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                        fontFamily: "var(--bk-font-display, inherit)",
                      }
                    : {
                        backgroundColor: "#ffffff",
                        color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
                        border: "var(--bk-border-thickness, 3px) solid transparent",
                        borderRadius: "var(--bk-radius-input, 0.75rem)",
                        fontFamily: "var(--bk-font-display, inherit)",
                      }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          className="p-bk-lg sm:p-bk-xl"
          style={{ color: "var(--bk-ink, #1a1a1a)" }}
        >
          {body ? (
            renderRich(body)
          ) : (
            <p
              className="font-body text-sm italic"
              style={{ color: "var(--bk-ink-faint, rgb(26 26 26 / 0.4))" }}
            >
              {locale === "ar" ? "لا توجد تفاصيل بعد." : "No details yet."}
            </p>
          )}
        </div>
      </BentoCard>
    </Section>
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
