// =====================================================================
// <ActionRow> / <ActionPill> — one quiet tinted row ending in one action
// =====================================================================
// The product page's lower sections close on a way to reach a person: the
// quiet policy accordion's call row (tap to call) and the compact FAQ's
// WhatsApp row. Both are this row, so they read as one family with the
// express buy box (rounded-bk-card, bg-bk-surface-alt, ink pill). No hooks
// and no "use client": the server FAQ and the client accordion island both
// render it. Arabic flips the visual order with classes — never `dir`.
// =====================================================================

import type { ReactNode } from "react";
import { cn } from "@scheniders/shared";

export function ActionRow({
  kind,
  rtl,
  children,
  action,
}: {
  /** Marks the row for tests and the editor overlay. */
  kind: "call" | "whatsapp";
  rtl: boolean;
  /** The row's text block (one or two short lines). */
  children: ReactNode;
  /** The row's single action, an `<ActionPill>`. */
  action: ReactNode;
}) {
  return (
    <div
      data-action-row={kind}
      className={cn(
        "mt-bk-sm flex items-center gap-3 rounded-bk-card bg-bk-surface-alt px-4 py-3",
        rtl && "flex-row-reverse",
      )}
    >
      <div className={cn("min-w-0 flex-1", rtl ? "text-right" : "text-left")}>{children}</div>
      {action}
    </div>
  );
}

export function ActionPill({
  href,
  external,
  rtl,
  icon,
  label,
  labelField,
}: {
  href: string;
  /** Opens in a new tab (WhatsApp). A `tel:` link stays in place. */
  external: boolean;
  rtl: boolean;
  icon: ReactNode;
  label: string;
  /** The merchant field the label comes from, for the editor overlay. */
  labelField: string;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-bk-pill border-bk border-bk-ink bg-bk-surface px-4 font-bk-display text-sm font-black text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none",
        rtl && "flex-row-reverse",
      )}
    >
      {icon}
      <span data-i18n-field={labelField}>{label}</span>
    </a>
  );
}
