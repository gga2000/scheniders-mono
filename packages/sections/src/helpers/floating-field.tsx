"use client";

// Floating-label wrapper for a form control. The label rests inside the
// box like a placeholder and lifts above it, word by word, once the
// control has focus or a value. CSS-only motion (transform + colour on a
// compositor-friendly path, no animation library) so it stays smooth on
// mid-range phones.
//
// The label is split into WORDS, never letters: splitting Arabic into
// per-letter elements breaks letter joining. Words are `inline-block`, so
// the shaping inside each word is untouched and a script that joins
// letters still reads correctly.

import { useState, type ReactNode } from "react";
import { cn } from "@scheniders/shared";

/** Gap between the first word lifting and each following word. */
const WORD_STAGGER_MS = 35;

export function FloatingField({
  label,
  htmlFor,
  filled,
  rtl,
  alwaysFloat = false,
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
  /** A select with a visible prompt option: the label never rests inside. */
  alwaysFloat?: boolean;
  className?: string;
  /** The control (and any adornment) — position:relative box of the field. */
  children: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const floated = alwaysFloat || focused || filled;
  const words = label.split(/\s+/).filter(Boolean);

  return (
    <div
      data-floated={floated ? "true" : "false"}
      className={cn("group/ff pt-5", className)}
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
            "pointer-events-none absolute z-[1] block max-w-[calc(100%-3.5rem)] whitespace-nowrap font-bk-body text-base font-bold",
            "top-0 leading-[52px]",
            rtl ? "right-4 origin-right" : "left-4 origin-left",
            "transition-transform duration-bk-base ease-out motion-reduce:transition-none",
            floated && "-translate-y-[36px] scale-[0.82]",
          )}
        >
          {words.map((word, i) => (
            <span key={`${i}-${word}`}>
              {i > 0 ? " " : null}
              <span
                style={
                  {
                    "--ff-delay": `${i * WORD_STAGGER_MS}ms`,
                  } as React.CSSProperties
                }
                className={cn(
                  "inline-block transition-[transform,color] duration-bk-base ease-[cubic-bezier(0.34,1.4,0.64,1)] [transition-delay:var(--ff-delay)] motion-reduce:transition-none",
                  "[[data-bk-motion=reduce]_&]:delay-0",
                  floated
                    ? "-translate-y-[2px] text-bk-ink-soft"
                    : "text-bk-ink-faint",
                )}
              >
                {word}
              </span>
            </span>
          ))}
        </label>
      </div>
    </div>
  );
}
