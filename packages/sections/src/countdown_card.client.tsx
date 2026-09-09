// =====================================================================
// Section — countdown_card
// =====================================================================
// Standalone countdown timer card. No promo copy — just the heading and
// the big ticking digits. After the target ISO passes, swaps in an
// "expired" label (optional). Client component because the timer ticks
// every second in the browser.
// =====================================================================
// Client half of `countdown_card` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./countdown_card.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import { resolveI18n } from "@scheniders/shared";
import { BentoCard, ScribbleHeading, Section } from "./helpers/primitives";
import type { Props } from "./countdown_card";

interface Tick {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function compute(targetIso: string, now: Date): Tick {
  const target = new Date(targetIso).getTime();
  const ms = Math.max(0, target - now.getTime());
  return {
    days: Math.floor(ms / (1000 * 60 * 60 * 24)),
    hours: Math.floor(ms / (1000 * 60 * 60)) % 24,
    minutes: Math.floor(ms / (1000 * 60)) % 60,
    seconds: Math.floor(ms / 1000) % 60,
    done: ms <= 0,
  };
}

export function CountdownCard({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const expired = resolveI18n(props.expired_label_i18n, locale);

  const [tick, setTick] = useState<Tick>(() =>
    compute(props.target_iso, new Date()),
  );

  useEffect(() => {
    setTick(compute(props.target_iso, new Date()));
    const id = setInterval(() => {
      setTick(compute(props.target_iso, new Date()));
    }, 1000);
    return () => clearInterval(id);
  }, [props.target_iso]);

  const labelsEn = ["Days", "Hours", "Mins", "Secs"];
  const labelsAr = ["أيام", "ساعات", "دقائق", "ثوانٍ"];
  const labels = locale !== "en" ? labelsAr : labelsEn;
  const segments = [tick.days, tick.hours, tick.minutes, tick.seconds];

  return (
    <Section>
      <BentoCard bg="lilac" size="md" className="p-bk-lg sm:p-bk-xl">
        <ScribbleHeading color="pink" className="mb-bk-md">
          {heading}
        </ScribbleHeading>
        {tick.done ? (
          <p className="font-display font-black text-2xl uppercase text-bk-ink">
            {expired || (locale !== "en" ? "انتهى" : "Closed")}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-bk-2xs sm:gap-bk-xs max-w-lg">
            {segments.map((value, i) => (
              <div
                key={i}
                className="bg-white border-[3px] border-candy-ink rounded-xl shadow-bento-sm p-bk-sm sm:p-bk-md text-center"
              >
                <div className="font-display font-black text-3xl sm:text-5xl leading-none tabular-nums">
                  {String(value).padStart(2, "0")}
                </div>
                <div className="mt-bk-2xs font-label font-bold text-[10px] sm:text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
                  {labels[i]}
                </div>
              </div>
            ))}
          </div>
        )}
      </BentoCard>
    </Section>
  );
}
