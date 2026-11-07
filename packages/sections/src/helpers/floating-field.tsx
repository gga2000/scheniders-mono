"use client";

// Floating-label wrapper for a form control. The label rests inside the
// box like a placeholder; once the control has focus or a value its
// letters spring up above the box one after another (a staggered wave)
// while the whole label eases down to caption size, and a focus line
// draws across the bottom of the box. Leaving an empty field plays the
// wave in reverse: the last letter drops first.
//
// Motion is CSS only (transform + colour, compositor-friendly, no
// animation library) so it stays smooth on mid-range phones. The letter
// spring is a sampled damped spring (stiffness 170, damping 19, mass 1:
// a soft settle with ~3% overshoot) expressed as a CSS `linear()` easing;
// browsers without `linear()` drop the inline declaration and fall back to
// the default ease.
//
// Arabic: every letter is its own inline-block, which on its own would
// shape each one as an isolated letter. Each letter that joins a
// neighbour carries a zero-width joiner on that side, so the shaper still
// picks its initial/medial/final form and the word reads joined while the
// letters move independently. See `splitLetters`.

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@scheniders/shared";

/** Gap between one letter lifting and the next... */
const LETTER_STAGGER_MS = 24;
/** ...shortened on long labels so the whole wave stays inside this window. */
const STAGGER_WINDOW_MS = 320;
/** Damped spring, stiffness 170 / damping 19 / mass 1, sampled over the
 *  900ms it takes to settle (the `duration-[900ms]` on each letter). */
const SPRING_EASE =
  "linear(0, 0.0372, 0.1285, 0.2486, 0.3791, 0.5074, 0.6254, 0.7283, 0.8144, 0.8834, 0.9365, 0.9755, 1.0027, 1.0202, 1.0303, 1.0347, 1.0352, 1.033, 1.0294, 1.0249, 1.0203, 1.0158, 1.0119, 1.0084, 1.0056, 1.0034, 1.0017, 1.0005, 0.9996, 0.9991, 0.9989, 0.9988, 0.9988, 0.9989, 0.999, 0.9992, 0.9993, 0.9995, 0.9996, 0.9997, 1)";
/** The floated label's size relative to its resting size. */
const CAPTION_SCALE = 0.86;
/** How far a letter rises, in the label's own (scaled) units, so the
 *  caption's centre lands 12px above the box. */
const LIFT_PX = Math.round(38 / CAPTION_SCALE);

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
  const words = label.split(/\s+/).filter(Boolean).map(splitLetters);
  const count = words.reduce((n, w) => n + w.length, 0);
  const stagger = Math.min(
    LETTER_STAGGER_MS,
    STAGGER_WINDOW_MS / Math.max(count - 1, 1),
  );
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
        {/* Focus line: draws across the bottom of the box from the label's
            side while the control has focus. */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-3 bottom-0 z-[1] h-[2px] rounded-full bg-bk-ink",
            "transition-transform duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            rtl ? "origin-right" : "origin-left",
            focused ? "scale-x-100" : "scale-x-0",
          )}
        />
        <label
          htmlFor={htmlFor}
          dir={rtl ? "rtl" : "ltr"}
          className={cn(
            "pointer-events-none absolute top-0 z-[1] block max-w-[calc(100%-3.5rem)] whitespace-nowrap font-bk-body text-[15px] font-bold leading-[52px]",
            rtl ? "right-4 origin-right" : "left-4 origin-left",
            "transition-transform duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          )}
          style={{ transform: floated ? `scale(${CAPTION_SCALE})` : undefined }}
        >
          {/* Screen readers get the label as one plain string; the moving
              letters (with their joiners) are visual only. */}
          <span className="sr-only">{label}</span>
          {words.map((letters, w) => (
            <span key={`${w}-${letters.join("")}`} aria-hidden="true">
              {w > 0 ? " " : null}
              <span className="inline-block">
                {letters.map((letter, l) => {
                  const i = letterIndex++;
                  // Up: first letter leads. Down: last letter leads.
                  const order = floated ? i : count - 1 - i;
                  return (
                    <span
                      key={l}
                      style={
                        {
                          "--ff-delay": `${Math.round(order * stagger)}ms`,
                          transitionTimingFunction: SPRING_EASE,
                          transform: floated
                            ? `translateY(-${LIFT_PX}px)`
                            : undefined,
                        } as CSSProperties
                      }
                      className={cn(
                        "inline-block will-change-transform motion-reduce:transition-none",
                        "transition-[transform,color] [transition-delay:var(--ff-delay)]",
                        "duration-[900ms]",
                        "[[data-bk-motion=reduce]_&]:delay-0",
                        floated ? "text-bk-ink-soft" : "text-bk-ink-faint",
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
