"use client";

// =====================================================================
// Client half of `accordion_richtext` — the opt-in `layout: "quiet"` list.
// =====================================================================
// One hairline-ruled list with a single ink chevron per row and panels
// that animate their height (grid rows 0fr → 1fr — native <details>
// cannot). The server file resolves every i18n string, so this island
// receives plain strings and booleans only and imports nothing from it.
// The cards default stays server-only <details> with zero JS.
// =====================================================================

import { useId, useState } from "react";
import { cn } from "@scheniders/shared";
import { MaterialIcon, Section } from "./helpers/primitives";

export interface QuietItem {
  title: string;
  body: string;
}

/** Next open-set after tapping row `i`. Tapping an open row closes it;
 *  otherwise exclusive mode replaces the set, multi mode appends. Pure —
 *  never mutates `open`. */
export function toggleOpen(
  open: readonly number[],
  i: number,
  exclusive: boolean,
): readonly number[] {
  if (open.includes(i)) return open.filter((n) => n !== i);
  return exclusive ? [i] : [...open, i];
}

/** Paragraphs are separated by a blank line; single newlines stay inside
 *  the paragraph (rendered by `whitespace-pre-line`). */
export function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/);
}

export function AccordionRichtextQuiet({
  heading,
  items,
  exclusive,
  rtl,
}: {
  heading: string;
  items: readonly QuietItem[];
  exclusive: boolean;
  rtl: boolean;
}) {
  const [open, setOpen] = useState<readonly number[]>([]);
  const baseId = useId();
  const textSide = rtl ? "text-right" : "text-left";

  return (
    <Section density="dense">
      {heading && (
        <h2
          data-i18n-field="heading_i18n"
          className={cn(
            "mb-bk-sm font-bk-display text-lg font-black text-bk-ink",
            textSide,
          )}
        >
          {heading}
        </h2>
      )}
      <div className="divide-y divide-bk-divider border-y border-bk-divider">
        {items.map((item, i) => {
          const isOpen = open.includes(i);
          const panelId = `${baseId}-p${i}`;
          return (
            <div key={`${i}-${item.title}`}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen((o) => toggleOpen(o, i, exclusive))}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 py-4 text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none",
                  rtl && "flex-row-reverse",
                )}
              >
                <span
                  data-i18n-field={`items[${i}].title_i18n`}
                  className={cn(
                    "flex-1 font-bk-display text-base font-bold leading-snug text-balance",
                    textSide,
                  )}
                >
                  {item.title}
                </span>
                <MaterialIcon
                  name="expand_more"
                  className={cn(
                    "shrink-0 text-xl text-bk-ink transition-transform duration-bk-base ease-out motion-reduce:transition-none",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              <div
                id={panelId}
                className="grid transition-[grid-template-rows] duration-bk-base ease-out motion-reduce:transition-none"
                style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
              >
                <div className="min-h-0 overflow-hidden" inert={!isOpen}>
                  <div
                    data-i18n-field={`items[${i}].body_i18n`}
                    className={cn(
                      "space-y-3 pb-5 transition-opacity duration-bk-base motion-reduce:transition-none",
                      rtl ? "pl-8" : "pr-8",
                      isOpen ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {splitParagraphs(item.body).map((p, j) => (
                      <p
                        key={j}
                        dir="auto"
                        className={cn(
                          "whitespace-pre-line font-bk-body text-[15px] leading-loose text-bk-ink-soft text-pretty",
                          textSide,
                        )}
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
