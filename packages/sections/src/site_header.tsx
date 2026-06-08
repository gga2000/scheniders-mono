// =====================================================================
// Section — site_header  (global)
// =====================================================================
// Persistent storefront header: wordmark / logo, primary nav, and the
// search + cart actions (cart shows a live item-count badge). Lives in
// globals.header. Rendered by default on every V2 page when a tenant has
// not configured one (see StorefrontGlobals). Mobile collapses the nav
// into a toggle panel; the search + cart actions stay visible.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
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
  /** Override the store name shown as the wordmark (defaults to business_name). */
  wordmark_i18n: i18nStringOptional,
  nav_links: z.array(navLinkSchema),
  show_search: z.boolean(),
  show_cart: z.boolean(),
  /** Stick to the top of the viewport on scroll. */
  sticky: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  nav_links: [
    { label_i18n: { ar: "الرئيسية", en: "Home" }, href: "/" },
    { label_i18n: { ar: "المنتجات", en: "Shop" }, href: "/products" },
    { label_i18n: { ar: "تتبّع الطلب", en: "Track order" }, href: "/track" },
  ],
  show_search: true,
  show_cart: true,
  sticky: true,
};

const iconBtn =
  "inline-flex h-10 w-10 items-center justify-center rounded-[var(--bk-radius-input,0.75rem)] " +
  "text-[var(--bk-ink,#1a1a1a)] hover:bg-candy-cream transition-colors";

function SiteHeaderRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const t = locale === "ar";
  const [open, setOpen] = useState(false);

  // The cart count comes from a localStorage-persisted store, so it's empty
  // during SSR. Only reveal the count after mount so the server and first
  // client render agree (no hydration mismatch), regardless of the store's
  // hydration strategy.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const cartCount = useCart((s) => s.getItemCount());
  const count = mounted ? cartCount : 0;

  const logo = ctx.tenant.branding?.logo_url ?? null;
  const wordmark = props.wordmark_i18n
    ? resolveI18n(props.wordmark_i18n, locale)
    : ctx.tenant.business_name;

  const navLinks = props.nav_links.map((l) => ({
    href: l.href,
    label: resolveI18n(l.label_i18n, locale),
  }));

  const Wordmark = (
    <StoreLink
      href="/"
      className="flex items-center gap-2 min-w-0"
      onClick={() => setOpen(false)}
    >
      <BrandMark logoUrl={logo} name={wordmark} size="md" />
    </StoreLink>
  );

  return (
    <header
      className={cn("w-full z-40", props.sticky && "sticky top-0")}
      style={{
        backgroundColor: "var(--bk-surface, #ffffff)",
        borderBottom:
          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 min-h-16 flex items-center justify-between gap-3">
        {/* Left: mobile toggle + wordmark */}
        <div className="flex items-center gap-1 min-w-0">
          {navLinks.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={t ? "القائمة" : "Menu"}
              aria-expanded={open}
              className={cn(iconBtn, "sm:hidden")}
            >
              <MaterialIcon name={open ? "close" : "menu"} className="text-2xl" />
            </button>
          )}
          {Wordmark}
        </div>

        {/* Center: desktop nav */}
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

        {/* Right: search + cart */}
        <div className="flex items-center gap-0.5">
          {props.show_search && (
            <StoreLink
              href="/search"
              aria-label={t ? "بحث" : "Search"}
              className={iconBtn}
            >
              <MaterialIcon name="search" className="text-2xl" />
            </StoreLink>
          )}
          {props.show_cart && (
            <StoreLink
              href="/cart"
              aria-label={t ? "سلة التسوّق" : "Cart"}
              className={cn(iconBtn, "relative")}
            >
              <MaterialIcon name="shopping_bag" className="text-2xl" />
              {count > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-5 items-center justify-center px-1 font-display font-black text-[11px] leading-none text-white"
                  style={{
                    backgroundColor: "var(--bk-primary, #ff5a8a)",
                    border: "2px solid var(--bk-ink, #1a1a1a)",
                    borderRadius: "9999px",
                  }}
                >
                  {count}
                </span>
              )}
            </StoreLink>
          )}
        </div>
      </div>

      {/* Mobile nav panel */}
      {open && navLinks.length > 0 && (
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
