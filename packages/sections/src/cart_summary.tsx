// =====================================================================
// Section — cart_summary
// =====================================================================
// Subtotal + delivery + total panel for the cart page, plus the
// checkout CTA and optional promo-code input. Reads the cart from
// `useCart()`. When the cart is empty we still render the heading so
// the page has structure — the checkout button is disabled.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
  ScribbleHeading,
  WhatsAppIcon,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { isPlausiblePhone } from "./helpers/whatsapp";
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

/** Free above this — matches the seeded Schneiders shipping default (75k). */
const FREE_DELIVERY_THRESHOLD = 75_000;
const BAGHDAD_DELIVERY = 5_000;

function CartSummaryRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.getTotal());
  const heading = resolveI18n(props.heading_i18n, locale);
  const checkoutLabel = resolveI18n(props.checkout_label_i18n, locale);
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<
    "idle" | "applied" | "invalid"
  >("idle");

  const empty = items.length === 0;
  const delivery = empty
    ? 0
    : subtotal >= FREE_DELIVERY_THRESHOLD
      ? 0
      : BAGHDAD_DELIVERY;
  const total = subtotal + delivery;

  return (
    <section className="px-4 py-bk-section-dense">
      <BentoCard bg="white" size="md" className="p-bk-lg sm:p-bk-xl">
        <ScribbleHeading color="lilac" className="mb-bk-md">
          {heading}
        </ScribbleHeading>
        <dl className="space-y-bk-xs font-body text-sm">
          <div className="flex justify-between">
            <dt className="text-bk-ink-soft">
              {locale === "ar" ? "المجموع الفرعي" : "Subtotal"}
            </dt>
            <dd className="font-display font-black text-bk-ink">
              {formatPrice(subtotal)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-bk-ink-soft">
              {locale === "ar" ? "التوصيل" : "Delivery"}
            </dt>
            <dd className="font-display font-black text-bk-ink">
              {delivery === 0 ? (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs uppercase tracking-wide"
                  style={{
                    backgroundColor: "var(--bk-mint, #7cf0bd)",
                    color: "var(--bk-ink, #1a1a1a)",
                    border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                    borderRadius: "var(--bk-radius-pill, 9999px)",
                  }}
                >
                  {locale === "ar" ? "مجاني 🎉" : "Free 🎉"}
                </span>
              ) : (
                formatPrice(delivery)
              )}
            </dd>
          </div>
          <div
            className="flex justify-between pt-bk-xs border-t-[3px] border-dashed border-bk-divider"
          >
            <dt className="font-display font-black uppercase text-bk-ink">
              {locale === "ar" ? "المجموع" : "Total"}
            </dt>
            <dd
              className="font-display font-black text-xl"
              style={{
                color: "var(--bk-primary, #ff5a8a)",
                fontFamily: "var(--bk-font-display, inherit)",
              }}
            >
              {formatPrice(total)}
            </dd>
          </div>
        </dl>
        {props.show_promo_input && (
          <div className="mt-bk-md space-y-bk-xs">
            <label
              htmlFor="cart-promo-input"
              className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft"
            >
              {locale === "ar" ? "كود الخصم" : "Promo code"}
            </label>
            <div className="flex gap-bk-xs">
              <input
                id="cart-promo-input"
                type="text"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value);
                  setPromoStatus("idle");
                }}
                className="flex-1 bg-white px-3 py-2 font-body text-sm focus:outline-none"
                style={{
                  border:
                    "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  color: "var(--bk-ink, #1a1a1a)",
                  fontFamily: "var(--bk-font-body, inherit)",
                }}
                placeholder={locale === "ar" ? "أدخل الكود" : "Enter code"}
              />
              <ChunkyButton
                type="button"
                bg="butter"
                size="sm"
                onClick={() =>
                  setPromoStatus(promoCode.trim() ? "invalid" : "idle")
                }
              >
                {locale === "ar" ? "تطبيق" : "Apply"}
              </ChunkyButton>
            </div>
            {promoStatus === "invalid" && (
              <p className="font-label font-bold text-xs text-bk-danger">
                {locale === "ar"
                  ? "الكود غير صالح"
                  : "Code not valid"}
              </p>
            )}
            {promoStatus === "applied" && (
              <p className="font-label font-bold text-xs text-bk-ink">
                {locale === "ar" ? "تم تطبيق الكود" : "Code applied"}
              </p>
            )}
          </div>
        )}
        <div className="mt-bk-lg">
          <StoreLink href="/checkout">
            <ChunkyButton bg="pink" size="lg" fullWidth disabled={empty}>
              {checkoutLabel}
            </ChunkyButton>
          </StoreLink>
          <p className="mt-bk-xs text-center font-body text-xs text-bk-ink-soft">
            {locale === "ar"
              ? "الدفع عند الاستلام متاح • لا دفع مسبق"
              : "Cash on delivery available • No upfront payment"}
          </p>
        </div>

        {/* "OR" → Order on WhatsApp (only when the tenant phone is plausible). */}
        {!empty &&
          (() => {
            const phone =
              (ctx.tenant as { contact_phone?: string | null } | undefined)
                ?.contact_phone ?? null;
            if (!isPlausiblePhone(phone)) return null;
            const lines = items
              .map(
                (i) =>
                  `• ${i.name}${i.variant_name ? ` — ${i.variant_name}` : ""} × ${i.quantity}`,
              )
              .join("\n");
            const msg =
              (locale === "ar"
                ? `مرحباً! أودّ إكمال طلبي:\n${lines}\nالإجمالي: ${formatPrice(total)}`
                : `Hi! I'd like to complete my order:\n${lines}\nTotal: ${formatPrice(total)}`);
            const href = `https://wa.me/${phone!.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
            return (
              <>
                <div className="my-bk-sm flex items-center gap-bk-sm">
                  <span className="h-[3px] flex-1 bg-candy-ink/20" />
                  <span className="font-display font-black text-sm uppercase text-bk-ink-soft">
                    {locale === "ar" ? "أو" : "Or"}
                  </span>
                  <span className="h-[3px] flex-1 bg-candy-ink/20" />
                </div>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 px-5 py-4 font-display font-black text-base uppercase tracking-tight"
                  style={{
                    backgroundColor: "var(--bk-mint, #7cf0bd)",
                    color: "var(--bk-ink, #1a1a1a)",
                    border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                    borderRadius: "var(--bk-radius-input, 0.75rem)",
                    boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                  }}
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  {locale === "ar" ? "اطلب عبر واتساب" : "Order on WhatsApp"}
                </a>
              </>
            );
          })()}
      </BentoCard>
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
