// =====================================================================
// Section — pdp_buy_box
// =====================================================================
// The PDP conversion hub, in the Candy Bento lockup:
//   • white info card — On-Sale/New badge, title, optional rating, price +
//     compare-at + "-X% WOW!" sticker
//   • butter CodCard — glorified cash-on-delivery (24h + pay-cash + inspect)
//   • dashed options card — SIZE pills (size-like variants), OPTION pills
//     (the rest), QTY stepper, "Size Guide" link
//   • inline add-to-cart + WhatsApp
//   • a full-bleed mint sticky slab (TOTAL + WhatsApp + ADD TO CART) that
//     floats up whenever the inline CTA is off-screen.
// Reads runtime.product (+ its variants). Rating is opt-in via real config —
// no fabricated review counts.
// =====================================================================
// Client half of `pdp_buy_box` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./pdp_buy_box.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveI18n, pixelContentFromProduct, pixelContentsFromItems } from "@scheniders/shared";
import { trackPixel } from "./helpers/pixels";
import {
  BentoCard,
  ChunkyButton,
  CodCard,
  MaterialIcon,
  Sticker,
  WhatsAppIcon,
} from "./helpers/primitives";
import { cn } from "./helpers/utils";
import { formatPrice, formatSavings } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { whatsappOrderLink, resolveTenantWhatsapp } from "./helpers/whatsapp";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./pdp_buy_box";

interface ProductVariantLite {
  id: string;
  name: string;
  price?: number | null;
  stock_quantity?: number;
}

/** Size-like variant names (S / M / L / XL / 2XL / numeric) get the SIZE picker;
 *  everything else falls into the OPTION picker. */
const SIZE_LIKE = /^(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|\d+)$/i;

export function PdpBuyBoxRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const product = ctx.product;
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const addItem = useCart((s) => s.addItem);

  // Pixel ViewContent on product view (no-op when no pixel is initialised).
  const viewedId = product?.id;
  const viewedPrice = product?.price;
  useEffect(() => {
    if (!viewedId || typeof viewedPrice !== "number") return;
    trackPixel(
      "ViewContent",
      pixelContentFromProduct({ id: viewedId, price: viewedPrice }),
    );
  }, [viewedId, viewedPrice]);

  const variants = useMemo(
    () =>
      (product as unknown as { variants?: ProductVariantLite[] } | undefined)
        ?.variants ?? [],
    [product],
  );
  const { sizeVariants, otherVariants } = useMemo(() => {
    const sizes: ProductVariantLite[] = [];
    const others: ProductVariantLite[] = [];
    for (const v of variants) {
      if (SIZE_LIKE.test(v.name.trim())) sizes.push(v);
      else others.push(v);
    }
    return { sizeVariants: sizes, otherVariants: others };
  }, [variants]);

  const [variantId, setVariantId] = useState<string | null>(
    variants[0]?.id ?? null,
  );
  const [qty, setQty] = useState(1);

  // WhatsApp deep-link embeds the absolute page URL — only known client-side,
  // so start SSR-safe (relative) and upgrade after mount (no hydration drift).
  const [pageUrl, setPageUrl] = useState(
    `/products/${(product as { slug?: string } | undefined)?.slug ?? product?.id ?? ""}`,
  );
  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  // Sticky slab visibility — surfaces the CTA whenever the inline one is off-screen.
  const inlineCtaRef = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  useEffect(() => {
    const el = inlineCtaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!product) {
    if (process.env.NODE_ENV !== "production") {
      return (
        <div
          data-section-placeholder="pdp_buy_box"
          style={{ padding: 12, border: "1px dashed #999", color: "#666", fontSize: 12 }}
        >
          pdp_buy_box — no product in runtime context
        </div>
      );
    }
    return null;
  }

  const activeVariant =
    variants.find((v) => v.id === variantId) ?? variants[0] ?? null;
  const unitPrice = activeVariant?.price ?? product.price;
  const onSale =
    product.compare_at_price != null && product.compare_at_price > product.price;
  const savings = onSale
    ? formatSavings(product.compare_at_price ?? 0, product.price)
    : null;
  const discountPct = onSale
    ? Math.round(
        ((product.compare_at_price! - product.price) /
          product.compare_at_price!) *
          100,
      )
    : 0;
  const stockLeft =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
  const oos = stockLeft <= 0;

  const ctaLabel = resolveI18n(props.add_to_cart_label_i18n, locale);
  const codLabel = resolveI18n(props.cod_badge_label_i18n, locale);

  const ratingValue = props.rating_value;
  const ratingCount = props.rating_count;
  const showRating =
    typeof ratingValue === "number" && typeof ratingCount === "number";

  function handleAdd() {
    if (oos || !product) return;
    addItem({
      product_id: product.id,
      variant_id: activeVariant?.id ?? null,
      name: product.name,
      variant_name: activeVariant?.name ?? null,
      price: unitPrice,
      quantity: qty,
      image_url: product.image_url ?? null,
    });
    trackPixel(
      "AddToCart",
      pixelContentsFromItems([
        { product_id: product.id, price: unitPrice, quantity: qty },
      ]),
    );
  }

  const VariantPill = ({
    v,
    big,
  }: {
    v: ProductVariantLite;
    big?: boolean;
  }) => {
    const isActive = (variantId ?? variants[0]?.id) === v.id;
    const vOos = v.stock_quantity === 0;
    return (
      <button
        type="button"
        key={v.id}
        onClick={() => setVariantId(v.id)}
        aria-pressed={isActive}
        disabled={vOos}
        className={cn(
          "font-display font-black uppercase transition-transform",
          big ? "min-w-12 h-12 px-3 text-lg" : "px-4 h-10 text-sm",
          isActive && "scale-105 -rotate-2",
          vOos && "opacity-40 cursor-not-allowed line-through",
        )}
        style={{
          backgroundColor: isActive
            ? "var(--bk-primary, #ff5a8a)"
            : "#ffffff",
          color: isActive ? "var(--bk-on-primary, #fff)" : "var(--bk-ink, #1a1a1a)",
          border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
          borderRadius: "var(--bk-radius-input, 0.75rem)",
          boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
          fontFamily: "var(--bk-font-display, inherit)",
        }}
      >
        {v.name}
      </button>
    );
  };

  return (
    <>
      <section className="px-4 py-4 space-y-bk-md">
        {/* ── Info card ── */}
        <BentoCard bg="white" size="md" className="p-bk-lg sm:p-bk-xl space-y-bk-sm relative">
          <span
            className="inline-block font-display font-black text-xs uppercase px-2 py-1"
            style={{
              backgroundColor: onSale
                ? "var(--bk-primary, #ff5a8a)"
                : "var(--bk-decor-c, #9ad8ff)",
              color: onSale
                ? "var(--bk-on-primary, #fff)"
                : "var(--bk-on-decor, #1a1a1a)",
              border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
              borderRadius: "calc(var(--bk-radius-input, 0.5rem) * 0.6)",
            }}
          >
            {onSale ? (t ? "تخفيض" : "On Sale") : t ? "وصل حديثاً" : "New Arrival"}
          </span>

          <h1
            className="font-display font-black text-2xl sm:text-3xl uppercase leading-tight"
            style={{ color: "var(--bk-ink, #1a1a1a)" }}
          >
            {product.name}
          </h1>

          {showRating && (
            <div className="flex items-center gap-2">
              <span
                className="text-lg drop-shadow-[1px_1px_0px_#1a1a1a]"
                style={{ color: "var(--bk-success, #25d366)" }}
                aria-hidden="true"
              >
                {"★".repeat(Math.round(ratingValue!))}
                <span style={{ color: "var(--bk-ink-faint, rgb(26 26 26 / 0.38))" }}>
                  {"★".repeat(5 - Math.round(ratingValue!))}
                </span>
              </span>
              <span className="font-body font-bold text-sm text-bk-ink-soft">
                ({ratingCount})
              </span>
            </div>
          )}

          <div className="flex items-baseline gap-bk-sm flex-wrap relative pt-bk-2xs">
            <span
              className="font-display font-black text-3xl sm:text-4xl"
              style={{ color: "var(--bk-primary, #ff5a8a)" }}
            >
              <bdi>{formatPrice(unitPrice * qty, locale)}</bdi>
            </span>
            {props.show_compare_price && onSale && product.compare_at_price != null && (
              <span className="font-body text-lg text-bk-ink-soft line-through">
                <bdi>{formatPrice(product.compare_at_price, locale)}</bdi>
              </span>
            )}
            {onSale && (
              <span className="absolute -top-3 right-0">
                <Sticker bg="mint" rotate={10} size="sm">
                  {t ? `وفّر ${discountPct}%` : `-${discountPct}% Wow!`}
                </Sticker>
              </span>
            )}
          </div>
          {savings && (
            <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-primary">
              {t ? `وفّر ${savings}` : `Save ${savings}`}
            </p>
          )}
        </BentoCard>

        {/* ── Glorified COD card ── */}
        {props.show_cod_card !== false && <CodCard locale={locale} />}

        {/* ── Options card (dashed) ── */}
        {(props.show_variant_picker || props.show_qty_stepper) && (
          <BentoCard
            bg="cream"
            size="md"
            className="p-bk-lg space-y-bk-md"
            style={{ borderStyle: "dashed" }}
          >
            {props.show_variant_picker && sizeVariants.length > 0 && (
              <div data-layer="variants" data-layer-label="Size pills">
                <div className="flex justify-between items-end mb-bk-xs">
                  <h3 className="font-display font-black text-lg uppercase">
                    {t ? "المقاس" : "Size"}
                  </h3>
                  {props.show_size_guide !== false && (
                    <span className="font-label font-bold text-xs text-bk-ink-soft underline decoration-2 underline-offset-2">
                      {t ? "دليل المقاسات" : "Size Guide"}
                    </span>
                  )}
                </div>
                <div className="flex gap-bk-xs flex-wrap">
                  {sizeVariants.map((v) => (
                    <VariantPill key={v.id} v={v} big />
                  ))}
                </div>
              </div>
            )}

            {props.show_variant_picker && otherVariants.length > 0 && (
              <div data-layer="variants" data-layer-label="Option pills">
                <h3 className="font-display font-black text-lg uppercase mb-bk-xs">
                  {t ? "الخيار" : "Option"}
                </h3>
                <div className="flex gap-bk-xs flex-wrap">
                  {otherVariants.map((v) => (
                    <VariantPill key={v.id} v={v} />
                  ))}
                </div>
              </div>
            )}

            {props.show_qty_stepper && (
              <div data-layer="qty" data-layer-label="Quantity stepper">
                <h3 className="font-display font-black text-lg uppercase mb-bk-xs">
                  {t ? "الكمية" : "Quantity"}
                </h3>
                <div
                  className="inline-flex items-center bg-white"
                  style={{
                    border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                    borderRadius: "var(--bk-radius-input, 0.75rem)",
                    boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    aria-label={t ? "إنقاص الكمية" : "Decrease quantity"}
                    className="w-11 h-11 flex items-center justify-center"
                    style={{ color: "var(--bk-ink, #1a1a1a)" }}
                  >
                    <MaterialIcon name="remove" />
                  </button>
                  <span
                    className="w-11 text-center font-display font-black text-lg"
                    style={{ color: "var(--bk-ink, #1a1a1a)", fontFamily: "var(--bk-font-display, inherit)" }}
                  >
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQty((q) => Math.min(Math.max(1, stockLeft || 99), q + 1))
                    }
                    aria-label={t ? "زيادة الكمية" : "Increase quantity"}
                    className="w-11 h-11 flex items-center justify-center"
                    style={{
                      color: "var(--bk-on-decor, #1a1a1a)",
                      backgroundColor: "var(--bk-decor-a, #7cf0bd)",
                      borderLeft: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                    }}
                  >
                    <MaterialIcon name="add" />
                  </button>
                </div>
                {!oos && stockLeft > 0 && stockLeft <= 10 && (
                  <p className="text-xs font-label font-bold text-bk-ink-soft mt-bk-2xs">
                    {t ? `بقي ${stockLeft} فقط` : `Only ${stockLeft} left`}
                  </p>
                )}
              </div>
            )}
          </BentoCard>
        )}

        {/* ── Inline add-to-cart ── */}
        <div
          ref={inlineCtaRef}
          data-layer="add_to_cart"
          data-layer-label="Add to cart button"
          data-layer-kind="button"
        >
          <ChunkyButton
            type="button"
            bg="pink"
            size="lg"
            fullWidth
            onClick={handleAdd}
            disabled={oos}
          >
            <MaterialIcon name="shopping_bag" />
            {oos ? (t ? "نفد المخزون" : "Out of stock") : ctaLabel}
          </ChunkyButton>
        </div>

        {/* ── WhatsApp order ── */}
        {(() => {
          const phone = resolveTenantWhatsapp(
            ctx.tenant,
            props.whatsapp_override,
          );
          const link = whatsappOrderLink(
            phone,
            {
              name: product.name,
              variant: activeVariant?.name ?? null,
              url: pageUrl,
              price: formatPrice(unitPrice * qty, locale),
            },
            locale,
          );
          if (!link) return null;
          return (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="pdp-whatsapp-cta"
              className="inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-display font-black uppercase tracking-wide"
              style={{
                backgroundColor: "var(--bk-success, #25d366)",
                color: "var(--bk-on-primary, #1a1a1a)",
                border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                borderRadius: "var(--bk-radius-input, 0.75rem)",
                boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
              }}
            >
              <WhatsAppIcon className="h-5 w-5" />
              {t ? "اطلب عبر واتساب" : "Order via WhatsApp"}
            </a>
          );
        })()}

        {codLabel && (
          <div
            className="inline-flex items-center gap-2 px-3 py-2 font-label font-bold text-xs uppercase tracking-[0.15em]"
            style={{
              backgroundColor: "var(--bk-decor-a, #7cf0bd)",
              color: "var(--bk-on-decor, #1a1a1a)",
              border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-pill, 9999px)",
              boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
            }}
          >
            <MaterialIcon name="payments" className="text-lg" />
            {codLabel}
          </div>
        )}
      </section>

      {/* ── Full-bleed mint sticky slab — TOTAL + WhatsApp + ADD TO CART ── */}
      <div
        aria-hidden={!showSticky}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out motion-reduce:transition-none",
          showSticky ? "translate-y-0" : "translate-y-full pointer-events-none",
        )}
        style={{
          backgroundColor: "var(--bk-decor-a, #7cf0bd)",
          borderTop: "var(--bk-border-thickness-bold, 4px) solid var(--bk-ink, #1a1a1a)",
          boxShadow: "0 -4px 0 0 var(--bk-ink, #1a1a1a)",
        }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col leading-tight min-w-0">
            <span className="font-label font-bold text-[10px] uppercase tracking-[0.2em] text-bk-ink-soft">
              {t ? "الإجمالي" : "Total"}
            </span>
            <span
              className="font-display font-black text-xl sm:text-2xl"
              style={{ color: "var(--bk-ink, #1a1a1a)" }}
            >
              <bdi>{formatPrice(unitPrice * qty, locale)}</bdi>
            </span>
          </div>
          <div className="shrink-0">
            <ChunkyButton type="button" bg="pink" size="md" onClick={handleAdd} disabled={oos}>
              <MaterialIcon name="shopping_bag" />
              {oos ? (t ? "نفد" : "Sold Out") : ctaLabel}
            </ChunkyButton>
          </div>
        </div>
      </div>
    </>
  );
}
