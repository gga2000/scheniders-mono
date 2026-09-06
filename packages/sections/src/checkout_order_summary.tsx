// =====================================================================
// Section — checkout_order_summary
// =====================================================================
// Right-rail order summary for the checkout page. Lists line items
// (compact), shows subtotal / delivery / total, and sticks to the
// viewport on desktop. Reads the cart from `useCart()`.
// =====================================================================

"use client";

import Image from "next/image";
import { z } from "zod";
import {
  resolveI18n,
  computeDeliveryFee,
  computeDiscount,
  computeBundleDiscounts,
} from "@scheniders/shared";
import type { StoreConfigV2, GovernorateCode } from "@scheniders/shared";
import { CenteredSectionHeader, MaterialIcon } from "./helpers/primitives";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  cod_note_i18n: i18nStringOptional,
  sticky: z.boolean(),
  show_thumbnails: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Order summary", ar: "ملخّص الطلب" },
  cod_note_i18n: {
    en: "Cash on delivery — pay only after inspection.",
    ar: "الدفع عند الاستلام — لا تدفع إلا بعد فحص الطلب.",
  },
  sticky: true,
  show_thumbnails: true,
};

const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";
const DASHED_DIVIDER =
  "var(--bk-border-thickness, 3px) dashed var(--bk-divider, rgb(26 26 26 / 0.15))";

function CheckoutOrderSummaryRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.getTotal());
  const governorate = useCart((s) => s.governorate);
  const couponCode = useCart((s) => s.couponCode);
  const heading = resolveI18n(props.heading_i18n, locale);
  const codNote = resolveI18n(props.cod_note_i18n, locale);

  // R2b: the governorate is broadcast by the checkout form via the cart store,
  // so this summary shows the SAME per-governorate fee as the form's CTA (and
  // what the server records). Falls back to the default rate / legacy flat.
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;
  const delivery = computeDeliveryFee(subtotal, items.length, {
    shipping: commerce?.shipping,
    governorate: governorate as GovernorateCode | null,
  });
  const discount = computeDiscount(subtotal, couponCode, commerce?.discounts);
  const couponAmount = discount?.amount_iqd ?? 0;
  const bundleAmount = computeBundleDiscounts(
    items,
    commerce?.bundles,
  ).total_amount_iqd;
  const discountAmount = couponAmount + bundleAmount;
  const total = subtotal - discountAmount + delivery;

  return (
    <section className="px-4 py-bk-section-dense">
      <div className={props.sticky ? "lg:sticky lg:top-24" : undefined}>
        {/* The recap sits on the alt surface so the form card beside it reads
            as the raised, primary element on the checkout page. */}
        <div
          className="p-bk-lg sm:p-bk-xl"
          style={{
            backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
            color: "var(--bk-ink, #1a1a1a)",
            border: INK_BORDER,
            borderRadius: "var(--bk-radius-card, 1rem)",
          }}
        >
          <CenteredSectionHeader
            as="h2"
            align="start"
            title={heading}
            titleField="heading_i18n"
            className="mb-bk-md"
          />

          {items.length === 0 ? (
            <p className="font-body text-sm text-bk-ink-soft">
              {t ? "السلة فارغة." : "Your cart is empty."}
            </p>
          ) : (
            <ul className="space-y-bk-sm mb-bk-md">
              {items.map((item) => (
                <li
                  key={`${item.product_id}-${item.variant_id ?? "default"}`}
                  className="flex items-center gap-bk-sm"
                >
                  {props.show_thumbnails && (
                    <div
                      className="relative w-12 h-12 overflow-hidden shrink-0"
                      style={{
                        backgroundColor: "var(--bk-surface, #ffffff)",
                        border: INK_BORDER,
                        borderRadius: "var(--bk-radius-input, 0.75rem)",
                      }}
                    >
                      {item.image_url ? (
                        // Supabase-hosted product thumbnails — Next's optimizer
                        // can transcode them.
                        <Image
                          src={item.image_url}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-bk-ink-faint">
                          <MaterialIcon name="image" className="text-lg" />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-black text-xs truncate text-bk-ink">
                      {item.name}
                    </p>
                    <p className="font-label text-[11px] tabular-nums text-bk-ink-soft">
                      {t ? "الكمية" : "Qty"} {item.quantity}
                      {item.variant_name ? ` · ${item.variant_name}` : ""}
                    </p>
                  </div>
                  <span className="font-display font-black text-sm tabular-nums shrink-0 text-bk-ink">
                    <bdi>{formatPrice(item.price * item.quantity, locale)}</bdi>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl
            className="space-y-bk-xs font-body text-sm tabular-nums pt-bk-sm"
            style={{ borderTop: DASHED_DIVIDER }}
          >
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
                  t ? (
                    "مجاني"
                  ) : (
                    "Free"
                  )
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

          {codNote && (
            <p
              className="mt-bk-md font-body text-xs text-bk-ink-soft inline-flex items-center gap-2"
              data-i18n-field="cod_note_i18n"
            >
              <MaterialIcon
                name="verified"
                className="text-lg text-bk-success"
              />
              {codNote}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "checkout_order_summary",
  category: "page",
  name: { en: "Checkout order summary", ar: "ملخّص طلب الدفع" },
  description: {
    en: "Sticky right-rail order summary for checkout (items, totals, COD note).",
    ar: "ملخّص الطلب لصفحة الدفع (العناصر، المجاميع، ملاحظة الدفع عند الاستلام).",
  },
  thumbnail: "/sections/checkout_order_summary.svg",
  valid_on: ["checkout"],
  schema,
  defaultProps,
  render: CheckoutOrderSummaryRender,
};

registerSection(definition);
export default definition;
