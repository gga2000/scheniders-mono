"use client";

// Express description: the product's long marketing copy collapsed to its
// opening lines under a heading, with a "read more" toggle — the buyer who
// came to order is not made to scroll past two screens of prose to reach
// the reviews, and the buyer who wants it is one tap away from all of it.

import { useId, useState } from "react";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "../helpers/primitives";
import { readsRtl, xs } from "./text";

export function DescriptionBlock({
  text,
  locale,
}: {
  text: string;
  locale: LocaleCode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const rtl = readsRtl(locale);

  return (
    <section className="border-t border-bk-divider pt-bk-md">
      <h2
        className={cn(
          "mb-2 font-bk-display text-lg font-black text-bk-ink",
          rtl ? "text-right" : "text-left",
        )}
      >
        {xs("aboutScent", locale)}
      </h2>
      <p
        id={bodyId}
        dir="auto"
        className={cn(
          "whitespace-pre-line font-bk-body text-sm leading-relaxed text-bk-ink-soft",
          // Fade the clamped tail with a mask, not an overlay colour, so
          // it works on whatever surface the section sits on.
          !open &&
            "line-clamp-5 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]",
        )}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={cn(
          "mt-1 flex min-h-11 w-full items-center justify-start gap-1 font-bk-body text-sm font-bold text-bk-ink",
          rtl && "flex-row-reverse",
        )}
      >
        {xs(open ? "readLess" : "readMore", locale)}
        <MaterialIcon name={open ? "expand_less" : "expand_more"} className="text-lg" />
      </button>
    </section>
  );
}
