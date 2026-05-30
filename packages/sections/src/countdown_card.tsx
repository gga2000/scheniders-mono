// =====================================================================
// Section — countdown_card
// =====================================================================
// Standalone countdown timer card. No promo copy — just the heading and
// the big ticking digits. After the target ISO passes, swaps in an
// "expired" label (optional). Client component because the timer ticks
// every second in the browser.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ScribbleHeading,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  target_iso: z.string().describe("datetime"),
  expired_label_i18n: i18nStringOptional,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Drop closes in", ar: "ينتهي العرض خلال" },
  target_iso: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
  expired_label_i18n: { en: "This drop has closed.", ar: "انتهى هذا العرض." },
};

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

function CountdownCard({
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
  const labels = locale === "ar" ? labelsAr : labelsEn;
  const segments = [tick.days, tick.hours, tick.minutes, tick.seconds];

  return (
    <section className="px-4 py-8">
      <BentoCard bg="lilac" size="md" className="p-6 sm:p-8">
        <ScribbleHeading color="pink" className="mb-5">
          {heading}
        </ScribbleHeading>
        {tick.done ? (
          <p className="font-display font-black text-2xl uppercase text-candy-ink">
            {expired || (locale === "ar" ? "انتهى" : "Closed")}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-lg">
            {segments.map((value, i) => (
              <div
                key={i}
                className="bg-white border-[3px] border-candy-ink rounded-xl shadow-bento-sm p-3 sm:p-4 text-center"
              >
                <div className="font-display font-black text-3xl sm:text-5xl leading-none tabular-nums">
                  {String(value).padStart(2, "0")}
                </div>
                <div className="mt-1 font-label font-bold text-[10px] sm:text-xs uppercase tracking-[0.2em] text-candy-ink/70">
                  {labels[i]}
                </div>
              </div>
            ))}
          </div>
        )}
      </BentoCard>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "countdown_card",
  category: "conversion",
  name: { en: "Countdown card", ar: "بطاقة عدّاد تنازلي" },
  description: {
    en: "Standalone live countdown timer with optional expired label.",
    ar: "عدّاد تنازلي مباشر مستقل مع نص انتهاء اختياري.",
  },
  thumbnail: "/sections/countdown_card.svg",
  valid_on: ["home", "product", "cart"],
  schema,
  defaultProps,
  render: CountdownCard,
};

registerSection(definition);
export default definition;
