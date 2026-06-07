// =====================================================================
// Section — exit_intent_offer
// =====================================================================
// Modal triggered when the mouse leaves the viewport (or after a fallback
// delay on mobile, where mouseleave isn't reliable). Shows a single
// offer card with heading + body + CTA + optional discount code. The
// shopper can copy the code with one tap. Suppressed via `sessionStorage`
// once dismissed so it doesn't reappear on every page in the same
// session.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
  MaterialIcon,
  ScribbleHeading,
} from "./helpers/primitives";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  body_i18n: i18nStringSchema,
  cta_label_i18n: i18nStringSchema,
  cta_href: z.string(),
  discount_code: z.string().optional(),
  triggered_after_seconds: z.number().int().nonnegative(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Wait! Take 10% off", ar: "انتظر! خصم 10٪ لك" },
  body_i18n: {
    en: "Use this code at checkout — valid for the next 24 hours.",
    ar: "استخدم هذا الكود عند الدفع — صالح لمدة 24 ساعة.",
  },
  cta_label_i18n: { en: "Claim my discount", ar: "اطلب الخصم" },
  cta_href: "/products",
  discount_code: "SAVE10",
  triggered_after_seconds: 30,
};

const SUPPRESS_KEY = "schn:exit_intent:dismissed";

function ExitIntentOfferRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const body = resolveI18n(props.body_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SUPPRESS_KEY) === "1") return;

    let armed = false;
    const armTimer = window.setTimeout(
      () => {
        armed = true;
      },
      Math.max(0, props.triggered_after_seconds) * 1000,
    );

    function trigger() {
      if (!armed) return;
      setOpen(true);
    }

    function onMouseLeave(e: MouseEvent) {
      // Only top-edge exits — avoids triggering on link-clicks within page.
      if (e.clientY <= 0) trigger();
    }

    // Mobile fallback — fire after the configured delay if the page has
    // any scroll activity (proxy for intent to leave).
    let mobileTimer: number | undefined;
    function onScrollOnce() {
      if (mobileTimer) window.clearTimeout(mobileTimer);
      mobileTimer = window.setTimeout(trigger, 8_000);
    }

    document.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("scroll", onScrollOnce, { passive: true });

    return () => {
      window.clearTimeout(armTimer);
      if (mobileTimer) window.clearTimeout(mobileTimer);
      document.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("scroll", onScrollOnce);
    };
  }, [props.triggered_after_seconds]);

  function dismiss() {
    setOpen(false);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(SUPPRESS_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }

  async function copyCode() {
    if (!props.discount_code) return;
    try {
      await navigator.clipboard.writeText(props.discount_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-intent-heading"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md"
      >
        <BentoCard bg="butter" size="md" className="p-6 relative">
          <button
            type="button"
            onClick={dismiss}
            aria-label={locale === "ar" ? "إغلاق" : "Close"}
            className="absolute top-3 right-3 w-9 h-9 rounded-xl border-[3px] border-candy-ink bg-white flex items-center justify-center"
          >
            <MaterialIcon name="close" />
          </button>
          <div id="exit-intent-heading">
            <ScribbleHeading color="pink" className="mb-3">
              {heading}
            </ScribbleHeading>
          </div>
          <p className="font-body text-base text-candy-ink/85 mb-4">{body}</p>
          {props.discount_code && (
            <button
              type="button"
              onClick={copyCode}
              className="w-full mb-4 rounded-xl border-[3px] border-dashed border-candy-ink bg-white px-4 py-3 text-center font-display font-black text-2xl uppercase tracking-widest"
              aria-label={
                locale === "ar"
                  ? `انسخ الكود ${props.discount_code}`
                  : `Copy code ${props.discount_code}`
              }
            >
              {props.discount_code}
              <span className="ml-2 font-label font-bold text-xs text-candy-ink/60 normal-case">
                {copied
                  ? locale === "ar"
                    ? "تم النسخ"
                    : "Copied"
                  : locale === "ar"
                    ? "اضغط للنسخ"
                    : "Tap to copy"}
              </span>
            </button>
          )}
          <a href={props.cta_href} onClick={dismiss}>
            <ChunkyButton bg="pink" size="lg" fullWidth>
              {ctaLabel}
            </ChunkyButton>
          </a>
        </BentoCard>
      </div>
    </div>
  );
}

const definition: SectionDefinition<Props> = {
  type: "exit_intent_offer",
  category: "conversion",
  name: { en: "Exit-intent offer", ar: "عرض عند المغادرة" },
  description: {
    en: "Modal triggered on exit intent with offer card and copy-code button.",
    ar: "نافذة تظهر عند نية المغادرة مع عرض وزر نسخ الكود.",
  },
  thumbnail: "/sections/exit_intent_offer.svg",
  valid_on: ["home", "product", "category"],
  schema,
  defaultProps,
  render: ExitIntentOfferRender,
};

registerSection(definition);
export default definition;
