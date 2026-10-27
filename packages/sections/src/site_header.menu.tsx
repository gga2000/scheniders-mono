"use client";

// Mobile menu sheet + its dialog behaviour, shared by every site_header
// surface (bento, floating_pill, overlay).

import { useEffect } from "react";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { StoreLink } from "./helpers/store-context";
import { chromeString } from "./helpers/chrome-strings";
import { LocaleSwitch } from "./helpers/locale-switch";

/** Brand-ink hairline used between rows in the mobile sheet. */
const sheetDivider =
  "color-mix(in srgb, var(--bk-ink, #1a1a1a) 10%, transparent)";

export interface NavLink {
  href: string;
  label: string;
}

/**
 * Dialog behaviour for the mobile menu sheet (P2-20): body scroll locked
 * while open, Escape closes, focus moves to the first item on open and
 * returns to the toggle on close. `onClose` must be referentially stable
 * (a `useCallback` around the state setter) so the effect doesn't re-run
 * — and re-focus — on every parent render.
 */
export function useMenuSheet({
  open,
  onClose,
  sheetRef,
  toggleRef,
}: {
  open: boolean;
  onClose: () => void;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  toggleRef: React.RefObject<HTMLButtonElement | null>;
}) {
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      toggleRef.current?.focus();
    };
  }, [open, onClose, sheetRef, toggleRef]);
}

/**
 * The mobile nav sheet shared by both lockups: a modal dialog with a
 * click-to-close backdrop, the nav links, and the language row beneath
 * them. The caller supplies the surface styling (`className` / `style`)
 * so each lockup keeps its own look.
 *
 * Bento and floating_pill show inline nav from `sm` up, so their sheet is
 * phone-only (`sm:hidden`). The overlay surface has no inline nav at any
 * width — its toggle is the only way in — so it passes `allWidths` to keep
 * the sheet and backdrop visible past `sm` (otherwise the toggle locks
 * scroll behind an invisible dialog).
 */
export function MobileMenuSheet({
  id,
  open,
  onClose,
  sheetRef,
  links,
  linkClassName,
  locale,
  enabledLocales,
  className,
  style,
  allWidths = false,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  links: NavLink[];
  linkClassName: string;
  locale: LocaleCode;
  enabledLocales: LocaleCode[];
  className?: string;
  style?: React.CSSProperties;
  allWidths?: boolean;
}) {
  if (!open) return null;
  return (
    <>
      {/* Backdrop — click anywhere outside the sheet to close. Decorative
          for AT (the dialog is modal; Escape is the keyboard path). */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={allWidths ? "fixed inset-0 z-0" : "fixed inset-0 z-0 sm:hidden"}
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--bk-ink, #1a1a1a) 20%, transparent)",
        }}
      />
      <div
        id={id}
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={chromeString("menu", locale)}
        className={cn(allWidths ? "relative z-10" : "relative z-10 sm:hidden", className)}
        style={style}
      >
        <ul>
          {links.map((l) => (
            <li
              key={`m-${l.href}-${l.label}`}
              className="border-b last:border-0"
              style={{ borderColor: sheetDivider }}
            >
              <StoreLink
                href={l.href}
                onClick={onClose}
                className={linkClassName}
                style={{ color: "var(--bk-ink, #1a1a1a)" }}
              >
                {l.label}
              </StoreLink>
            </li>
          ))}
        </ul>
        {enabledLocales.length > 1 && (
          <div className="border-t py-2" style={{ borderColor: sheetDivider }}>
            <LocaleSwitch
              locales={enabledLocales}
              current={locale}
              variant="row"
            />
          </div>
        )}
      </div>
    </>
  );
}

