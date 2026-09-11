// =====================================================================
// Section — order_confirmation
// =====================================================================
// The thank-you page lead (P0-4): "order received" eyebrow, thanks
// heading, the order number in a copyable <code>, the honest "we'll call
// you to confirm" line (no invented minutes), three what-happens-next
// steps, an optional delivery ETA (merchant-authored — never a computed
// date), a WhatsApp button prefilled with the order number, a track link
// and a continue-shopping link. Everything is --bk-* token driven.
//
// Order number source: `ctx.runtime.order_number` (the success route
// copies `?order=` into the runtime); when absent — a direct visit or a
// stripped query — the client falls back to the `schn:last-order` stash
// that checkout_form / pdp_direct_order write on success. The same stash
// feeds the privacy-safe item recap: only the buyer's own browser holds
// it, so this section never fetches an order by number (enumeration).
//
// Pixels: the Purchase event fires in checkout_form / pdp_direct_order
// right before the redirect (paired with the server CAPI event id), so
// this section deliberately fires nothing — a second event would double
// count every order.
// =====================================================================

import { z } from "zod";
import { i18nStringOptional, i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { OrderConfirmationRender } from "./order_confirmation.client";

/* ─── Props ─────────────────────────────────────────────────────────── */

const stepSchema = z.object({
  title_i18n: i18nStringSchema,
  body_i18n: i18nStringOptional,
});

const schema = z.object({
  eyebrow_i18n: i18nStringSchema,
  heading_i18n: i18nStringSchema,
  /** Personal variant of the heading; `{name}` is replaced with the buyer's
   *  name from the session stash. Falls back to `heading_i18n` when the
   *  name is unknown or the merchant leaves the token out. Additive
   *  (`.default`) so stored configs without it keep parsing. */
  heading_named_i18n: i18nStringSchema.default({
    ar: "شكراً {name}",
    en: "Thanks, {name}",
  }),
  /** Neutral confirmation promise — no minutes, no SLA the merchant
   *  cannot keep. */
  call_promise_i18n: i18nStringSchema,
  order_label_i18n: i18nStringSchema,
  copy_label_i18n: i18nStringSchema,
  copied_label_i18n: i18nStringSchema,
  steps_heading_i18n: i18nStringSchema,
  steps: z.array(stepSchema).min(1).max(5),
  /** Delivery window as the merchant states it ("٢–٤ أيام عمل"). Hidden
   *  when unset — the section never fabricates a date. */
  eta_i18n: i18nStringOptional,
  eta_label_i18n: i18nStringSchema,
  whatsapp_label_i18n: i18nStringSchema,
  /** `{order}` is replaced with the order number (dropped when unknown). */
  whatsapp_message_i18n: i18nStringSchema,
  track_label_i18n: i18nStringSchema,
  continue_label_i18n: i18nStringSchema,
  recap_heading_i18n: i18nStringSchema,
  total_label_i18n: i18nStringSchema,
  /** Item recap from the buyer's own session stash. */
  show_order_recap: z.boolean(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { ar: "تم استلام طلبك", en: "Order received" },
  heading_i18n: { ar: "شكراً لك على طلبك", en: "Thank you for your order" },
  heading_named_i18n: { ar: "شكراً {name}", en: "Thanks, {name}" },
  call_promise_i18n: {
    ar: "سنتصل بك لتأكيد الطلب والعنوان قبل الشحن.",
    en: "We'll call you to confirm your order and address before shipping.",
  },
  order_label_i18n: { ar: "رقم الطلب", en: "Order number" },
  copy_label_i18n: { ar: "نسخ", en: "Copy" },
  copied_label_i18n: { ar: "تم النسخ", en: "Copied" },
  steps_heading_i18n: { ar: "ماذا يحدث الآن؟", en: "What happens next" },
  steps: [
    {
      title_i18n: { ar: "نتصل بك للتأكيد", en: "We call to confirm" },
      body_i18n: {
        ar: "نراجع معك الطلب والعنوان.",
        en: "We double-check your order and address with you.",
      },
    },
    {
      title_i18n: { ar: "نجهّز طلبك", en: "We prepare your order" },
      body_i18n: {
        ar: "يُغلّف طلبك بعناية ويُسلّم للمندوب.",
        en: "Your order is packed with care and handed to the courier.",
      },
    },
    {
      title_i18n: {
        ar: "تستلم وتدفع عند الباب",
        en: "You receive and pay at the door",
      },
      body_i18n: {
        ar: "افحص طلبك ثم ادفع للمندوب نقداً.",
        en: "Check your order, then pay the courier in cash.",
      },
    },
  ],
  eta_label_i18n: { ar: "موعد التوصيل المتوقع", en: "Estimated delivery" },
  whatsapp_label_i18n: {
    ar: "تواصل معنا عبر واتساب",
    en: "Message us on WhatsApp",
  },
  whatsapp_message_i18n: {
    ar: "مرحباً! عندي استفسار عن طلبي رقم {order}",
    en: "Hi! I have a question about my order {order}",
  },
  track_label_i18n: { ar: "تتبّع طلبك", en: "Track your order" },
  continue_label_i18n: { ar: "متابعة التسوّق", en: "Continue shopping" },
  recap_heading_i18n: { ar: "ملخّص طلبك", en: "Your order" },
  total_label_i18n: { ar: "المجموع", en: "Total" },
  show_order_recap: true,
};

const definition: SectionDefinition<Props> = {
  type: "order_confirmation",
  category: "conversion",
  name: { en: "Order confirmation", ar: "تأكيد الطلب" },
  description: {
    en: "Thank-you lead: order number, call promise, next steps, WhatsApp and tracking.",
    ar: "مقدمة صفحة الشكر: رقم الطلب، وعد الاتصال، الخطوات التالية، واتساب والتتبّع.",
  },
  thumbnail: "/sections/order_confirmation.svg",
  valid_on: ["checkout_success"],
  schema,
  defaultProps,
  render: OrderConfirmationRender,
};

registerSection(definition);
export default definition;
