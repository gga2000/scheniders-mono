// =====================================================================
// Section — promo_banner
// =====================================================================
// Full-width promo announcement. Headline + optional body + optional CTA
// + optional live countdown to an ISO target. Built as a client
// component because the countdown ticks in the browser.
// =====================================================================
// Client half of `promo_banner` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./promo_banner.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import { resolveI18n } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import { BentoCard, ChunkyButton, Section, Sticker } from "./helpers/primitives";
import type { Props } from "./promo_banner";

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

export function PromoBanner({
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
              <p className="mt-bk-2xs font-body text-sm sm:text-base text-bk-ink-soft">
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
                    className="inline-flex items-baseline gap-1 bg-bk-surface-alt/80 border-bk border-bk-ink rounded-bk-input px-2 py-1 text-bk-ink"
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
