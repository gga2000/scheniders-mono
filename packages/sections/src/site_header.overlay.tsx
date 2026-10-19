"use client";

// =====================================================================
// site_header — overlay surface (floating_pill only)
// =====================================================================
// The header takes no flow space and floats over the page's full-bleed
// hero as two glass chips: the wordmark at the left, the menu at the
// right. A hero marks its bottom edge with [data-pdp-hero-end]; once that
// edge scrolls up under the chips the bar turns solid so it never sits
// as bare chips over the form. A page with no hero mark renders solid.
// With the instance's `sticky` off, the chips simply scroll away with the
// hero — the header is part of the photo, not a bar.
// =====================================================================

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { MaterialIcon } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { isOptimizableImageHost } from "./helpers/image";
import { MobileMenuSheet, useMenuSheet, type NavLink } from "./site_header.menu";

const HERO_END_SELECTOR = "[data-pdp-hero-end]";

/** "glass" while the hero sits under the chips, "solid" after it. */
function useOverHero(barRef: React.RefObject<HTMLDivElement | null>): boolean {
  const [overHero, setOverHero] = useState(true);
  useEffect(() => {
    const sentinel = document.querySelector(HERO_END_SELECTOR);
    const bar = barRef.current;
    if (!sentinel || !bar) {
      setOverHero(false);
      return;
    }
    // The hero counts as "under the chips" until its bottom edge passes
    // the bar's bottom edge, so shrink the root by the bar's height.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Still visible under the bar, or not yet scrolled into view.
        const below =
          entry.rootBounds !== null &&
          entry.boundingClientRect.top >= entry.rootBounds.bottom;
        setOverHero(entry.isIntersecting || below);
      },
      { rootMargin: `-${Math.round(bar.offsetHeight)}px 0px 0px 0px` },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [barRef]);
  return overHero;
}

export function OverlayHeader({
  wordmark,
  logo,
  locale,
  navLinks,
  enabledLocales,
  menuLabel,
}: {
  wordmark: string;
  logo: string | null;
  locale: LocaleCode;
  navLinks: NavLink[];
  enabledLocales: LocaleCode[];
  menuLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const sheetId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  useMenuSheet({ open, onClose: close, sheetRef, toggleRef });
  const overHero = useOverHero(barRef);
  const glass = overHero && !open;
  const hasSheet = navLinks.length > 0 || enabledLocales.length > 1;

  const chip = cn(
    "flex h-11 items-center rounded-bk-pill border-bk text-bk-ink transition-[background-color,box-shadow,border-color] duration-bk-base motion-reduce:transition-none",
    glass
      ? "border-bk-surface/60 bg-bk-surface/70 shadow-bk-card backdrop-blur-md"
      : "border-transparent bg-transparent",
  );

  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <div
        ref={barRef}
        className={cn(
          "px-3 pb-2 pt-[max(12px,env(safe-area-inset-top,0px))] transition-[background-color,box-shadow] duration-bk-base motion-reduce:transition-none",
          glass ? "bg-transparent" : "bg-bk-surface shadow-bk-card",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <StoreLink
            href="/"
            onClick={close}
            aria-label={wordmark}
            className={cn(chip, "min-w-0 gap-2 px-4")}
          >
            <span
              translate="no"
              className="truncate font-bk-display text-base font-black tracking-tight"
            >
              {wordmark}
            </span>
            {logo && (
              <Image
                src={logo}
                alt=""
                width={28}
                height={28}
                unoptimized={!isOptimizableImageHost(logo)}
                sizes="28px"
                className="h-7 w-7 shrink-0 rounded-bk-pill object-cover"
              />
            )}
          </StoreLink>
          {hasSheet ? (
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={menuLabel}
              aria-expanded={open}
              aria-controls={sheetId}
              className={cn(chip, "w-11 justify-center")}
            >
              <MaterialIcon name={open ? "close" : "menu"} className="text-2xl" />
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      </div>
      {hasSheet && (
        <MobileMenuSheet
          id={sheetId}
          open={open}
          onClose={close}
          sheetRef={sheetRef}
          links={navLinks}
          linkClassName="flex min-h-11 items-center font-bk-body text-sm font-bold transition-opacity duration-bk-fast motion-reduce:transition-none active:opacity-60"
          locale={locale}
          enabledLocales={enabledLocales}
          className="mx-3 mt-1 rounded-bk-card bg-bk-surface px-5 py-1 text-bk-ink shadow-bk-card"
        />
      )}
    </header>
  );
}
