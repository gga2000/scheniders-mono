// =====================================================================
// BottomSheet — a native <dialog> that rises from the bottom edge
// =====================================================================
// Built in-package on purpose: @scheniders/sections does not depend on
// @scheniders/ui, and pulling Radix into the storefront bundle for one
// sheet is not worth it. The pattern is the one pdp_gallery's ZoomDialog
// and image_gallery's viewer already ship:
//   - `showModal()` gives the focus trap and Escape (the native `close`
//     event syncs our state);
//   - a click on the backdrop (the dialog element itself) closes;
//   - page scroll is locked while open;
//   - focus returns to the button that opened it.
// The sheet owns its trigger button, so it always knows where focus goes
// back. The rise-in animation is `motion-safe:` only, so a reduced-motion
// shopper gets the sheet without movement.
// =====================================================================

"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon } from "./primitives";
import { readsRtl } from "./reading";
import { cn } from "./utils";

export function BottomSheet({
  trigger,
  triggerClassName,
  title,
  closeLabel,
  locale,
  children,
  className,
}: {
  /** Content of the button that opens the sheet. */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Sheet heading; also the dialog's accessible name. */
  title: ReactNode;
  /** Accessible name of the close button (a chrome string, resolved). */
  closeLabel: string;
  locale: LocaleCode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const rtl = readsRtl(locale);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
    if (dialog.open) dialog.close();
    return undefined;
  }, [open]);

  // Runs twice on a button or backdrop close: here, then again from the
  // native close event once the effect closes the dialog. The second focus
  // is the one that lands — a modal dialog keeps the page inert until it is
  // actually closed.
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className={cn(
          "m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-bk-card bg-bk-surface p-0 text-bk-ink backdrop:bg-bk-ink/60",
          "motion-safe:animate-[bk-fade-up_var(--bk-duration-base)_ease-out_both]",
          className,
        )}
      >
        <div className="px-4 pb-6 pt-3">
          <div
            className={cn(
              "flex items-center justify-between gap-3",
              rtl && "flex-row-reverse",
            )}
          >
            <h2
              id={titleId}
              className={cn(
                "font-bk-display text-base font-black",
                rtl ? "text-right" : "text-left",
              )}
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={closeLabel}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-bk-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
            >
              <MaterialIcon name="close" />
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      </dialog>
    </>
  );
}
