// =====================================================================
// Soft commerce building blocks — the cart, checkout and thank-you pages
// in the redesigned PDP's voice (slice 1h, `style: "soft"`)
// =====================================================================
// The express product page draws money as a quiet receipt (hairline card,
// dashed dividers, ink figures, the total at 22px/900) and its one order
// action as a token-radius yellow button with the token button shadow and
// no ink outline (1f, I14). These are those pieces for the sections that
// opt in, so the path PDP → cart → checkout → thank-you reads as one page.
// Colour lock (D4): yellow fills only the order action; prices, totals and
// "free" are ink; green is the WhatsApp glyph only. Rows flip with
// `flex-row-reverse` from `readsRtl`, never `dir`.
// =====================================================================

import type { ReactNode } from "react";
import { MaterialIcon, WhatsAppIcon } from "./primitives";
import { cn } from "./utils";

/** The receipt card: a hairline on the page surface, no fill, no shadow. */
export const SOFT_RECEIPT = "rounded-bk-card border-bk border-bk-divider bg-bk-surface text-bk-ink";

/** A raised soft card (the form, an empty state): the alt surface, no line. */
export const SOFT_CARD = "rounded-bk-card bg-bk-surface-alt text-bk-ink";

/** A form field, as the express form draws it (min height, so a textarea
 *  can grow). */
export const SOFT_FIELD =
  "min-h-[52px] w-full rounded-bk-input border-bk border-bk-divider bg-bk-surface px-4 py-3 font-bk-body text-base text-bk-ink placeholder:text-bk-ink-faint transition-colors duration-bk-fast focus-visible:border-bk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus aria-[invalid=true]:border-bk-danger motion-reduce:transition-none";

/** A field label, as the express form draws it. */
export const SOFT_LABEL = "mb-1 block font-bk-body text-[13px] font-bold text-bk-ink-soft";

/** The order action: the express submit's look (token radius + token
 *  shadow, no ink outline), full width, ≥60px. */
export const SOFT_PRIMARY =
  "flex min-h-[60px] w-full items-center justify-center gap-3 rounded-bk-input bg-bk-primary px-5 text-bk-on-primary shadow-bk-button transition-[transform,background-color,box-shadow] duration-bk-fast hover:bg-bk-primary-hover active:scale-[0.97] active:bg-bk-primary-active active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bk-surface disabled:cursor-not-allowed disabled:bg-bk-primary-disabled disabled:shadow-none motion-reduce:transition-none";

/** The order action's content: the label at 19px/900, an optional small
 *  line under it, and the arrow chip on the reading end. */
export function SoftPrimaryBody({
  label,
  labelField,
  sub,
  rtl,
  busy = false,
}: {
  label: string;
  /** `data-i18n-field` for a merchant label (on the label, not the button,
   *  so the storefront's plaintext bidi rule never reaches the row). */
  labelField?: string;
  sub?: ReactNode;
  rtl: boolean;
  busy?: boolean;
}) {
  return (
    <span className={cn("flex w-full items-center justify-center gap-3", rtl && "flex-row-reverse")}>
      <span className="flex min-w-0 flex-col items-center leading-tight">
        <span className="font-bk-display text-[19px] font-black" data-i18n-field={labelField}>
          {label}
        </span>
        {sub ? <span className="font-bk-body text-[13px] font-bold tabular-nums text-bk-on-primary/80">{sub}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-bk-pill bg-bk-on-primary/15"
      >
        <MaterialIcon
          name={busy ? "progress_activity" : rtl ? "arrow_back" : "arrow_forward"}
          className={cn("text-xl", busy && "animate-spin motion-reduce:animate-none")}
        />
      </span>
    </span>
  );
}

/** Ordering on WhatsApp instead: the express page's soft green tile, as a
 *  full-width row. Green is the glyph only; the label is ink. */
export function SoftWhatsappLink({
  href,
  label,
  rtl,
}: {
  href: string;
  label: string;
  rtl: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-soft-whatsapp=""
      className={cn(
        "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-bk-input border-bk border-bk-success/25 bg-bk-success/10 px-4 font-bk-body text-[15px] font-bold text-bk-ink transition-[transform,background-color] duration-bk-fast hover:bg-bk-success/15 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus motion-reduce:transition-none",
        rtl && "flex-row-reverse",
      )}
    >
      <WhatsAppIcon shadow={false} className="h-6 w-6 text-bk-success" />
      {label}
    </a>
  );
}

/** One receipt row: label (+ a quiet note) at the reading start, the value
 *  at the far end; `strong` is the total (15px label, 22px/900 figure). */
export function ReceiptRow({
  rtl,
  label,
  note,
  value,
  strong = false,
}: {
  rtl: boolean;
  label: string;
  note?: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        strong ? "py-3" : "py-2",
        rtl && "flex-row-reverse",
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-baseline gap-1.5 font-bk-body",
          rtl && "flex-row-reverse",
          strong ? "text-[15px] font-black text-bk-ink" : "text-[13px] text-bk-ink-soft",
        )}
      >
        <span>{label}</span>
        {note ? <bdi className="shrink-0 text-xs text-bk-ink-faint tabular-nums">{note}</bdi> : null}
      </span>
      <span
        className={cn(
          "shrink-0 whitespace-nowrap tabular-nums",
          strong
            ? "font-bk-display text-[22px] font-black leading-none text-bk-ink"
            : "font-bk-body text-[13px] font-bold text-bk-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
