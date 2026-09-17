"use client";
// =====================================================================
// testimonial_cards — the rotating stage
// =====================================================================
// One testimony at a time, large enough to actually be read, advancing on
// its own. The static band shows three at once and asks a shopper to pick
// which to read; a stage shows one and reads it to them.
//
// Rotation stops on hover, on focus, and for anyone who has asked their
// system for reduced motion — an auto-advancing quote that cannot be held
// still is unreadable to a slow reader, which is the opposite of the job.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import type { I18nStringValue } from "./_schema";
import { cn, PRESSABLE } from "./helpers/utils";

export interface StageItem {
  name_i18n: I18nStringValue;
  quote_i18n: I18nStringValue;
}

const LABELS = {
  prev: { ar: "السابق", en: "Previous" },
  next: { ar: "التالي", en: "Next" },
  goTo: { ar: "رأي رقم", en: "Testimonial" },
} as const;

function label(key: keyof typeof LABELS, locale: LocaleCode): string {
  return LABELS[key][locale === "en" ? "en" : "ar"];
}

export function TestimonialStage({
  items,
  locale,
  rotateSeconds = 6,
}: {
  items: StageItem[];
  locale: LocaleCode;
  rotateSeconds?: number;
}) {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const total = items.length;

  const go = useCallback(
    (next: number) => setActive(((next % total) + total) % total),
    [total],
  );

  // A ref, not the state value, so the interval is installed once per
  // pause rather than torn down and rebuilt on every tick — a rebuilt
  // interval restarts its countdown and the last slide lingers.
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (held || total < 2) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(
      () => setActive((i) => (i + 1) % total),
      Math.max(2, rotateSeconds) * 1000,
    );
    return () => window.clearInterval(id);
  }, [held, total, rotateSeconds]);

  const item = items[active];
  const name = resolveI18n(item.name_i18n, locale);
  const quote = resolveI18n(item.quote_i18n, locale);

  return (
    <div
      data-testimonial-stage
      className="relative mx-auto max-w-3xl"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <figure
        className="relative flex flex-col items-center px-6 pb-8 pt-12 text-center sm:px-12"
        style={{
          backgroundColor: "var(--bk-surface, #ffffff)",
          borderRadius: "var(--bk-radius-card, 1.5rem)",
          boxShadow: "var(--bk-shadow-card, 0 18px 48px -24px rgb(26 26 26 / 0.35))",
        }}
      >
        {/* The quote mark is the section's one ornament. Decorative, so it
            is hidden from assistive tech rather than read as a character. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-3 select-none font-display text-[5rem] leading-none"
          style={{
            color: "color-mix(in srgb, var(--bk-accent, #fbb82e) 42%, transparent)",
            fontFamily: "var(--bk-font-display, inherit)",
          }}
        >
          &ldquo;
        </span>

        {/* aria-live so the rotation is announced rather than silently
            swapping text under a reader. */}
        <blockquote
          data-stage-quote
          aria-live="polite"
          className="relative z-10 min-h-[7.5rem] font-body text-lg leading-relaxed text-pretty sm:min-h-[6.5rem] sm:text-xl"
          style={{
            color: "var(--bk-ink, #1a1a1a)",
            fontFamily: "var(--bk-font-body, inherit)",
          }}
        >
          {quote}
        </blockquote>

        <figcaption className="mt-5 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-black"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--bk-accent, #fbb82e) 35%, transparent)",
              color: "var(--bk-ink, #1a1a1a)",
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
            {[...name][0] ?? ""}
          </span>
          <span
            data-stage-name
            className="font-body text-sm font-semibold"
            style={{
              color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
              fontFamily: "var(--bk-font-body, inherit)",
            }}
          >
            {name}
          </span>
        </figcaption>
      </figure>

      {total > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            data-stage-prev
            aria-label={label("prev", locale)}
            onClick={() => go(active - 1)}
            className={cn("px-2 font-body text-lg leading-none", PRESSABLE)}
            style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
          >
            &#8249;
          </button>
          <div className="flex items-center gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                data-stage-dot
                aria-label={`${label("goTo", locale)} ${i + 1}`}
                aria-current={i === active}
                onClick={() => go(i)}
                className={cn("h-2 rounded-full transition-all", PRESSABLE)}
                style={{
                  width: i === active ? "1.25rem" : "0.5rem",
                  backgroundColor:
                    i === active
                      ? "var(--bk-ink, #1a1a1a)"
                      : "var(--bk-divider, rgb(26 26 26 / 0.18))",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            data-stage-next
            aria-label={label("next", locale)}
            onClick={() => go(active + 1)}
            className={cn("px-2 font-body text-lg leading-none", PRESSABLE)}
            style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
          >
            &#8250;
          </button>
        </div>
      )}
    </div>
  );
}
