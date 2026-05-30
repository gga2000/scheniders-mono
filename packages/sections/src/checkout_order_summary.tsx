// =====================================================================
// Section — checkout_order_summary
// =====================================================================
// Right-rail order summary for the checkout page. Lists line items
// (compact), shows subtotal / delivery / total, and sticks to the
// viewport on desktop. Reads the cart from `useCart()`.
// =====================================================================

"use client";

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  MaterialIcon,
  ScribbleHeading,
} from "./helpers/primitives";
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

const FREE_DELIVERY_THRESHOLD = 50_000;
const BAGHDAD_DELIVERY = 5_000;

function CheckoutOrderSummaryRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const t = locale === "ar";
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.getTotal());
  const heading = resolveI18n(props.heading_i18n, locale);
  const codNote = resolveI18n(props.cod_note_i18n, locale);

  const delivery =
    items.length === 0 || subtotal >= FREE_DELIVERY_THRESHOLD
      ? 0
      : BAGHDAD_DELIVERY;
  const total = subtotal + delivery;

  return (
    <section className="px-4 py-6">
      <div className={props.sticky ? "lg:sticky lg:top-24" : undefined}>
        <BentoCard bg="cream" size="md" className="p-5 sm:p-6">
          <ScribbleHeading color="pink" className="mb-4">
            {heading}
          </ScribbleHeading>

          {items.length === 0 ? (
            <p className="font-body text-sm text-candy-ink/60">
              {t ? "السلة فارغة." : "Your cart is empty."}
            </p>
          ) : (
            <ul className="space-y-3 mb-4">
              {items.map((item) => (
                <li
                  key={`${item.product_id}-${item.variant_id ?? "default"}`}
                  className="flex items-center gap-3"
                >
                  {props.show_thumbnails && (
                    <div className="w-12 h-12 rounded-xl border-[3px] border-candy-ink bg-white overflow-hidden shrink-0">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-candy-ink/40">
                          <MaterialIcon name="image" className="text-lg" />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-black text-xs uppercase truncate">
                      {item.name}
                    </p>
                    <p className="font-label text-[11px] uppercase tracking-[0.15em] text-candy-ink/60">
                      {t ? "كمية" : "Qty"} {item.quantity}
                      {item.variant_name ? ` · ${item.variant_name}` : ""}
                    </p>
                  </div>
                  <span className="font-display font-black text-sm shrink-0">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="space-y-2 font-body text-sm border-t-[3px] border-dashed border-candy-ink/15 pt-3">
            <div className="flex justify-between">
              <dt className="text-candy-ink/70">
                {t ? "المجموع الفرعي" : "Subtotal"}
              </dt>
              <dd className="font-display font-black">
                {formatPrice(subtotal)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-candy-ink/70">
                {t ? "التوصيل" : "Delivery"}
              </dt>
              <dd className="font-display font-black">
                {delivery === 0
                  ? t
                    ? "مجاني"
                    : "Free"
                  : formatPrice(delivery)}
              </dd>
            </div>
            <div className="flex justify-between pt-2 border-t-[3px] border-dashed border-candy-ink/15">
              <dt className="font-display font-black uppercase">
                {t ? "المجموع" : "Total"}
              </dt>
              <dd
                className="font-display font-black text-xl"
                style={{ color: "var(--bk-primary, #ff4081)" }}
              >
                {formatPrice(total)}
              </dd>
            </div>
          </dl>

          {codNote && (
            <p className="mt-4 font-body text-xs text-candy-ink/75 inline-flex items-center gap-2">
              <MaterialIcon
                name="verified"
                className="text-lg text-candy-pink"
              />
              {codNote}
            </p>
          )}
        </BentoCard>
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
