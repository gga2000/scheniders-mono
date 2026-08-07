// =====================================================================
// Section — site_header  (global)
// =====================================================================
// Persistent storefront header in the Candy Bento lockup: a circular
// bento menu/back button, a centered butter "logo chip" wordmark, and a
// mint cart pill with a live item count. Lives in globals.header and
// ships by default on every V2 page (see StorefrontGlobals). On sub-pages
// the left control becomes a circular back button; on the home page it is
// the menu toggle that opens the mobile category/nav drawer.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { BrandMark, MaterialIcon } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { useCart } from "./helpers/cart-store";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const navLinkSchema = z.object({
  label_i18n: i18nStringSchema,
  href: z.string(),
});

const schema = z.object({
  /** Header lockup: "bento" = classic Candy Bento bar (default, unchanged
   *  for existing stores); "floating_pill" = fully-rounded surface pill
   *  floating with a margin from the page edges. */
  layout: z.enum(["bento", "floating_pill"]).optional(),
  /** Override the store name shown as the wordmark (defaults to business_name). */
  wordmark_i18n: i18nStringOptional,
  /** "pill" = butter logo chip (default); "plain" = square + wordmark. */
  wordmark_style: z.enum(["pill", "plain"]).optional(),
  /** Logo image for the floating_pill lockup (falls back to tenant branding). */
  logo_image_url: z.string().optional(),
  nav_links: z.array(navLinkSchema),
  show_search: z.boolean(),
  show_cart: z.boolean(),
  /** Stick to the top of the viewport on scroll. */
  sticky: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  wordmark_style: "pill",
  nav_links: [
    { label_i18n: { ar: "الرئيسية", en: "Home" }, href: "/" },
    { label_i18n: { ar: "المنتجات", en: "Shop" }, href: "/products" },
    { label_i18n: { ar: "تتبّع الطلب", en: "Track order" }, href: "/track" },
  ],
  show_search: true,
  show_cart: true,
  sticky: true,
};

/** Circular white bento control (menu / back). 44px touch target. */
const circleBtn =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white " +
  "transition-transform hover:scale-105 active:scale-95";
const circleBtnStyle = {
  border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
  boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
  color: "var(--bk-ink, #1a1a1a)",
} as const;

function SiteHeaderRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const [open, setOpen] = useState(false);

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

  const navLinks = props.nav_links.map((l) => ({
    href: l.href,
    label: resolveI18n(l.label_i18n, locale),
  }));

  // -------------------------------------------------------------------
  // floating_pill — fully-rounded surface bar floating with a margin
  // from the page edges: nav links at inline-start, search/cart + the
  // logo-image + wordmark lockup grouped at inline-end. The classic
  // bento lockup below stays byte-identical for existing stores.
  // -------------------------------------------------------------------
  if ((props.layout ?? "bento") === "floating_pill") {
    const pillLogo = props.logo_image_url ?? logo;
    const pillIconBtn =
      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
      "transition-opacity hover:opacity-70 active:opacity-60";

    return (
      <header
        className={cn(
          "w-full z-40 px-3 pt-3 sm:px-6 sm:pt-4",
          props.sticky && "sticky top-0",
        )}
      >
        <div
          className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 rounded-full px-4 sm:px-7"
          style={{
            backgroundColor: "var(--bk-surface, #ffffff)",
            color: "var(--bk-ink, #1a1a1a)",
            boxShadow: "0 14px 40px -18px rgb(0 0 0 / 0.35)",
          }}
        >
          {/* Inline-start: mobile menu toggle + desktop nav links */}
          <div className="flex min-w-0 items-center gap-1">
            {navLinks.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={t ? "القائمة" : "Menu"}
                aria-expanded={open}
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
                  className="font-body text-sm font-bold transition-opacity hover:opacity-70"
                  style={{ color: "var(--bk-ink, #1a1a1a)" }}
                >
                  {l.label}
                </StoreLink>
              ))}
            </nav>
          </div>

          {/* Inline-end: search + cart, then the logo lockup at the edge */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {props.show_search && (
              <StoreLink
                href="/search"
                aria-label={t ? "بحث" : "Search"}
                className={cn(pillIconBtn, "hidden sm:inline-flex")}
                style={{ color: "var(--bk-ink, #1a1a1a)" }}
              >
                <MaterialIcon name="search" className="text-2xl" />
              </StoreLink>
            )}
            {props.show_cart && (
              <StoreLink
                href="/cart"
                aria-label={t ? `سلة التسوّق (${count})` : `Cart (${count})`}
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
              onClick={() => setOpen(false)}
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
                  unoptimized
                  sizes="40px"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              )}
            </StoreLink>
          </div>
        </div>

        {/* Mobile nav sheet — a rounded card floating under the pill */}
        {open && navLinks.length > 0 && (
          <nav
            className="mx-auto mt-2 max-w-6xl rounded-3xl px-5 py-1 sm:hidden"
            style={{
              backgroundColor: "var(--bk-surface, #ffffff)",
              color: "var(--bk-ink, #1a1a1a)",
              boxShadow: "0 14px 40px -18px rgb(0 0 0 / 0.35)",
            }}
          >
            <ul>
              {navLinks.map((l) => (
                <li
                  key={`m-${l.href}-${l.label}`}
                  className="border-b border-black/5 last:border-0"
                >
                  <StoreLink
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block py-3 font-body text-sm font-bold"
                    style={{ color: "var(--bk-ink, #1a1a1a)" }}
                  >
                    {l.label}
                  </StoreLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
    );
  }

  return (
    <header
      className={cn("w-full z-40", props.sticky && "sticky top-0")}
      style={{
        backgroundColor: "var(--bk-surface, #fff7ed)",
        borderBottom:
          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
        boxShadow: "0 3px 0 0 rgb(26 26 26 / 0.06)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 min-h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {/* Left: mobile menu/back + desktop nav */}
        <div className="flex items-center gap-2 justify-self-start min-w-0">
          {isHome ? (
            navLinks.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={t ? "القائمة" : "Menu"}
                aria-expanded={open}
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
                if (typeof window !== "undefined" && window.history.length > 1) {
                  window.history.back();
                }
              }}
              aria-label={t ? "رجوع" : "Back"}
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
                className="group relative font-label font-bold text-sm uppercase tracking-wide transition-colors hover:text-[var(--bk-primary,#ff5a8a)]"
                style={{ color: "var(--bk-ink, #1a1a1a)" }}
              >
                {l.label}
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1 left-0 h-[var(--bk-border-thickness,3px)] w-0 transition-all duration-200 group-hover:w-full"
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
          onClick={() => setOpen(false)}
          aria-label={wordmark}
        >
          <BrandMark
            logoUrl={logo}
            name={wordmark}
            size="md"
            variant={props.wordmark_style ?? "pill"}
          />
        </StoreLink>

        {/* Right: search (desktop) + cart pill */}
        <div className="flex items-center gap-2 justify-self-end">
          {props.show_search && (
            <StoreLink
              href="/search"
              aria-label={t ? "بحث" : "Search"}
              className={cn(circleBtn, "hidden sm:inline-flex")}
              style={circleBtnStyle}
            >
              <MaterialIcon name="search" className="text-2xl" />
            </StoreLink>
          )}
          {props.show_cart && (
            <StoreLink
              href="/cart"
              aria-label={
                t ? `سلة التسوّق (${count})` : `Cart (${count})`
              }
              className="inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 transition-transform hover:scale-105 active:scale-95"
              style={{
                backgroundColor: "var(--bk-mint, #7cf0bd)",
                color: "var(--bk-ink, #1a1a1a)",
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
      {open && isHome && navLinks.length > 0 && (
        <nav
          className="sm:hidden"
          style={{
            backgroundColor: "var(--bk-surface, #fff7ed)",
            borderBottom:
              "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
          }}
        >
          <ul className="mx-auto max-w-6xl px-4 py-2">
            {navLinks.map((l) => (
              <li key={`m-${l.href}-${l.label}`}>
                <StoreLink
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block py-3 font-label font-bold text-sm uppercase tracking-wide border-b border-candy-ink/10 last:border-0"
                  style={{ color: "var(--bk-ink, #1a1a1a)" }}
                >
                  {l.label}
                </StoreLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

const definition: SectionDefinition<Props> = {
  type: "site_header",
  category: "page",
  name: { en: "Site header", ar: "ترويسة المتجر" },
  description: {
    en: "Persistent header: logo / store name, nav, search and cart.",
    ar: "ترويسة ثابتة: الشعار أو اسم المتجر، التنقّل، البحث والسلة.",
  },
  thumbnail: "/sections/site_header.svg",
  // Global section — lives in globals.header, never placed on a page.
  valid_on: [],
  schema,
  defaultProps,
  render: SiteHeaderRender,
};

registerSection(definition);
export default definition;
