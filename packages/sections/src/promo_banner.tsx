// =====================================================================
// Section — promo_banner
// =====================================================================
// Full-width promo announcement. Headline + optional body + optional CTA
// + optional live countdown to an ISO target. Built as a client
// component because the countdown ticks in the browser.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import {
  BentoCard,
  ChunkyButton,
  Section,
  Sticker,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const bannerBg = z.enum([
  "white",
  "mint",
  "butter",
  "lilac",
  "sky",
  "pink",
  "cream",
]);

const schema = z.object({
  heading_i18n: i18nStringSchema,
  body_i18n: i18nStringOptional,
  cta_label_i18n: i18nStringOptional,
  cta_href: z.string().optional(),
  countdown_to_iso: z.string().optional(),
  bg: bannerBg,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Mid-season sale — 30% off", ar: "تخفيض منتصف الموسم — 30٪" },
  body_i18n: {
    en: "Site-wide. No code needed. Cash on delivery as always.",
    ar: "خصم على كل الموقع. لا حاجة لكود. الدفع عند الاستلام كالعادة.",
  },
  cta_label_i18n: { en: "Shop the sale", ar: "تسوّق التخفيض" },
  cta_href: "/products?sort=sale",
  countdown_to_iso: undefined,
  bg: "pink",
};

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function computeCountdown(targetIso: string, now: Date): Countdown {
  const target = new Date(targetIso).getTime();
  const ms = Math.max(0, target - now.getTime());
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return { days, hours, minutes, seconds, done: ms <= 0 };
}

function PromoBanner({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const body = resolveI18n(props.body_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);

  const [tick, setTick] = useState<Countdown | null>(() =>
    props.countdown_to_iso
      ? computeCountdown(props.countdown_to_iso, new Date())
      : null,
  );

  useEffect(() => {
    if (!props.countdown_to_iso) return;
    setTick(computeCountdown(props.countdown_to_iso, new Date()));
    const id = setInterval(() => {
      setTick(computeCountdown(props.countdown_to_iso as string, new Date()));
    }, 1000);
    return () => clearInterval(id);
  }, [props.countdown_to_iso]);

  return (
    <Section bleed className="px-4">
      <BentoCard bg={props.bg} size="md" className="p-bk-lg sm:p-bk-xl relative overflow-hidden">
        <div className="absolute -top-2 -right-2">
          <Sticker bg="white" rotate={6} size="xs">
            ✱ promo
          </Sticker>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] items-center gap-bk-sm">
          <div className="max-w-2xl">
            <h2 className="font-display font-black text-bk-h2 uppercase tracking-tight leading-tight">
              {heading}
            </h2>
            {body && (
              <p className="mt-bk-2xs font-body text-sm sm:text-base opacity-75">
                {body}
              </p>
            )}
            {tick && !tick.done && (
              <div className="mt-bk-sm flex items-center gap-bk-2xs font-label font-bold text-xs sm:text-sm uppercase tracking-[0.18em]">
                {[
                  { v: tick.days, l: locale !== "en" ? "ي" : "d" },
                  { v: tick.hours, l: locale !== "en" ? "س" : "h" },
                  { v: tick.minutes, l: locale !== "en" ? "د" : "m" },
                  { v: tick.seconds, l: locale !== "en" ? "ث" : "s" },
                ].map((seg, i) => (
                  <span
                    key={i}
                    className="inline-flex items-baseline gap-1 bg-bk-surface-alt/80 border-bk-bold border-bk-ink rounded-lg px-2 py-1 text-bk-ink"
                  >
                    <span className="font-display font-black text-base sm:text-lg">
                      {String(seg.v).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] opacity-70">{seg.l}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          {ctaLabel && props.cta_href && (
            <div>
              <StoreLink href={props.cta_href} aria-label={ctaLabel}>
                <ChunkyButton bg="white" size="lg">
                  {ctaLabel}
                </ChunkyButton>
              </StoreLink>
            </div>
          )}
        </div>
      </BentoCard>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "promo_banner",
  category: "conversion",
  name: { en: "Promo banner", ar: "بانر عرض" },
  description: {
    en: "Full-width promo announcement with optional CTA and live countdown.",
    ar: "بانر عرض كبير مع زر اختياري وعدّاد تنازلي مباشر.",
  },
  thumbnail: "/sections/promo_banner.svg",
  valid_on: ["home", "category", "product"],
  schema,
  defaultProps,
  render: PromoBanner,
};

registerSection(definition);
export default definition;
