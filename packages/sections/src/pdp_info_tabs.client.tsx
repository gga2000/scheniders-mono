// =====================================================================
// Section — pdp_info_tabs
// =====================================================================
// Tabbed content panel for the PDP. Default tabs are
// Description / Specs / Shipping / Returns, each with its own i18n rich
// body. Reads runtime.product so the Description tab can fall back to
// product.description when no override is set.
// =====================================================================
// Client half of `pdp_info_tabs` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./pdp_info_tabs.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useState } from "react";
import { resolveI18n } from "@scheniders/shared";
import { BentoCard, Section } from "./helpers/primitives";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./pdp_info_tabs";

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

export function PdpInfoTabsRender({
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
          className="flex gap-bk-2xs overflow-x-auto bg-bk-surface p-bk-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                        backgroundColor: "var(--bk-surface-alt, #ffffff)",
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
              {locale !== "en" ? "لا توجد تفاصيل بعد." : "No details yet."}
            </p>
          )}
        </div>
      </BentoCard>
    </Section>
  );
}
