// =====================================================================
// Section — sticky_cta_bar
// =====================================================================
// Sticky bottom CTA bar (mobile only). Renders a primary action button
// plus an optional secondary kind (WhatsApp, call, or none). When
// `show_total` is enabled and the bar is on the cart/checkout page,
// the live cart subtotal is read from `useCart()`. With
// `show_product_price` on a product page, the product's own price sits
// beside the primary button and the bar steps aside while the in-page
// order form's submit button is on screen (no duplicate CTA).
// =====================================================================
// Client half of `sticky_cta_bar` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./sticky_cta_bar.tsx` so the
// definition is server-safe; only this module ships to the browser.
//
// Slice 1f (spec §1.8): `primary_kind: "form_aware"` (label and tap from
// the express form's progress, never a submit), `style: "soft"` (the
// express buttons' look, no ink outline), `secondary_display: "icon"` (a
// 52px WhatsApp square, prefilled with the product). With none of them set
// the markup is today's, byte for byte (_sticky-cta-baseline-snapshot).
// =====================================================================

"use client";

import * as React from "react";
import { resolveI18n } from "@scheniders/shared";
import { ChunkyButton, ChunkyLink, MaterialIcon, WhatsAppIcon } from "./helpers/primitives";
import { useStoreBase } from "./helpers/store-context";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { useExpressFormProgress, useExpressOrderStore } from "./helpers/express-order-store";
import { readsRtl } from "./helpers/reading";
import { cn } from "./helpers/utils";
import { resolveTenantWhatsapp, resolveTenantPhone, whatsappDigits } from "./helpers/whatsapp";
import { fs } from "./faq_contact_split.strings";
import { displayNameOf } from "./pdp_express/identity-label";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./sticky_cta_bar";
import { handOffToForm, stickyPrimary, stickyWhatsappHref } from "./sticky_cta_bar.form-aware";
import { SoftPrice, SoftPrimary, SoftSecondary, IconSecondary } from "./sticky_cta_bar.soft";
import { ss } from "./sticky_cta_bar.strings";

const DEFAULT_SCROLL_TARGET_ID = "direct-order";

/** Listens for the in-page order form; `true` while it is on screen.
 *  "submit" watches the form's submit button (SSR + missing target →
 *  `false`, the bar stays visible). "form" watches the whole form and
 *  starts `true` so a first-screen form is never covered on first paint;
 *  a missing target turns it `false` after mount. */
function useFormSubmitVisible(
  targetId: string,
  enabled: boolean,
  mode: "submit" | "form",
): boolean {
  const [visible, setVisible] = React.useState(enabled && mode === "form");
  React.useEffect(() => {
    if (!enabled) return;
    const form = document.getElementById(targetId);
    const target =
      mode === "form"
        ? form
        : document.querySelector<HTMLElement>(
            `#${CSS.escape(targetId)} button[type=submit]`,
          );
    if (!target) {
      if (mode === "form") setVisible(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { threshold: mode === "form" ? 0 : 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId, enabled, mode]);
  return visible;
}

/** Live product price for the bar: bold current price, compare-at struck
 *  through when the product is on sale. */
function ProductPrice({
  price,
  compareAt,
  locale,
}: {
  price: number;
  compareAt: number | null;
  locale: "ar" | "en" | "ku";
}) {
  const onSale = compareAt != null && compareAt > price;
  return (
    <div
      className="flex flex-col leading-tight pl-1 tabular-nums"
      data-product-price
    >
      {onSale && (
        <s className="font-label text-[11px] text-bk-ink-faint">
          <bdi>{formatPrice(compareAt, locale)}</bdi>
        </s>
      )}
      <span className="font-display font-black text-base whitespace-nowrap">
        <bdi>{formatPrice(price, locale)}</bdi>
      </span>
    </div>
  );
}

export function StickyCtaBarRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const base = useStoreBase();
  const primaryLabel = resolveI18n(props.primary_label_i18n, locale);
  const secondaryLabel = resolveI18n(props.secondary_label_i18n, locale);
  const subtotal = useCart((s) => s.getTotal());
  const itemCount = useCart((s) => s.getItemCount());
  const product = ctx.product;
  const showProductPrice = props.show_product_price === true && !!product;
  const scrollTargetId = props.scroll_target_id || DEFAULT_SCROLL_TARGET_ID;
  const formSubmitVisible = useFormSubmitVisible(
    scrollTargetId,
    showProductPrice,
    props.hide_while ?? "submit",
  );
  const hidden = showProductPrice && formSubmitVisible;
  const soft = props.style === "soft";
  const rtl = readsRtl(locale);

  // form_aware: the express form's progress for this product, and the
  // watch that makes the form mark its receipt and submit for the tap.
  const formAware = props.primary_kind === "form_aware";
  const productId = product?.id ?? "";
  const progress = useExpressFormProgress(productId);
  const watchForm = useExpressOrderStore((s) => s.watchForm);
  React.useEffect(() => {
    if (!formAware || !productId) return;
    return watchForm(productId);
  }, [formAware, productId, watchForm]);

  // Resolve through the canonical store contact so this bar uses the same
  // store-wide WhatsApp number as every other section (with an optional
  // per-bar override).
  const waNumber = resolveTenantWhatsapp(ctx.tenant, props.whatsapp_override);
  const callNumber = resolveTenantPhone(ctx.tenant, props.whatsapp_override);

  const iconSecondary = props.secondary_display === "icon";
  const secondaryHref = (() => {
    if (props.secondary_kind === "whatsapp" && waNumber && iconSecondary && product) {
      // The icon opens the chat with the product named (spec §1.8).
      const message =
        resolveI18n(props.whatsapp_prefill_i18n, locale) || ss("waPrefill", locale);
      return stickyWhatsappHref(waNumber, message.split("{product}").join(displayNameOf(product)));
    }
    if (props.secondary_kind === "whatsapp" && waNumber) {
      return `https://wa.me/${whatsappDigits(waNumber)}`;
    }
    if (props.secondary_kind === "call" && callNumber) {
      return `tel:${callNumber}`;
    }
    return null;
  })();

  const primaryKind = props.primary_kind ?? "link";
  if (!primaryLabel) return null;
  if (primaryKind === "link" && !props.primary_href) return null;
  const primary = formAware ? stickyPrimary(progress, primaryLabel, locale) : null;

  const primaryHref =
    props.primary_href.startsWith("/")
      ? `${base}${props.primary_href}`
      : props.primary_href;

  const scrollToForm = () => {
    const target = document.getElementById(scrollTargetId);
    if (!target) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    target
      .querySelector<HTMLElement>("input, select, textarea")
      ?.focus({ preventScroll: true });
  };

  // The one tap handler for both button kinds: form_aware hands off to the
  // form (never submitting it), scroll_to_form scrolls as it always has.
  const onPrimary = primary ? () => handOffToForm(primary.target, scrollToForm) : scrollToForm;
  const scrolls = primaryKind !== "link";
  const secondaryName =
    props.secondary_kind === "call" ? fs("call", locale) : fs("whatsapp", locale);

  if (soft) {
    return (
      <>
        {/* In-flow spacer so the fixed bar never covers the last section. */}
        <div aria-hidden="true" className="h-20 sm:hidden" />
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-bk-divider bg-bk-surface px-bk-xs pt-bk-xs sm:hidden",
            rtl && "flex-row-reverse",
            "transition-[transform,opacity] duration-bk-base motion-reduce:transition-none",
            hidden && "pointer-events-none translate-y-full opacity-0",
          )}
          aria-hidden={hidden || undefined}
          inert={hidden || undefined}
          // Clear the iPhone home indicator.
          style={{ paddingBottom: "max(var(--bk-space-xs, 0.5rem), env(safe-area-inset-bottom))" }}
          role="region"
          aria-label={ss("region", locale)}
          data-sticky-style="soft"
        >
          <SoftPrimary
            label={primary?.label ?? primaryLabel}
            sub={primary?.sub ?? null}
            stage={primary?.stage ?? null}
            rtl={rtl}
            href={scrolls ? null : primaryHref}
            onClick={scrolls ? onPrimary : undefined}
          />
          {showProductPrice && product && (
            <SoftPrice
              price={product.price}
              compareAt={product.compare_at_price ?? null}
              locale={locale}
            />
          )}
          {secondaryHref &&
            (iconSecondary ? (
              <IconSecondary
                href={secondaryHref}
                kind={props.secondary_kind === "call" ? "call" : "whatsapp"}
                name={secondaryName}
              />
            ) : (
              <SoftSecondary
                href={secondaryHref}
                kind={props.secondary_kind === "call" ? "call" : "whatsapp"}
                label={secondaryLabel || secondaryName}
                rtl={rtl}
              />
            ))}
        </div>
      </>
    );
  }

  return (
    <>
      {/* In-flow spacer so the fixed bar never covers the last section. */}
      <div aria-hidden="true" className="h-20 sm:hidden" />
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 sm:hidden backdrop-blur px-bk-xs pt-bk-xs flex items-center gap-bk-xs shadow-[0_-6px_0_0_rgba(26,26,26,0.06)]",
        "transition-[transform,opacity] duration-bk-base motion-reduce:transition-none",
        hidden && "translate-y-full opacity-0 pointer-events-none",
      )}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--bk-surface, #ffffff) 95%, transparent)",
        borderTop:
          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
        // Clear the iPhone home indicator.
        paddingBottom:
          "max(var(--bk-space-xs, 0.5rem), env(safe-area-inset-bottom))",
      }}
      role="region"
      aria-label={ss("region", locale)}
    >
      {props.show_total && (
        <div className="flex flex-col leading-tight pl-1">
          <span className="font-label font-bold text-[10px] uppercase tracking-[0.2em] text-bk-ink-faint">
            {locale !== "en"
              ? `${itemCount} عنصر`
              : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
          </span>
          <span className="font-display font-black text-base">
            <bdi>{formatPrice(subtotal, locale)}</bdi>
          </span>
        </div>
      )}
      {showProductPrice && product && (
        <ProductPrice
          price={product.price}
          compareAt={product.compare_at_price ?? null}
          locale={locale}
        />
      )}
      {secondaryHref && iconSecondary && (
        <IconSecondary
          href={secondaryHref}
          kind={props.secondary_kind === "call" ? "call" : "whatsapp"}
          name={secondaryName}
        />
      )}
      {secondaryHref && !iconSecondary && (
        // A styled anchor — not a <button> nested in an <a> (invalid HTML,
        // double tab stop).
        <ChunkyLink
          href={secondaryHref}
          target={props.secondary_kind === "whatsapp" ? "_blank" : undefined}
          rel={
            props.secondary_kind === "whatsapp"
              ? "noopener noreferrer"
              : undefined
          }
          aria-label={
            secondaryLabel ||
            (props.secondary_kind === "call"
              ? locale !== "en"
                ? "اتصال"
                : "Call"
              : locale !== "en"
                ? "واتساب"
                : "WhatsApp")
          }
          bg="success"
          size="md"
        >
          {props.secondary_kind === "whatsapp" ? (
            <WhatsAppIcon className="w-5 h-5" />
          ) : (
            <MaterialIcon name="call" />
          )}
          {secondaryLabel}
        </ChunkyLink>
      )}
      {scrolls ? (
        <ChunkyButton
          type="button"
          bg="pink"
          size="md"
          className="flex-1"
          onClick={onPrimary}
        >
          {primary?.label ?? primaryLabel}
          {primary?.sub && <span className="text-xs">{primary.sub}</span>}
        </ChunkyButton>
      ) : (
        <ChunkyLink href={primaryHref} bg="pink" size="md" className="flex-1">
          {primaryLabel}
        </ChunkyLink>
      )}
    </div>
    </>
  );
}
