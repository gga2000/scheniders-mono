"use client";

// =====================================================================
// RevealMore — client-side "show more" over server-rendered children.
// The parent (a server component) passes every card as children; only the
// first `initial` render, and each press reveals `step` more. Keeps the
// section itself a server component: the cards are still SSR-authored
// React elements, this wrapper only decides how many are mounted.
// =====================================================================

import * as React from "react";
import { cn } from "./utils";

export function RevealMore({
  initial,
  step,
  label,
  className,
  children,
}: {
  /** Cards mounted on first paint (the section's `query.limit`). */
  initial: number;
  /** Cards revealed per press; defaults to `initial`. */
  step?: number;
  /** Localised button label ("عرض المزيد" / "Show more"). */
  label: string;
  /** Grid classes for the card container. */
  className?: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  const [visible, setVisible] = React.useState(initial);
  const remaining = Math.max(0, items.length - visible);

  return (
    <>
      <div className={className}>{items.slice(0, visible)}</div>
      {remaining > 0 && (
        <div className="mt-bk-lg flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + (step ?? initial))}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2 text-sm font-bold tabular-nums",
              "transition-[transform,box-shadow,opacity] duration-bk-fast motion-reduce:transition-none hover:opacity-90 active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2",
            )}
            style={{
              backgroundColor: "var(--bk-surface, #ffffff)",
              color: "var(--bk-ink, #1a1a1a)",
              fontFamily: "var(--bk-font-body, inherit)",
              boxShadow:
                "var(--bk-shadow-card, 0 4px 16px rgb(26 26 26 / 0.08))",
            }}
          >
            <span className="underline underline-offset-4">{label}</span>
            <span aria-hidden="true">({remaining})</span>
          </button>
        </div>
      )}
    </>
  );
}
