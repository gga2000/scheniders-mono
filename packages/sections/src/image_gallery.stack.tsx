"use client";

// =====================================================================
// image_gallery — the proof stack's expand/collapse island
// =====================================================================
// The comments are server-rendered, lead and rest alike, so every one is
// in the HTML for crawlers. This island only owns the open state: the
// rest list stays `hidden` until «شوف N تعليقات ثانية» is tapped, and the
// same button then reads «سدّ التعليقات». While collapsed the rest are
// not rendered (`hidden` is display: none), so find-in-page cannot reach
// them until the list is opened. A hidden list's lazy screenshots are not
// fetched until it opens. Labels arrive resolved from the server module.
// =====================================================================

import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./helpers/utils";
import { MaterialIcon } from "./helpers/primitives";

export function ProofStackMore({
  listId,
  moreLabel,
  lessLabel,
  rtl,
  children,
}: {
  listId: string;
  moreLabel: string;
  lessLabel: string;
  rtl: boolean;
  /** The rest of the comments, as <li> rows. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ol
        id={listId}
        data-proof-rest="true"
        hidden={!open}
        className="mt-bk-lg divide-y divide-bk-divider"
      >
        {children}
      </ol>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "mt-bk-lg flex min-h-[52px] w-full items-center gap-3 rounded-bk-pill border-bk border-bk-divider bg-bk-surface-alt p-1.5 font-bk-body text-[15px] font-extrabold text-bk-ink transition-transform duration-bk-fast active:scale-[0.98] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 ring-bk-focus",
          rtl ? "flex-row-reverse pl-4" : "pr-4",
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-bk-pill bg-bk-secondary text-bk-primary"
        >
          <MaterialIcon name={open ? "remove" : "add"} className="text-xl" />
        </span>
        <span className={cn("flex-1", rtl ? "text-right" : "text-left")}>
          {open ? lessLabel : moreLabel}
        </span>
      </button>
    </>
  );
}
