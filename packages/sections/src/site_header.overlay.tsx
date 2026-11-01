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
import { useCartBump } from "./helpers/cart-bump";
import { MaterialIcon } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { isOptimizableImageHost } from "./helpers/image";
import { useMenuSheet, type NavLink } from "./site_header.menu";
import { MenuDrawer, type DrawerCategory } from "./site_header.drawer";

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

/** `overlay_cart`: the cart chip. Its own component so only a header that
 *  renders the chip subscribes to the cart's pop. */
function CartChip({
  cart,
  chipClassName,
  onNavigate,
}: {
  cart: { label: string; count: number };
  chipClassName: string;
  onNavigate: () => void;
}) {
  const bumped = useCartBump();
  return (
    <StoreLink
      href="/cart"
      onClick={onNavigate}
      aria-label={cart.label}
      data-header-cart=""
      className={cn(chipClassName, "relative w-11 justify-center")}
    >
      <MaterialIcon name="shopping_bag" className="text-2xl" />
      {cart.count > 0 && (
        // Ink, not yellow: yellow fills stay on the order actions (D4).
        <span
          data-cart-count=""
          className={cn(
            "absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-bk-pill bg-bk-ink px-1 font-bk-body text-xs font-bold tabular-nums text-bk-surface transition-transform duration-bk-fast motion-reduce:transition-none",
            bumped && "scale-125",
          )}
        >
          {cart.count}
        </span>
      )}
    </StoreLink>
  );
}

export function OverlayHeader({
  drawer,
  wordmark,
  logo,
  locale,
  navLinks,
  enabledLocales,
  menuLabel,
  cart = null,
}: {
  /** What the menu drawer lists besides the nav links. */
  drawer: {
    categories: DrawerCategory[];
    whatsappHref: string | null;
    showSearch: boolean;
  };
  wordmark: string;
  logo: string | null;
  locale: LocaleCode;
  navLinks: NavLink[];
  enabledLocales: LocaleCode[];
  menuLabel: string;
  /** `overlay_cart`: the cart chip's name («سلة التسوّق (n)») and the
   *  mounted item count. Null = no chip, today's markup. */
  cart?: { label: string; count: number } | null;
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
  const hasSheet =
    navLinks.length > 0 ||
    enabledLocales.length > 1 ||
    drawer.categories.length > 0 ||
    drawer.whatsappHref !== null ||
    drawer.showSearch;

  const chip = cn(
    "flex h-11 items-center rounded-bk-pill border-bk text-bk-ink transition-[background-color,box-shadow,border-color] duration-bk-base motion-reduce:transition-none",
    glass
      ? "border-bk-surface/60 bg-bk-surface/70 shadow-bk-card backdrop-blur-md"
      : "border-transparent bg-transparent",
  );
  // The menu chip (or its spacer): alone at the right, or after the cart chip.
  const menuToggle = hasSheet ? (
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
  );

  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <div
        ref={barRef}
        className={cn(
          "px-3 pb-2 pt-[max(12px,env(safe-area-inset-top,0px))] transition-[background-color,box-shadow] duration-bk-base motion-reduce:transition-none",
          glass ? "bg-transparent" : "bg-bk-surface shadow-bk-card",
          // The drawer is a positioned `fixed inset-0` layer in this
          // header's stacking context; an unpositioned bar would paint under
          // it (and a tap on the X would land on the drawer). Lift the bar
          // above it while the drawer is open.
          open && "relative z-20",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <StoreLink
            href="/"
            onClick={close}
            aria-label={wordmark}
            className={cn(
              chip,
              "min-w-0 gap-2",
              // The 28px logo circle sits 8px inside the 44px chip top and
              // bottom; matching that inset on its side keeps it concentric
              // with the pill's rounded end instead of floating off it.
              logo ? "pl-4 pr-2" : "px-4",
            )}
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
          {cart ? (
            <div className="flex shrink-0 items-center gap-2">
              <CartChip cart={cart} chipClassName={chip} onNavigate={close} />
              {menuToggle}
            </div>
          ) : (
            menuToggle
          )}
        </div>
      </div>
      {hasSheet && (
        <MenuDrawer
          id={sheetId}
          open={open}
          onClose={close}
          sheetRef={sheetRef}
          locale={locale}
          categories={drawer.categories}
          navLinks={navLinks}
          enabledLocales={enabledLocales}
          whatsappHref={drawer.whatsappHref}
          showSearch={drawer.showSearch}
        />
      )}
    </header>
  );
}
