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
import { Stars } from "./helpers/primitives";
import { cn, PRESSABLE } from "./helpers/utils";

export interface StageItem {
  name_i18n: I18nStringValue;
  quote_i18n: I18nStringValue;
  rating?: number;
  context_i18n?: I18nStringValue;
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
  const [motionOk, setMotionOk] = useState(false);
  const total = items.length;

  const go = useCallback(
    (next: number) => setActive(((next % total) + total) % total),
    [total],
  );

  // Resolved once on the client. The progress bar and the crossfade are
  // both driven from it, so a visitor who asked for reduced motion gets a
  // stage that simply does not move rather than one that moves quietly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setMotionOk(!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (held || total < 2 || !motionOk) return;
    const id = window.setInterval(
      () => setActive((i) => (i + 1) % total),
      Math.max(2, rotateSeconds) * 1000,
    );
    return () => window.clearInterval(id);
  }, [held, total, rotateSeconds, motionOk]);

  const item = items[active];
  const name = resolveI18n(item.name_i18n, locale);
  const quote = resolveI18n(item.quote_i18n, locale);
  const context = item.context_i18n
    ? resolveI18n(item.context_i18n, locale)
    : null;

  return (
    <div
      data-testimonial-stage
      className="relative mx-auto max-w-2xl"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <figure
        className="relative overflow-hidden px-7 pb-9 pt-10 text-center sm:px-12 sm:pt-12"
        style={{
          backgroundColor: "var(--bk-surface, #ffffff)",
          borderRadius: "var(--bk-radius-card, 1.5rem)",
          boxShadow:
            "var(--bk-shadow-card, 0 24px 60px -32px rgb(26 26 26 / 0.45))",
        }}
      >
        {/* The same dot grain the product cards carry, so the two sections
            read as one system rather than two visual languages. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(color-mix(in srgb, var(--bk-ink, #1a1a1a) 9%, transparent) 0.8px, transparent 0.9px)",
            backgroundSize: "7px 7px",
          }}
        />

        {/* A watermark, not a glyph sitting in the text. It bleeds off the
            corner so the card feels cropped from something larger. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 select-none font-display leading-none"
          style={{
            insetInlineStart: "-0.5rem",
            fontSize: "11rem",
            color: "color-mix(in srgb, var(--bk-accent, #fbb82e) 26%, transparent)",
            fontFamily: "var(--bk-font-display, inherit)",
          }}
        >
          &ldquo;
        </span>

        <div className="relative z-10 flex flex-col items-center">
          {item.rating != null && (
            <Stars
              value={item.rating}
              size={15}
              className="mb-5"
              label={`${item.rating} / 5`}
            />
          )}

          {/* Keyed so React remounts it on every change, which restarts the
              fade. aria-live so the rotation is announced rather than
              silently swapping text under a screen reader. */}
          <blockquote
            key={active}
            data-stage-quote
            aria-live="polite"
            className={cn(
              "min-h-[8.5rem] font-body text-lg leading-relaxed text-pretty sm:min-h-[7.5rem] sm:text-xl",
              motionOk && "bk-stage-enter",
            )}
            style={{
              color: "var(--bk-ink, #1a1a1a)",
              fontFamily: "var(--bk-font-body, inherit)",
            }}
          >
            {quote}
          </blockquote>

          {/* A hairline between the testimony and who gave it. */}
          <span
            aria-hidden="true"
            className="mt-6 h-px w-10"
            style={{ backgroundColor: "var(--bk-divider, rgb(26 26 26 / 0.18))" }}
          />

          <figcaption className="mt-5 flex flex-col items-center gap-1.5">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-black"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--bk-accent, #fbb82e) 30%, transparent)",
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                  boxShadow:
                    "0 0 0 3px color-mix(in srgb, var(--bk-accent, #fbb82e) 16%, transparent)",
                }}
              >
                {[...name][0] ?? ""}
              </span>
              <span
                data-stage-name
                className="font-display text-sm font-bold"
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {name}
              </span>
            </span>
            {context && (
              <span
                data-stage-context
                className="font-body text-xs"
                style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
              >
                {context}
              </span>
            )}
          </figcaption>
        </div>
      </figure>

      {total > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            data-stage-prev
            aria-label={label("prev", locale)}
            onClick={() => go(active - 1)}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full font-body text-lg leading-none",
              PRESSABLE,
            )}
            style={{
              color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
              border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.15))",
            }}
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
                className={cn(
                  "relative h-2 overflow-hidden rounded-full transition-all duration-300",
                  PRESSABLE,
                )}
                style={{
                  width: i === active ? "1.75rem" : "0.5rem",
                  backgroundColor:
                    i === active
                      ? "var(--bk-divider, rgb(26 26 26 / 0.18))"
                      : "var(--bk-divider, rgb(26 26 26 / 0.18))",
                }}
              >
                {/* The active dot fills over the dwell time, so the stage
                    shows how long it is holding rather than moving without
                    warning. Held or reduced-motion: it just sits full. */}
                {i === active && (
                  <span
                    key={`${active}-${held}`}
                    data-stage-progress
                    className="absolute inset-y-0 start-0 block"
                    style={{
                      backgroundColor: "var(--bk-ink, #1a1a1a)",
                      width: motionOk && !held ? undefined : "100%",
                      animation:
                        motionOk && !held
                          ? `bk-stage-fill ${Math.max(2, rotateSeconds)}s linear forwards`
                          : undefined,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-stage-next
            aria-label={label("next", locale)}
            onClick={() => go(active + 1)}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full font-body text-lg leading-none",
              PRESSABLE,
            )}
            style={{
              color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
              border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.15))",
            }}
          >
            &#8250;
          </button>
        </div>
      )}
    </div>
  );
}
