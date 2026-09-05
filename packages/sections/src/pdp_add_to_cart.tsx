// =====================================================================
// Section — pdp_add_to_cart
// =====================================================================
// Primary CTA cluster for the PDP: add-to-cart button + optional
// WhatsApp button + quantity picker. Optionally pins itself to the
// bottom of the viewport on mobile.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n, pixelContentsFromItems } from "@scheniders/shared";
import { trackPixel } from "./helpers/pixels";
import {
  ChunkyButton,
  MaterialIcon,
  WhatsAppIcon,
} from "./helpers/primitives";
import { useCart } from "./helpers/cart-store";
import { formatPrice } from "./helpers/format";
import { whatsappOrderLink, resolveTenantWhatsapp } from "./helpers/whatsapp";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  primary_label_i18n: i18nStringSchema,
  whatsapp_label_i18n: i18nStringOptional,
  show_quantity_picker: z.boolean(),
  sticky_on_mobile: z.boolean(),
  /** Per-section WhatsApp number override (empty = store-wide number). */
  whatsapp_override: z.string().optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  primary_label_i18n: { en: "Add to cart", ar: "أضف إلى السلة" },
  whatsapp_label_i18n: { en: "Order on WhatsApp", ar: "اطلب عبر واتساب" },
  show_quantity_picker: true,
  sticky_on_mobile: true,
};

function PdpAddToCartRender({
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

  const oos =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0) <= 0;

  function handleAdd() {
    if (oos) return;
    addItem({
      product_id: product!.id,
      variant_id: null,
      name: product!.name,
      variant_name: null,
      price: product!.price,
      quantity: qty,
      image_url: product!.image_url ?? null,
    });
    trackPixel(
      "AddToCart",
      pixelContentsFromItems([
        { product_id: product!.id, price: product!.price, quantity: qty },
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
            className="flex items-center bg-bk-surface-alt"
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
          className="fixed bottom-0 inset-x-0 z-40 bg-bk-surface-alt/95 backdrop-blur p-bk-sm shadow-[0_-6px_0_0_rgba(26,26,26,0.06)]"
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

const definition: SectionDefinition<Props> = {
  type: "pdp_add_to_cart",
  category: "page",
  name: { en: "Add to cart", ar: "إضافة إلى السلة" },
  description: {
    en: "Primary PDP CTA: add-to-cart + WhatsApp + quantity picker.",
    ar: "زر الشراء الرئيسي مع واتساب ومحدّد الكمية.",
  },
  thumbnail: "/sections/pdp_add_to_cart.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpAddToCartRender,
};

registerSection(definition);
export default definition;
