"use client";

// Floating-label wrapper for a form control. The label rests inside the
// box like a placeholder; once the control has focus or a value its
// letters spring up above the box one after another (a staggered wave),
// and fall back the same way when the field is emptied and left.
//
// Motion is CSS only (transform + colour, compositor-friendly, no
// animation library) so it stays smooth on mid-range phones. The spring is
// a sampled damped spring (stiffness 300, damping 20, mass 1) expressed as
// a CSS `linear()` easing; browsers without `linear()` drop the inline
// declaration and fall back to the default ease.
//
// Arabic: every letter is its own inline-block, which on its own would
// shape each one as an isolated letter. Each letter that joins a
// neighbour carries a zero-width joiner on that side, so the shaper still
// picks its initial/medial/final form and the word reads joined while the
// letters move independently. See `splitLetters`.

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@scheniders/shared";

/** Gap between one letter lifting and the next. */
const LETTER_STAGGER_MS = 28;
/** Damped spring, stiffness 300 / damping 20 / mass 1, sampled over the
 *  600ms it takes to settle (the `duration-[600ms]` on each letter). */
const SPRING_EASE =
  "linear(0, 0.079, 0.26, 0.478, 0.686, 0.857, 0.982, 1.061, 1.099, 1.108, 1.098, 1.078, 1.054, 1.032, 1.014, 1.001, 0.993, 0.989, 0.988, 0.99, 0.992, 0.994, 0.997, 0.999, 1)";

const ZWJ = "‍";
const ARABIC_LETTER = /^\p{Script=Arabic}/u;
const ARABIC_MARK = /^\p{M}/u;
/** Arabic-script letters that join the letter before them but never the
 *  one after (alef forms, dal, thal, ra, zain, waw forms, teh marbuta and
 *  the Kurdish/Persian variants); hamza joins neither side. */
const JOINS_RIGHT_ONLY = new Set([..."اأإآٱدذرزژڕوؤۆۇۈۋةە"]);
const NON_JOINING = new Set(["ء"]);

function joinsNext(g: string): boolean {
  const base = g[0] ?? "";
  return (
    ARABIC_LETTER.test(base) &&
    !JOINS_RIGHT_ONLY.has(base) &&
    !NON_JOINING.has(base)
  );
}

function joinsPrev(g: string): boolean {
  const base = g[0] ?? "";
  return (
    ARABIC_LETTER.test(base) &&
    !ARABIC_MARK.test(base) &&
    !NON_JOINING.has(base)
  );
}

function graphemes(word: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(word), (s) => s.segment);
  }
  return Array.from(word);
}

/** One word as its letters (grapheme clusters, so harakat stay on their
 *  letter), each padded with zero-width joiners on the sides where it
 *  connects to its neighbour in the word. */
export function splitLetters(word: string): string[] {
  const gs = graphemes(word);
  return gs.map((g, i) => {
    const prev = gs[i - 1];
    const next = gs[i + 1];
    const before =
      prev !== undefined && joinsNext(prev) && joinsPrev(g) ? ZWJ : "";
    const after =
      next !== undefined && joinsNext(g) && joinsPrev(next) ? ZWJ : "";
    return `${before}${g}${after}`;
  });
}

export function FloatingField({
  label,
  htmlFor,
  filled,
  rtl,
  className,
  children,
}: {
  /** The visible label, already translated. */
  label: string;
  /** Id of the control inside, so a tap on the label reaches it. */
  htmlFor: string;
  /** True while the control holds a value. */
  filled: boolean;
  /** The label starts at the right edge in right-to-left locales. */
  rtl: boolean;
  className?: string;
  /** The control (and any adornment) — the field's box. */
  children: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const floated = focused || filled;
  const words = label.split(/\s+/).filter(Boolean);
  let letterIndex = 0;

  return (
    <div
      data-floated={floated ? "true" : "false"}
      className={cn("pt-6", className)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div
        className={cn(
          "relative",
          // At rest the label owns the box, so the control's own hint text
          // (placeholder, select prompt) stays out of its way.
          !floated &&
            "[&_input]:placeholder:text-transparent [&_textarea]:placeholder:text-transparent [&_select]:text-transparent",
        )}
      >
        {children}
        <label
          htmlFor={htmlFor}
          dir={rtl ? "rtl" : "ltr"}
          className={cn(
            "pointer-events-none absolute top-0 z-[1] block max-w-[calc(100%-3.5rem)] whitespace-nowrap font-bk-body text-[15px] font-bold leading-[52px]",
            rtl ? "right-4" : "left-4",
          )}
        >
          {/* Screen readers get the label as one plain string; the moving
              letters (with their joiners) are visual only. */}
          <span className="sr-only">{label}</span>
          {words.map((word, w) => (
            <span key={`${w}-${word}`} aria-hidden="true">
              {w > 0 ? " " : null}
              <span className="inline-block">
                {splitLetters(word).map((letter, l) => {
                  const i = letterIndex++;
                  return (
                    <span
                      key={l}
                      style={
                        {
                          "--ff-delay": `${i * LETTER_STAGGER_MS}ms`,
                          transitionTimingFunction: SPRING_EASE,
                        } as CSSProperties
                      }
                      className={cn(
                        "inline-block will-change-transform motion-reduce:transition-none",
                        "transition-[transform,color] [transition-delay:var(--ff-delay)]",
                        "duration-[600ms]",
                        "[[data-bk-motion=reduce]_&]:delay-0",
                        floated
                          ? "-translate-y-[38px] text-bk-ink-soft"
                          : "translate-y-0 text-bk-ink-faint",
                      )}
                    >
                      {letter}
                    </span>
                  );
                })}
              </span>
            </span>
          ))}
        </label>
      </div>
    </div>
  );
}
