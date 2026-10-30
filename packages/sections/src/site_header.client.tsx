// =====================================================================
// Section — site_header  (global)
// =====================================================================
// Persistent storefront header in the Candy Bento lockup: a circular
// bento menu/back button, a centered butter "logo chip" wordmark, and a
// mint cart pill with a live item count. Lives in globals.header and
// ships by default on every V2 page (see StorefrontGlobals). On sub-pages
// the left control becomes a circular back button; on the home page it is
// the menu toggle that opens the mobile category/nav drawer.
//
// The header also owns the language switcher (P1-6): a segmented control
// in the desktop bar and a row in the mobile menu sheet, fed by the
// store's `enabled_locales` (read off the tenant in ctx) and the runtime
// locale. Single-locale stores render no switcher.
// =====================================================================
// Client half of `site_header` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./site_header.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { BrandMark, MaterialIcon } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { useCart } from "./helpers/cart-store";
import { isOptimizableImageHost } from "./helpers/image";
import { chromeString } from "./helpers/chrome-strings";
import { LocaleSwitch, readEnabledLocales } from "./helpers/locale-switch";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./site_header";
import { OverlayHeader } from "./site_header.overlay";
import { MobileMenuSheet, useMenuSheet, type NavLink } from "./site_header.menu";

/** Circular surface bento control (menu / back). 44px touch target. */
const circleBtn =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
  "transition-transform duration-bk-fast motion-reduce:transition-none hover:scale-105 active:scale-95";
const circleBtnStyle = {
  backgroundColor: "var(--bk-surface, #ffffff)",
  border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
  boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
  color: "var(--bk-ink, #1a1a1a)",
} as const;

export function SiteHeaderRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const sheetId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  useMenuSheet({ open, onClose: close, sheetRef, toggleRef });

  // The cart count comes from a localStorage-persisted store, so it's empty
  // during SSR. Only reveal the count after mount so the server and first
  // client render agree (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const cartCount = useCart((s) => s.getItemCount());
  const count = mounted ? cartCount : 0;

  // Home shows the menu toggle (opens the drawer); every other page shows a
  // circular back control instead, matching the Stitch sub-page chrome.
  const isHome = ctx.runtime.page_id === "home";

  const logo = ctx.tenant.branding?.logo_url ?? null;
  const wordmark = props.wordmark_i18n
    ? resolveI18n(props.wordmark_i18n, locale)
    : ctx.tenant.business_name;

  const navLinks: NavLink[] = props.nav_links.map((l) => ({
    href: l.href,
    label: resolveI18n(l.label_i18n, locale),
  }));

  // Language switcher data: the store's enabled locales come off the tenant
  // row the storefront hands into ctx; the current one is the negotiated
  // runtime locale. Single-locale stores get no control at all.
  const enabledLocales = readEnabledLocales(ctx.tenant);
  const showSwitcher = enabledLocales.length > 1;
  // The mobile sheet exists when there is anything to put in it.
  const hasSheet = navLinks.length > 0 || showSwitcher;

  const menuLabel = chromeString(open ? "close" : "menu", locale);
  const cartLabel = `${chromeString("cart", locale)} (${count})`;
  const searchLabel = chromeString("search", locale);

  // -------------------------------------------------------------------
  // floating_pill — fully-rounded surface bar floating with a margin
  // from the page edges: nav links at inline-start, language + search/cart
  // + the logo-image + wordmark lockup grouped at inline-end. The classic
  // bento lockup below stays byte-identical for existing stores.
  // -------------------------------------------------------------------
  if ((props.layout ?? "bento") === "floating_pill") {
    // `||` (not `??`): an empty-string override must fall back to the
    // tenant's uploaded logo instead of suppressing the image entirely.
    const pillLogo = props.logo_image_url || logo;
    if (props.surface === "overlay") {
      return (
        <OverlayHeader
          wordmark={wordmark}
          logo={pillLogo}
          locale={locale}
          navLinks={navLinks}
          enabledLocales={enabledLocales}
          menuLabel={menuLabel}
          cart={props.show_cart && props.overlay_cart === true ? { label: cartLabel, count } : null}
        />
      );
    }
    const pillIconBtn =
      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
      "transition-opacity duration-bk-fast motion-reduce:transition-none hover:opacity-70 active:opacity-60";

    return (
      <header
        className={cn(
          // Top gap grows by the notch inset so the pill never tucks under
          // the status bar on a viewport-fit=cover phone.
          "w-full z-40 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pt-[calc(1rem+env(safe-area-inset-top,0px))]",
          props.sticky && "sticky top-0",
        )}
      >
        <div
          className="relative z-10 mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 rounded-full px-4 sm:px-7"
          style={{
            backgroundColor: "var(--bk-surface, #ffffff)",
            color: "var(--bk-ink, #1a1a1a)",
            boxShadow:
              "var(--bk-shadow-card, 0 14px 40px -18px rgb(0 0 0 / 0.35))",
          }}
        >
          {/* Inline-start: mobile menu toggle + desktop nav links */}
          <div className="flex min-w-0 items-center gap-1">
            {hasSheet && (
              <button
                ref={toggleRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={menuLabel}
                aria-expanded={open}
                aria-controls={sheetId}
                className={cn(pillIconBtn, "sm:hidden")}
                style={{ color: "var(--bk-ink, #1a1a1a)" }}
              >
                <MaterialIcon
                  name={open ? "close" : "menu"}
                  className="text-2xl"
                />
              </button>
            )}
            <nav className="hidden items-center gap-6 sm:flex">
              {navLinks.map((l) => (
                <StoreLink
                  key={`${l.href}-${l.label}`}
                  href={l.href}
                  className="inline-flex min-h-11 items-center font-body text-sm font-bold transition-opacity duration-bk-fast motion-reduce:transition-none hover:opacity-70 active:opacity-60"
                  style={{ color: "var(--bk-ink, #1a1a1a)" }}
                >
                  {l.label}
                </StoreLink>
              ))}
            </nav>
          </div>

          {/* Inline-end: language, search + cart, then the logo lockup at the edge */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {showSwitcher && (
              <LocaleSwitch
                locales={enabledLocales}
                current={locale}
                variant="pill"
                className="hidden sm:flex"
              />
            )}
            {props.show_search && (
              <StoreLink
                href="/search"
                aria-label={searchLabel}
                className={cn(pillIconBtn, "hidden sm:inline-flex")}
                style={{ color: "var(--bk-ink, #1a1a1a)" }}
              >
                <MaterialIcon name="search" className="text-2xl" />
              </StoreLink>
            )}
            {props.show_cart && (
              <StoreLink
                href="/cart"
                aria-label={cartLabel}
                className={cn(pillIconBtn, "relative")}
                style={{ color: "var(--bk-ink, #1a1a1a)" }}
              >
                <MaterialIcon name="shopping_bag" className="text-2xl" />
                {count > 0 && (
                  <span
                    className="absolute right-0 top-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
                    style={{
                      backgroundColor: "var(--bk-primary, #ffd84a)",
                      color: "var(--bk-ink, #1a1a1a)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </StoreLink>
            )}
            <StoreLink
              href="/"
              onClick={close}
              aria-label={wordmark}
              className="flex min-w-0 items-center gap-2"
            >
              <span
                className="truncate font-display text-xl font-black tracking-tight sm:text-2xl"
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {wordmark}
              </span>
              {pillLogo && (
                <Image
                  src={pillLogo}
                  alt=""
                  width={40}
                  height={40}
                  // Allowlisted hosts get a 40px AVIF/WebP instead of the
                  // full upload (P2-20); arbitrary hosts must stay raw.
                  unoptimized={!isOptimizableImageHost(pillLogo)}
                  sizes="40px"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              )}
            </StoreLink>
          </div>
        </div>

        {/* Mobile nav sheet — a rounded card floating under the pill */}
        {hasSheet && (
          <MobileMenuSheet
            id={sheetId}
            open={open}
            onClose={close}
            sheetRef={sheetRef}
            links={navLinks}
            linkClassName="flex min-h-11 items-center font-body text-sm font-bold transition-opacity duration-bk-fast motion-reduce:transition-none active:opacity-60"
            locale={locale}
            enabledLocales={enabledLocales}
            className="mx-auto mt-2 max-w-6xl px-5 py-1"
            style={{
              borderRadius: "var(--bk-radius-card, 1.5rem)",
              backgroundColor: "var(--bk-surface, #ffffff)",
              color: "var(--bk-ink, #1a1a1a)",
              boxShadow:
                "var(--bk-shadow-card, 0 14px 40px -18px rgb(0 0 0 / 0.35))",
            }}
          />
        )}
      </header>
    );
  }

  return (
    <header
      className={cn(
        "w-full z-40 pt-[env(safe-area-inset-top,0px)]",
        props.sticky && "sticky top-0",
      )}
      style={{
        backgroundColor: "var(--bk-surface, #fff7ed)",
        borderBottom:
          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
        boxShadow: "var(--bk-shadow-card, 0 3px 0 0 rgb(26 26 26 / 0.06))",
      }}
    >
      <div className="relative z-10 mx-auto max-w-6xl px-4 min-h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {/* Left: mobile menu/back + desktop nav */}
        <div className="flex items-center gap-2 justify-self-start min-w-0">
          {isHome ? (
            hasSheet && (
              <button
                ref={toggleRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={menuLabel}
                aria-expanded={open}
                aria-controls={sheetId}
                className={cn(circleBtn, "sm:hidden")}
                style={circleBtnStyle}
              >
                <MaterialIcon
                  name={open ? "close" : "menu"}
                  className="text-2xl"
                />
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  window.history.length > 1
                ) {
                  window.history.back();
                }
              }}
              aria-label={chromeString("back", locale)}
              className={cn(circleBtn, "sm:hidden")}
              style={circleBtnStyle}
            >
              <MaterialIcon name="arrow_back" className="text-2xl" />
            </button>
          )}

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-6">
            {navLinks.map((l) => (
              <StoreLink
                key={`${l.href}-${l.label}`}
                href={l.href}
                className="group relative inline-flex min-h-11 items-center font-label font-bold text-sm bk-caps tracking-wide transition-[color,opacity] duration-bk-fast motion-reduce:transition-none hover:text-[var(--bk-primary,#ff5a8a)] active:opacity-60"
                style={{ color: "var(--bk-ink, #1a1a1a)" }}
              >
                {l.label}
                <span
                  aria-hidden="true"
                  className="absolute bottom-2 left-0 h-[var(--bk-border-thickness,3px)] w-0 transition-[width] duration-bk-base motion-reduce:transition-none group-hover:w-full"
                  style={{ backgroundColor: "var(--bk-primary, #ff5a8a)" }}
                />
              </StoreLink>
            ))}
          </nav>
        </div>

        {/* Center: wordmark logo chip */}
        <StoreLink
          href="/"
          className="justify-self-center min-w-0 max-w-[60vw] sm:max-w-none"
          onClick={close}
          aria-label={wordmark}
        >
          <BrandMark
            logoUrl={logo}
            name={wordmark}
            size="md"
            variant={props.wordmark_style ?? "pill"}
          />
        </StoreLink>

        {/* Right: language (desktop) + search (desktop) + cart pill */}
        <div className="flex items-center gap-2 justify-self-end">
          {showSwitcher && (
            <LocaleSwitch
              locales={enabledLocales}
              current={locale}
              variant="pill"
              className="hidden sm:flex"
            />
          )}
          {props.show_search && (
            <StoreLink
              href="/search"
              aria-label={searchLabel}
              className={cn(circleBtn, "hidden sm:inline-flex")}
              style={circleBtnStyle}
            >
              <MaterialIcon name="search" className="text-2xl" />
            </StoreLink>
          )}
          {props.show_cart && (
            <StoreLink
              href="/cart"
              aria-label={cartLabel}
              className="inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 transition-transform duration-bk-fast motion-reduce:transition-none hover:scale-105 active:scale-95"
              style={{
                backgroundColor: "var(--bk-decor-a, #7cf0bd)",
                color: "var(--bk-on-decor, #1a1a1a)",
                border:
                  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
              }}
            >
              <MaterialIcon name="shopping_bag" className="text-xl" />
              <span className="font-display font-black text-sm tabular-nums">
                {count}
              </span>
            </StoreLink>
          )}
        </div>
      </div>

      {/* Mobile nav drawer (home only) */}
      {isHome && hasSheet && (
        <MobileMenuSheet
          id={sheetId}
          open={open}
          onClose={close}
          sheetRef={sheetRef}
          links={navLinks}
          linkClassName="flex min-h-11 items-center font-label font-bold text-sm bk-caps tracking-wide transition-opacity duration-bk-fast motion-reduce:transition-none active:opacity-60"
          locale={locale}
          enabledLocales={enabledLocales}
          className="mx-auto max-w-6xl px-4 py-2"
          style={{
            backgroundColor: "var(--bk-surface, #fff7ed)",
            color: "var(--bk-ink, #1a1a1a)",
            borderBottom:
              "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
          }}
        />
      )}
    </header>
  );
}
