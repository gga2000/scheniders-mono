"use client";

// =====================================================================
// site_header — the overlay surface's menu drawer
// =====================================================================
// A full-height sheet that grows out of the menu chip (a circular reveal
// anchored on the chip's corner, so the menu visibly comes from the button
// the shopper pressed). Inside, in the order a shopper reaches for them:
//
//   1. search — the fastest way to a perfume they already know by name
//   2. the shop's drawer categories as an editorial list: the category
//      name set large, its live count, and a round photo of a perfume in it
//   3. the merchant's own nav links, quiet
//   4. the two service actions: track an order, message on WhatsApp
//
// Brand yellow is not used: it means "buy" everywhere else in the store.
// The document stays LTR in every locale and nothing in the store sets
// `dir`; Arabic rows sit against the right edge by visual-order classes
// (`flex-row-reverse`, `text-right`), as the rest of the header does.
// =====================================================================

import Image from "next/image";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "./helpers/utils";
import { MaterialIcon } from "./helpers/primitives";
import { StoreLink, useStoreBase } from "./helpers/store-context";
import { isOptimizableImageHost } from "./helpers/image";
import { chromeString } from "./helpers/chrome-strings";
import { LocaleSwitch } from "./helpers/locale-switch";
import { readsRtl } from "./helpers/reading";
import { formatCount } from "./helpers/format";
import type { NavLink } from "./site_header.menu";

/** One category row in the drawer, already resolved for the locale. */
export interface DrawerCategory {
  id: string;
  href: string;
  label: string;
  count: number;
  /** The category's own image, else a perfume from it; null = initial. */
  image: string | null;
}

const COPY = {
  search: { ar: "دوّر على عطر", en: "Find a perfume" },
  shop: { ar: "تسوّق", en: "Shop" },
  track: { ar: "تتبّع طلبك", en: "Track your order" },
  whatsapp: { ar: "كلّمنا واتساب", en: "WhatsApp us" },
} as const;

function copy(key: keyof typeof COPY, locale: LocaleCode): string {
  return COPY[key][locale === "en" ? "en" : "ar"];
}

function countLabel(n: number, locale: LocaleCode): string {
  return formatCount(n, locale, {
    one: locale === "en" ? "1 perfume" : "عطر واحد",
    two: locale === "en" ? "2 perfumes" : "عطران",
    few: locale === "en" ? "{count} perfumes" : "{count} عطور",
    many: locale === "en" ? "{count} perfumes" : "{count} عطراً",
    other: locale === "en" ? "{count} perfumes" : "{count} عطر",
  });
}

/** Rows fade up one after another; capped so a long list never waits. */
function stagger(index: number): React.CSSProperties {
  return { animationDelay: `${Math.min(index, 8) * 40 + 80}ms` };
}

const ROW_ENTER =
  "motion-safe:animate-[bk-drawer-row_420ms_cubic-bezier(0.2,0.7,0.2,1)_both]";

export function MenuDrawer({
  id,
  open,
  onClose,
  sheetRef,
  locale,
  categories,
  navLinks,
  enabledLocales,
  whatsappHref,
  showSearch,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  locale: LocaleCode;
  categories: DrawerCategory[];
  navLinks: NavLink[];
  enabledLocales: LocaleCode[];
  /** `https://wa.me/…`, or null when the store has no plausible number. */
  whatsappHref: string | null;
  showSearch: boolean;
}) {
  const base = useStoreBase();
  if (!open) return null;
  const rtl = readsRtl(locale);
  /** Row direction: Arabic starts at the right edge. */
  const flow = rtl ? "flex-row-reverse" : "flex-row";
  const align = rtl ? "text-right" : "text-left";
  let row = 0;

  return (
    <div
      id={id}
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label={chromeString("menu", locale)}
      data-menu-drawer=""
      className={cn(
        "fixed inset-0 z-10 flex flex-col overflow-y-auto overscroll-contain bg-bk-surface text-bk-ink",
        // Space for the bar that stays above the sheet (wordmark + close).
        "pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-[calc(4.5rem+env(safe-area-inset-top,0px))]",
        // Circular reveal from the menu chip's corner; a plain fade when
        // the shopper asked for less motion.
        "motion-safe:animate-[bk-drawer-open_520ms_cubic-bezier(0.2,0.7,0.2,1)_both]",
        "motion-reduce:animate-[bk-drawer-fade_160ms_ease-out_both]",
      )}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-7 px-5">
        {showSearch && (
          <form
            action={`${base}/search`}
            method="get"
            role="search"
            className={ROW_ENTER}
            style={stagger(row++)}
          >
            <label className={cn("flex h-14 items-center gap-3 rounded-bk-pill border border-bk-ink/15 bg-bk-surface-alt px-5 focus-within:border-bk-ink/40", flow)}>
              <MaterialIcon name="search" className="text-2xl text-bk-ink-soft" />
              <input
                type="search"
                name="q"
                inputMode="search"
                enterKeyHint="search"
                placeholder={copy("search", locale)}
                aria-label={copy("search", locale)}
                className={cn("min-w-0 flex-1 bg-transparent font-bk-body text-base text-bk-ink outline-none placeholder:text-bk-ink-soft", align)}
              />
            </label>
          </form>
        )}

        {categories.length > 0 && (
          <nav aria-label={copy("shop", locale)}>
            <p
              className={cn("mb-1 font-bk-body text-xs font-bold tracking-wide text-bk-ink-soft", align, ROW_ENTER)}
              style={stagger(row++)}
            >
              {copy("shop", locale)}
            </p>
            <ul>
              {categories.map((c) => (
                <li
                  key={c.id}
                  className={cn("border-b border-bk-ink/10 last:border-0", ROW_ENTER)}
                  style={stagger(row++)}
                >
                  <StoreLink
                    href={c.href}
                    onClick={onClose}
                    data-drawer-category=""
                    className={cn("group flex min-h-[4.5rem] items-center gap-4 py-2", flow)}
                  >
                    <span className={cn("flex min-w-0 flex-1 flex-col", align)}>
                      <span className="truncate font-bk-display text-2xl font-black leading-tight tracking-tight transition-transform duration-bk-base group-active:translate-x-0.5 motion-reduce:transition-none">
                        {c.label}
                      </span>
                      <span className="font-bk-body text-sm tabular-nums text-bk-ink-soft">
                        {countLabel(c.count, locale)}
                      </span>
                    </span>
                    {c.image ? (
                      <Image
                        src={c.image}
                        alt=""
                        width={56}
                        height={56}
                        sizes="56px"
                        unoptimized={!isOptimizableImageHost(c.image)}
                        className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-bk-ink/10 transition-transform duration-bk-base group-hover:scale-105 motion-reduce:transition-none"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-bk-surface-alt font-bk-display text-xl font-black text-bk-ink-soft"
                      >
                        {c.label.trim().charAt(0)}
                      </span>
                    )}
                  </StoreLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {navLinks.length > 0 && (
          <ul
            className={cn("flex flex-wrap", flow, ROW_ENTER)}
            style={stagger(row++)}
          >
            {navLinks.map((l) => (
              <li key={`${l.href}-${l.label}`} className={cn("w-1/2", align)}>
                <StoreLink
                  href={l.href}
                  onClick={onClose}
                  className="block py-2.5 font-bk-body text-base font-semibold text-bk-ink transition-opacity duration-bk-fast active:opacity-60 motion-reduce:transition-none"
                >
                  {l.label}
                </StoreLink>
              </li>
            ))}
          </ul>
        )}

        <div
          className={cn("mt-auto flex flex-col gap-3", ROW_ENTER)}
          style={stagger(row++)}
        >
          <div className={cn("flex gap-3 [&>*]:flex-1", flow)}>
            <StoreLink
              href="/track"
              onClick={onClose}
              data-drawer-track=""
              className={cn("flex h-14 items-center justify-center gap-2 rounded-bk-pill border border-bk-ink/20 font-bk-body text-base font-bold text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none", flow)}
            >
              <MaterialIcon name="local_shipping" className="text-xl" />
              {copy("track", locale)}
            </StoreLink>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                data-drawer-whatsapp=""
                className={cn("flex h-14 items-center justify-center gap-2 rounded-bk-pill bg-bk-ink font-bk-body text-base font-bold text-bk-surface transition-opacity duration-bk-fast active:opacity-80 motion-reduce:transition-none", flow)}
              >
                <MaterialIcon name="chat" className="text-xl" />
                {copy("whatsapp", locale)}
              </a>
            )}
          </div>
          {enabledLocales.length > 1 && (
            <LocaleSwitch locales={enabledLocales} current={locale} variant="row" />
          )}
        </div>
      </div>
    </div>
  );
}
