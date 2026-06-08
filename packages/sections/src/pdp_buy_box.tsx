// =====================================================================
// Section — pdp_buy_box
// =====================================================================
// One-card PDP buy box: title + price + variant picker + qty stepper +
// add-to-cart + COD reassurance badge. Reads runtime.product. Used on
// product detail pages as the conversion hub.
// =====================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
  MaterialIcon,
  Sticker,
  WhatsAppIcon,
} from "./helpers/primitives";
import { formatPrice, formatSavings } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { whatsappOrderLink } from "./helpers/whatsapp";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  add_to_cart_label_i18n: i18nStringSchema,
  cod_badge_label_i18n: i18nStringOptional,
  show_compare_price: z.boolean(),
  show_variant_picker: z.boolean(),
  show_qty_stepper: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  add_to_cart_label_i18n: { en: "Add to cart", ar: "أضف إلى السلة" },
  cod_badge_label_i18n: {
    en: "Cash on delivery",
    ar: "الدفع عند الاستلام",
  },
  show_compare_price: true,
  show_variant_picker: true,
  show_qty_stepper: true,
};

interface ProductVariantLite {
  id: string;
  name: string;
  price?: number | null;
}

function PdpBuyBoxRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const product = ctx.product;
  const locale = ctx.runtime.locale;
  const addItem = useCart((s) => s.addItem);
  const variants = useMemo(
    () =>
      (product as unknown as { variants?: ProductVariantLite[] } | undefined)
        ?.variants ?? [],
    [product],
  );
  const [variantId, setVariantId] = useState<string | null>(
    variants[0]?.id ?? null,
  );
  const [qty, setQty] = useState(1);

  // The WhatsApp message embeds the product URL. The absolute page URL is only
  // available on the client, so initialise with the SSR-safe relative path —
  // server and first client render then match (no hydration mismatch) — and
  // upgrade to the absolute URL after mount.
  const [pageUrl, setPageUrl] = useState(
    `/products/${(product as { slug?: string } | undefined)?.slug ?? product?.id ?? ""}`,
  );
  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  if (!product) {
    if (process.env.NODE_ENV !== "production") {
      return (
        <div
          data-section-placeholder="pdp_buy_box"
          style={{
            padding: 12,
            border: "1px dashed #999",
            color: "#666",
            fontSize: 12,
          }}
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
  const oos =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0) <= 0;

  const t = locale === "ar";
  const ctaLabel = resolveI18n(props.add_to_cart_label_i18n, locale);
  const codLabel = resolveI18n(props.cod_badge_label_i18n, locale);

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
  }

  return (
    <section
      className="px-4 py-4"
      style={{
        fontFamily: "var(--bk-font-display, inherit)",
      }}
    >
      <BentoCard
        bg="white"
        size="md"
        className="p-bk-lg sm:p-bk-xl space-y-bk-md"
        style={{ borderRadius: "var(--bk-radius-card, 1.25rem)" }}
      >
        <div className="flex items-start gap-bk-sm flex-wrap">
          <h1
            className="font-display font-black text-2xl sm:text-3xl uppercase leading-tight flex-1 min-w-0"
            style={{ color: "var(--bk-ink, #1a1a1a)" }}
          >
            {product.name}
          </h1>
          {onSale && (
            <Sticker bg="pink" rotate={-4} size="sm">
              {t ? "تخفيض" : "Sale"}
            </Sticker>
          )}
        </div>

        <div className="flex items-baseline gap-bk-sm flex-wrap">
          <span
            className="font-display font-black text-3xl sm:text-4xl"
            style={{ color: "var(--bk-primary, #ff4081)" }}
          >
            {formatPrice(unitPrice * qty)}
          </span>
          {props.show_compare_price &&
            onSale &&
            product.compare_at_price != null && (
              <span className="font-body text-lg text-bk-ink-faint line-through">
                {formatPrice(product.compare_at_price)}
              </span>
            )}
          {savings && (
            <span className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-primary">
              {t ? `وفّر ${savings}` : `Save ${savings}`}
            </span>
          )}
        </div>

        {props.show_variant_picker && variants.length > 0 && (
          <div data-layer="variants" data-layer-label="Variant pills">
            <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mb-bk-xs">
              {t ? "الخيارات" : "Options"}
            </p>
            <div className="flex flex-wrap gap-bk-xs">
              {variants.map((v) => {
                const isActive = (variantId ?? variants[0]?.id) === v.id;
                return (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => setVariantId(v.id)}
                    aria-pressed={isActive}
                    className="px-4 py-2 font-display font-black text-sm uppercase"
                    style={{
                      backgroundColor: isActive
                        ? "var(--bk-secondary, #c5b6ff)"
                        : "#ffffff",
                      color: "var(--bk-ink, #1a1a1a)",
                      border:
                        "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                      borderRadius: "var(--bk-radius-input, 0.75rem)",
                      boxShadow:
                        "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                      fontFamily: "var(--bk-font-display, inherit)",
                    }}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {props.show_qty_stepper && (
          <div data-layer="qty" data-layer-label="Quantity stepper" className="flex items-center gap-bk-sm">
            <span className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
              {t ? "الكمية" : "Qty"}
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
                style={{
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
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

        <div
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

        {(() => {
          const phone = (ctx.tenant as { contact_phone?: string | null } | undefined)
            ?.contact_phone;
          const link = whatsappOrderLink(
            phone,
            {
              name: product.name,
              url: pageUrl,
              price: formatPrice(unitPrice * qty),
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
                backgroundColor: "var(--bk-success, #7cf0bd)",
                color: "var(--bk-ink, #1a1a1a)",
                border:
                  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
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
              backgroundColor: "var(--bk-success, #7cf0bd)",
              color: "var(--bk-ink, #1a1a1a)",
              border:
                "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-pill, 9999px)",
              boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
            }}
          >
            <MaterialIcon name="payments" className="text-lg" />
            {codLabel}
          </div>
        )}
      </BentoCard>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "pdp_buy_box",
  category: "page",
  name: { en: "Buy box", ar: "صندوق الشراء" },
  description: {
    en: "PDP buy box: title, price, variants, qty, add-to-cart, COD badge.",
    ar: "صندوق شراء المنتج: العنوان، السعر، الخيارات، الكمية، الإضافة للسلة، شارة الدفع عند الاستلام.",
  },
  thumbnail: "/sections/pdp_buy_box.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpBuyBoxRender,
};

registerSection(definition);
export default definition;
