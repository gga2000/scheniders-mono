// =====================================================================
// Section — cart_summary
// =====================================================================
// Subtotal + delivery + total panel for the cart page, plus the
// checkout CTA and optional promo-code input. Reads the cart from
// `useCart()`. When the cart is empty we still render the heading so
// the page has structure — the checkout CTA becomes a disabled button
// (never a link that goes nowhere).
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import {
  resolveI18n,
  computeDeliveryFee,
  computeDiscount,
  computeBundleDiscounts,
} from "@scheniders/shared";
import type { StoreConfigV2 } from "@scheniders/shared";
import {
  CenteredSectionHeader,
  ChunkyButton,
  ChunkyLink,
  WhatsAppButton,
} from "./helpers/primitives";
import { useStoreBase } from "./helpers/store-context";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { whatsappCartLink } from "./helpers/whatsapp";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  checkout_label_i18n: i18nStringSchema,
  show_promo_input: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Order summary", ar: "ملخّص الطلب" },
  checkout_label_i18n: { en: "Continue to checkout", ar: "متابعة الدفع" },
  show_promo_input: false,
};

/** The summary panel is the raised surface on the cart page — the one place
 *  this section pins pure white; every other fill reads a `--bk-*` token. */
const RAISED_CARD_BG = "#ffffff";

const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";
const DASHED_DIVIDER =
  "var(--bk-border-thickness, 3px) dashed var(--bk-divider, rgb(26 26 26 / 0.15))";

function CartSummaryRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const base = useStoreBase();
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.getTotal());
  const couponCode = useCart((s) => s.couponCode);
  const setCouponCode = useCart((s) => s.setCouponCode);
  const heading = resolveI18n(props.heading_i18n, locale);
  const checkoutLabel = resolveI18n(props.checkout_label_i18n, locale);
  const [promoCode, setPromoCode] = useState(couponCode ?? "");
  const [promoStatus, setPromoStatus] = useState<
    "idle" | "applied" | "invalid"
  >(couponCode ? "applied" : "idle");

  const empty = items.length === 0;
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;
  // Cart estimate: governorate isn't chosen yet, so the default_rate applies
  // (falls back to the legacy flat fee when unconfigured). The exact per-gov
  // fee resolves at checkout.
  const delivery = computeDeliveryFee(subtotal, items.length, {
    shipping: commerce?.shipping,
  });
  // Discount: a client-side PREVIEW of the applied coupon (the server
  // re-validates + records the authoritative amount at checkout).
  const discount = computeDiscount(subtotal, couponCode, commerce?.discounts);
  const couponAmount = discount?.amount_iqd ?? 0;
  // Bundle savings preview ("frequently bought together"); server re-resolves.
  const bundleAmount = computeBundleDiscounts(
    items,
    commerce?.bundles,
  ).total_amount_iqd;
  const discountAmount = couponAmount + bundleAmount;
  const total = subtotal - discountAmount + delivery;

  function applyPromo(): void {
    const d = computeDiscount(subtotal, promoCode, commerce?.discounts);
    if (d) {
      setCouponCode(d.code);
      setPromoStatus("applied");
    } else {
      setCouponCode(null);
      setPromoStatus(promoCode.trim() ? "invalid" : "idle");
    }
  }

  const phone =
    (ctx.tenant as { contact_phone?: string | null } | undefined)
      ?.contact_phone ?? null;
  const waHref = empty
    ? null
    : whatsappCartLink(
        phone,
        {
          items: items.map((i) => ({
            name: i.name,
            variant: i.variant_name,
            quantity: i.quantity,
          })),
          total: formatPrice(total, locale),
        },
        locale,
      );

  return (
    <section className="px-4 py-bk-section-dense">
      <div
        className="p-bk-lg sm:p-bk-xl"
        style={{
          backgroundColor: RAISED_CARD_BG,
          color: "var(--bk-ink, #1a1a1a)",
          border: INK_BORDER,
          borderRadius: "var(--bk-radius-card, 1rem)",
          boxShadow: "var(--bk-shadow-card, 4px 4px 0px 0px #1a1a1a)",
        }}
      >
        <CenteredSectionHeader
          as="h2"
          align="start"
          title={heading}
          titleField="heading_i18n"
          className="mb-bk-md"
        />
        <dl className="space-y-bk-xs font-body text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-bk-ink-soft">
              {t ? "المجموع الفرعي" : "Subtotal"}
            </dt>
            <dd className="font-display font-black text-bk-ink">
              <bdi>{formatPrice(subtotal, locale)}</bdi>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-bk-ink-soft">{t ? "التوصيل" : "Delivery"}</dt>
            <dd className="font-display font-black text-bk-ink">
              {delivery === 0 ? (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs bk-caps"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--bk-success, #7cf0bd) 18%, transparent)",
                    color: "var(--bk-ink, #1a1a1a)",
                    border: INK_BORDER,
                    borderRadius: "var(--bk-radius-pill, 9999px)",
                  }}
                >
                  {t ? "مجاني" : "Free"}
                </span>
              ) : (
                <bdi>{formatPrice(delivery, locale)}</bdi>
              )}
            </dd>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between">
              <dt className="text-bk-ink-soft">
                {t ? "الخصم" : "Discount"}
                {discount ? ` (${discount.code})` : ""}
              </dt>
              <dd className="font-display font-black text-bk-success">
                <bdi>−{formatPrice(discountAmount, locale)}</bdi>
              </dd>
            </div>
          )}
          <div
            className="flex justify-between pt-bk-xs"
            style={{ borderTop: DASHED_DIVIDER }}
          >
            <dt className="font-display font-black bk-caps text-bk-ink">
              {t ? "المجموع" : "Total"}
            </dt>
            <dd className="font-display font-black text-xl text-bk-primary">
              <bdi>{formatPrice(total, locale)}</bdi>
            </dd>
          </div>
        </dl>
        {props.show_promo_input && (
          <div className="mt-bk-md space-y-bk-xs">
            <label
              htmlFor="cart-promo-input"
              className="block font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft"
            >
              {t ? "كود الخصم" : "Promo code"}
            </label>
            <div className="flex gap-bk-xs">
              <input
                id="cart-promo-input"
                type="text"
                autoComplete="off"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value);
                  setPromoStatus("idle");
                }}
                aria-invalid={promoStatus === "invalid" || undefined}
                aria-describedby={
                  promoStatus === "idle" ? undefined : "cart-promo-status"
                }
                className="flex-1 min-w-0 px-3 py-2 font-body text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
                style={{
                  backgroundColor: "var(--bk-surface, #ffffff)",
                  border: INK_BORDER,
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  color: "var(--bk-ink, #1a1a1a)",
                }}
                placeholder={t ? "أدخل الكود" : "Enter code"}
              />
              <ChunkyButton
                type="button"
                bg="butter"
                size="sm"
                onClick={applyPromo}
              >
                {t ? "تطبيق" : "Apply"}
              </ChunkyButton>
            </div>
            {promoStatus === "invalid" && (
              <p
                id="cart-promo-status"
                role="alert"
                className="font-label font-bold text-xs text-bk-danger"
              >
                {t ? "الكود غير صالح" : "Code not valid"}
              </p>
            )}
            {promoStatus === "applied" && (
              <p
                id="cart-promo-status"
                className="font-label font-bold text-xs text-bk-ink"
              >
                {t ? "تم تطبيق الكود" : "Code applied"}
              </p>
            )}
          </div>
        )}
        <div className="mt-bk-lg">
          {/* A link must never wrap a button (invalid HTML, double tab stop):
              the CTA is an anchor when it can go somewhere and a disabled
              button when the cart is empty. */}
          {empty ? (
            <ChunkyButton type="button" bg="pink" size="lg" fullWidth disabled>
              {checkoutLabel}
            </ChunkyButton>
          ) : (
            <ChunkyLink
              href={`${base}/checkout`}
              bg="pink"
              size="lg"
              fullWidth
              data-i18n-field="checkout_label_i18n"
            >
              {checkoutLabel}
            </ChunkyLink>
          )}
          <p className="mt-bk-xs text-center font-body text-xs text-bk-ink-soft">
            {t
              ? "الدفع عند الاستلام متاح • لا دفع مسبق"
              : "Cash on delivery available • No upfront payment"}
          </p>
        </div>

        {/* "OR" → Order on WhatsApp (only when the tenant phone is plausible). */}
        {waHref && (
          <>
            <div className="my-bk-sm flex items-center gap-bk-sm">
              <span
                aria-hidden="true"
                className="flex-1"
                style={{
                  height: "var(--bk-border-thickness, 3px)",
                  backgroundColor: "var(--bk-divider, rgb(26 26 26 / 0.15))",
                }}
              />
              <span className="font-display font-black text-sm bk-caps text-bk-ink-soft">
                {t ? "أو" : "Or"}
              </span>
              <span
                aria-hidden="true"
                className="flex-1"
                style={{
                  height: "var(--bk-border-thickness, 3px)",
                  backgroundColor: "var(--bk-divider, rgb(26 26 26 / 0.15))",
                }}
              />
            </div>
            <WhatsAppButton href={waHref} tone="solid" size="lg" fullWidth>
              {t ? "اطلب عبر واتساب" : "Order on WhatsApp"}
            </WhatsAppButton>
          </>
        )}
      </div>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "cart_summary",
  category: "page",
  name: { en: "Cart summary", ar: "ملخّص السلة" },
  description: {
    en: "Subtotal, delivery, total, and checkout CTA with optional promo input.",
    ar: "ملخّص السلة (المجموع، التوصيل، الكلّي) مع زر الدفع وكود الخصم.",
  },
  thumbnail: "/sections/cart_summary.svg",
  valid_on: ["cart"],
  schema,
  defaultProps,
  render: CartSummaryRender,
};

registerSection(definition);
export default definition;
