// =====================================================================
// Section — pdp_add_to_cart
// =====================================================================
// Primary CTA cluster for the PDP: add-to-cart button + optional
// WhatsApp button + quantity picker. Optionally pins itself to the
// bottom of the viewport on mobile.
// =====================================================================
// Client half of `pdp_add_to_cart` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./pdp_add_to_cart.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useState } from "react";
import { resolveI18n, pixelContentsFromItems } from "@scheniders/shared";
import { stockLeftFor, useSelectedVariant } from "./helpers/variant-store";
import { trackPixel } from "./helpers/pixels";
import { ChunkyButton, MaterialIcon, WhatsAppIcon } from "./helpers/primitives";
import { useCart } from "./helpers/cart-store";
import { formatPrice } from "./helpers/format";
import { whatsappOrderLink, resolveTenantWhatsapp } from "./helpers/whatsapp";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./pdp_add_to_cart";

export function PdpAddToCartRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const product = ctx.product;
  const locale = ctx.runtime.locale;
  const addItem = useCart((s) => s.addItem);
  const [qty, setQty] = useState(1);

  const chosen = useSelectedVariant(product);
  if (!product) return null;

  const primaryLabel = resolveI18n(props.primary_label_i18n, locale);
  const whatsappLabel = resolveI18n(props.whatsapp_label_i18n, locale);
  // Resolve through the canonical store contact (store-wide WhatsApp number,
  // with optional per-section override); whatsappOrderLink returns null for
  // missing/placeholder numbers, so the button only renders when usable.
  const tenantPhone = resolveTenantWhatsapp(ctx.tenant, props.whatsapp_override);
  const whatsappHref = whatsappOrderLink(
    tenantPhone,
    { name: product.name, price: formatPrice(product.price, locale) },
    locale,
  );

  const oos = stockLeftFor(product, chosen.variant) <= 0;
  const unitPrice = chosen.variant?.price ?? product.price;

  function handleAdd() {
    if (oos) return;
    // A product with several variants and none chosen cannot be added: the
    // picker section (or the direct-order form) is where the choice is made.
    if (chosen.variants.length > 1 && !chosen.variant) return;
    addItem({
      product_id: product!.id,
      variant_id: chosen.variant?.id ?? null,
      name: product!.name,
      variant_name: chosen.variant?.name ?? null,
      price: unitPrice,
      quantity: qty,
      image_url: chosen.variant?.image_url ?? product!.image_url ?? null,
    });
    trackPixel(
      "AddToCart",
      pixelContentsFromItems([
        { product_id: product!.id, price: unitPrice, quantity: qty },
      ]),
    );
  }

  const ctaCluster = (
    <div className="flex flex-col gap-bk-sm">
      {props.show_quantity_picker && (
        <div className="flex items-center gap-bk-sm">
          <span className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
            {locale !== "en" ? "الكمية" : "Qty"}
          </span>
          <div
            className="flex items-center bg-white"
            style={{
              border:
                "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-input, 0.75rem)",
              boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
            }}
          >
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
              className="w-10 h-10 flex items-center justify-center"
              style={{ color: "var(--bk-ink, #1a1a1a)" }}
            >
              <MaterialIcon name="remove" />
            </button>
            <span
              className="w-10 text-center font-display font-black text-lg"
              style={{ color: "var(--bk-ink, #1a1a1a)" }}
            >
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              aria-label="Increase quantity"
              className="w-10 h-10 flex items-center justify-center"
              style={{ color: "var(--bk-ink, #1a1a1a)" }}
            >
              <MaterialIcon name="add" />
            </button>
          </div>
        </div>
      )}
      <ChunkyButton
        type="button"
        bg="pink"
        size="lg"
        fullWidth
        onClick={handleAdd}
        disabled={oos}
      >
        <MaterialIcon name="shopping_bag" />
        {oos
          ? locale !== "en"
            ? "نفد المخزون"
            : "Out of stock"
          : primaryLabel}
      </ChunkyButton>
      {whatsappHref && (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
          <ChunkyButton type="button" bg="mint" size="lg" fullWidth>
            <WhatsAppIcon className="w-5 h-5" />
            {whatsappLabel}
          </ChunkyButton>
        </a>
      )}
    </div>
  );

  return (
    <>
      <section className="px-4 py-4">{ctaCluster}</section>
      {props.sticky_on_mobile && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur p-bk-sm shadow-[0_-6px_0_0_rgba(26,26,26,0.06)]"
          style={{
            borderTop:
              "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
          }}
        >
          {/* Full-width on mobile; a centered, contained CTA on desktop so the
              add-to-cart stays reachable on long product pages without a giant
              full-bleed slab. */}
          <div className="mx-auto sm:max-w-md">
            <ChunkyButton
              type="button"
              bg="pink"
              size="md"
              fullWidth
              onClick={handleAdd}
              disabled={oos}
            >
              <MaterialIcon name="shopping_bag" />
              {oos ? (
                locale !== "en" ? (
                  "نفد المخزون"
                ) : (
                  "Out of stock"
                )
              ) : (
                <>
                  {primaryLabel} — <bdi>{formatPrice(product.price * qty, locale)}</bdi>
                </>
              )}
            </ChunkyButton>
          </div>
        </div>
      )}
    </>
  );
}
