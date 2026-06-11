// =====================================================================
// Section — checkout_form
// =====================================================================
// Cash-on-delivery checkout in the Candy Bento lockup:
//   • Cart › Details › Confirm step indicator
//   • butter "we'll call you in 30 minutes" reassurance card
//   • delivery-details form (name, +964 phone, governorate, area, address,
//     notes)
//   • glorified COD payment block — mint "Cash on Delivery" selected card
//     + disabled "Coming Soon" card/wallet options
//   • scattered trust pills
//   • totaled primary CTA + cash-on-delivery fine print
//   • "Place order via WhatsApp instead" alternative
// Submits to `/api/checkout/orders`.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n, IRAQ_GOVERNORATES } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
  MaterialIcon,
  ScribbleHeading,
  Sticker,
  TrustPill,
  WhatsAppIcon,
} from "./helpers/primitives";
import { useCart } from "./helpers/cart-store";
import { isPlausiblePhone } from "./helpers/whatsapp";
import { formatPrice } from "./helpers/format";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const paymentMethod = z.enum(["cod", "card", "fastpay"]);

const schema = z.object({
  require_email: z.boolean(),
  require_notes: z.boolean(),
  payment_methods: z.array(paymentMethod),
  reassurance_text_i18n: i18nStringOptional,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  require_email: false,
  require_notes: false,
  payment_methods: ["cod"],
  reassurance_text_i18n: {
    en: "Free inspection on delivery — pay only if you're happy.",
    ar: "فحص مجاني عند الاستلام — لا تدفع إلا إذا أعجبتك القطعة.",
  },
};

/** Same Baghdad threshold / fee as the cart so the CTA total matches. */
const FREE_DELIVERY_THRESHOLD = 75_000;
const BAGHDAD_DELIVERY = 5_000;

function CheckoutFormRender({
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
  const clearCart = useCart((s) => s.clearCart);
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    email: "",
    governorate_code: IRAQ_GOVERNORATES[0].code as string,
    city: "",
    address_details: "",
    notes: "",
    payment_method: props.payment_methods[0] ?? "cod",
  });
  const reassurance = resolveI18n(props.reassurance_text_i18n, locale);

  const delivery =
    items.length === 0 || subtotal >= FREE_DELIVERY_THRESHOLD
      ? 0
      : BAGHDAD_DELIVERY;
  const total = subtotal + delivery;

  const phone = (ctx.tenant as { contact_phone?: string | null } | undefined)
    ?.contact_phone ?? null;
  const waEnabled = isPlausiblePhone(phone);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0 || status === "submitting") return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/checkout/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant_id: ctx.tenant.id,
          ...form,
          items,
          subtotal,
          locale,
          ab_test_arms: ctx.runtime.ab_test_arms,
        }),
      });
      if (res.ok) {
        clearCart();
        setStatus("ok");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const inputCls =
    "w-full bg-white px-3 py-3 font-body text-base focus:outline-none";
  const inputStyle: React.CSSProperties = {
    border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    color: "var(--bk-ink, #1a1a1a)",
    fontFamily: "var(--bk-font-body, inherit)",
  };
  const labelCls =
    "block font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mb-bk-2xs";

  const steps = t
    ? ["السلة", "التفاصيل", "التأكيد"]
    : ["Cart", "Details", "Confirm"];

  return (
    <section className="px-4 py-bk-section-dense">
      <div className="mx-auto max-w-2xl space-y-bk-md">
        {/* Step indicator */}
        <ol className="flex items-center justify-center gap-bk-xs font-label font-bold text-[11px] uppercase tracking-[0.15em]">
          {steps.map((label, i) => {
            const active = i === 1; // "Details" is the current step
            return (
              <li key={label} className="flex items-center gap-bk-xs">
                <span
                  className="px-2.5 py-1"
                  style={
                    active
                      ? {
                          backgroundColor: "var(--bk-accent, #ffd84a)",
                          color: "var(--bk-ink, #1a1a1a)",
                          border:
                            "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                          borderRadius: "var(--bk-radius-pill, 9999px)",
                        }
                      : { color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }
                  }
                >
                  {label}
                </span>
                {i < steps.length - 1 && (
                  <span aria-hidden="true" className="text-bk-ink-faint">
                    ›
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* "We'll call you in 30 minutes" reassurance */}
        <BentoCard bg="butter" size="md" rotate={1} className="p-bk-md">
          <div className="flex items-start gap-3">
            <MaterialIcon name="call" className="text-2xl shrink-0" />
            <div>
              <p className="font-display font-black text-base uppercase leading-tight">
                {t ? "سنتصل بك خلال ٣٠ دقيقة" : "We'll call you within 30 minutes"}
              </p>
              <p
                className="font-body text-sm leading-snug"
                style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}
              >
                {t
                  ? "لتأكيد طلبك. لا حاجة لأي دفع مسبق."
                  : "To confirm your order. No upfront payment needed."}
              </p>
            </div>
          </div>
        </BentoCard>

        <BentoCard bg="cream" size="md" className="p-bk-lg sm:p-bk-xl">
          <ScribbleHeading color="pink" className="mb-bk-md">
            {t ? "تفاصيل التوصيل" : "Delivery Details"}
          </ScribbleHeading>
          <form onSubmit={onSubmit} className="space-y-bk-sm">
            <label className="block">
              <span className={labelCls}>{t ? "الاسم الكامل" : "Full name"}</span>
              <input
                type="text"
                required
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </label>

            {/* Phone with +964 prefix */}
            <label className="block">
              <span className={labelCls}>{t ? "رقم الهاتف" : "Phone number"}</span>
              <div className="flex" dir="ltr">
                <span
                  className="inline-flex items-center px-3 font-display font-black text-base shrink-0"
                  style={{
                    backgroundColor: "var(--bk-accent, #ffd84a)",
                    color: "var(--bk-ink, #1a1a1a)",
                    border:
                      "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                    borderRight: "none",
                    borderRadius:
                      "var(--bk-radius-input, 0.75rem) 0 0 var(--bk-radius-input, 0.75rem)",
                  }}
                >
                  +964
                </span>
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="770 000 0000"
                  pattern="0?7[0-9]{9}"
                  title={
                    t
                      ? "رقم هاتف عراقي صحيح، مثال: 07701234567"
                      : "A valid Iraqi mobile number, e.g. 07701234567"
                  }
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className="w-full bg-white px-3 py-3 font-body text-base focus:outline-none"
                  style={{
                    ...inputStyle,
                    borderRadius:
                      "0 var(--bk-radius-input, 0.75rem) var(--bk-radius-input, 0.75rem) 0",
                  }}
                />
              </div>
            </label>

            {props.require_email && (
              <label className="block">
                <span className={labelCls}>
                  {t ? "البريد الإلكتروني" : "Email"}
                </span>
                <input
                  type="email"
                  required={props.require_email}
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                />
              </label>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-bk-sm">
              <label className="block">
                <span className={labelCls}>{t ? "المحافظة" : "Governorate"}</span>
                <select
                  required
                  value={form.governorate_code}
                  onChange={(e) => set("governorate_code", e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                >
                  {IRAQ_GOVERNORATES.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>{t ? "المنطقة" : "Area / District"}</span>
                <input
                  type="text"
                  required
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                />
              </label>
            </div>

            <label className="block">
              <span className={labelCls}>
                {t ? "العنوان بالتفصيل" : "Full address"}
              </span>
              <textarea
                required
                rows={3}
                placeholder={
                  t ? "الشارع، المحلة، رقم الدار…" : "Street, sector, house number…"
                }
                value={form.address_details}
                onChange={(e) => set("address_details", e.target.value)}
                className={inputCls + " resize-y"}
                style={inputStyle}
              />
            </label>

            {(props.require_notes || form.notes) && (
              <label className="block">
                <span className={labelCls}>
                  {t ? "ملاحظات" : "Delivery notes"}{" "}
                  {!props.require_notes && (
                    <span className="text-bk-ink-faint normal-case">
                      {t ? "(اختياري)" : "(optional)"}
                    </span>
                  )}
                </span>
                <textarea
                  rows={2}
                  required={props.require_notes}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className={inputCls + " resize-y"}
                  style={inputStyle}
                />
              </label>
            )}

            {/* Glorified payment method block */}
            <fieldset className="space-y-bk-xs pt-bk-2xs">
              <legend className="font-display font-black text-base uppercase mb-bk-xs scribble-underline inline-block">
                {t ? "طريقة الدفع" : "Payment Method"}
              </legend>
              {/* COD — always selected hero */}
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  backgroundColor: "var(--bk-mint, #7cf0bd)",
                  color: "var(--bk-ink, #1a1a1a)",
                  border:
                    "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                }}
              >
                <MaterialIcon name="payments" className="text-2xl" />
                <span className="font-display font-black text-base uppercase flex-1">
                  {t ? "الدفع عند الاستلام" : "Cash on Delivery"}
                </span>
                <MaterialIcon name="check_circle" className="text-2xl" />
              </div>
              {/* Coming-soon options */}
              {(
                [
                  { icon: "credit_card", en: "Credit / Debit Card", ar: "بطاقة" },
                  { icon: "account_balance_wallet", en: "FastPay Wallet", ar: "محفظة FastPay" },
                ] as const
              ).map((opt) => (
                <div
                  key={opt.icon}
                  className="relative flex items-center gap-3 px-4 py-3 opacity-60"
                  style={{
                    backgroundColor: "#ffffff",
                    color: "var(--bk-ink, #1a1a1a)",
                    border:
                      "var(--bk-border-thickness, 3px) dashed var(--bk-ink, #1a1a1a)",
                    borderRadius: "var(--bk-radius-input, 0.75rem)",
                  }}
                >
                  <MaterialIcon name={opt.icon} className="text-2xl" />
                  <span className="font-display font-black text-base uppercase">
                    {t ? opt.ar : opt.en}
                  </span>
                  <span className="absolute -top-2 -right-2">
                    <Sticker bg="butter" rotate={6} size="xs">
                      {t ? "قريباً" : "Coming Soon"}
                    </Sticker>
                  </span>
                </div>
              ))}
            </fieldset>

            {/* Trust pills */}
            <div className="-mx-1 flex flex-wrap gap-bk-xs pt-bk-2xs">
              <TrustPill bg="mint" rotate={-1} icon={<MaterialIcon name="verified_user" className="text-base" />}>
                {t ? "طلب آمن" : "Secure Order"}
              </TrustPill>
              <TrustPill bg="butter" rotate={1} icon={<MaterialIcon name="cached" className="text-base" />}>
                {t ? "إرجاع خلال ٧ أيام" : "7-day Returns"}
              </TrustPill>
              <TrustPill bg="sky" rotate={-1} icon={<MaterialIcon name="storefront" className="text-base" />}>
                {t ? "بائع موثّق" : "Verified Seller"}
              </TrustPill>
              <TrustPill bg="lilac" rotate={1} icon={<MaterialIcon name="support_agent" className="text-base" />}>
                {t ? "دعم واتساب ٢٤/٧" : "24/7 WhatsApp"}
              </TrustPill>
            </div>

            {reassurance && (
              <p className="font-body text-sm text-bk-ink-soft inline-flex items-center gap-2">
                <MaterialIcon name="visibility" className="text-xl text-bk-primary" />
                {reassurance}
              </p>
            )}

            {/* Primary CTA with running total */}
            <ChunkyButton
              type="submit"
              bg="pink"
              size="lg"
              fullWidth
              disabled={items.length === 0 || status === "submitting"}
            >
              {status === "submitting" ? (
                <MaterialIcon name="progress_activity" className="animate-spin" />
              ) : (
                <>
                  {t ? "أكّد الطلب" : "Place Order"}
                  {items.length > 0 && ` — ${formatPrice(total)}`}
                  <MaterialIcon name="arrow_forward" />
                </>
              )}
            </ChunkyButton>
            <p className="text-center font-body text-xs text-bk-ink-soft">
              {t
                ? "بتأكيدك الطلب، توافق على الدفع نقداً عند الاستلام. لا رسوم خفية."
                : "By placing this order, you agree to pay cash on delivery. No hidden fees."}
            </p>

            {/* WhatsApp alternative */}
            {waEnabled && (
              <>
                <div className="my-bk-2xs flex items-center gap-bk-sm">
                  <span className="h-[3px] flex-1 bg-candy-ink/20" />
                  <span className="font-display font-black text-sm uppercase text-bk-ink-soft">
                    {t ? "أو" : "Or"}
                  </span>
                  <span className="h-[3px] flex-1 bg-candy-ink/20" />
                </div>
                <a
                  href={`https://wa.me/${phone!.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 px-5 py-3 font-display font-black text-sm uppercase tracking-tight"
                  style={{
                    backgroundColor: "#ffffff",
                    color: "var(--bk-ink, #1a1a1a)",
                    border:
                      "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                    borderRadius: "var(--bk-radius-input, 0.75rem)",
                    boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                  }}
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  {t ? "أكمل الطلب عبر واتساب" : "Place order via WhatsApp instead"}
                </a>
              </>
            )}

            {status === "ok" && (
              <p className="font-label font-bold text-sm text-bk-success">
                {t ? "تم استلام طلبك!" : "Order received!"}
              </p>
            )}
            {status === "error" && (
              <p className="font-label font-bold text-sm text-bk-danger">
                {t ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Try again."}
              </p>
            )}
          </form>
        </BentoCard>
      </div>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "checkout_form",
  category: "page",
  name: { en: "Checkout form", ar: "نموذج الدفع" },
  description: {
    en: "Cash-on-delivery checkout: details form, glorified COD, trust pills, totaled CTA.",
    ar: "نموذج الدفع عند الاستلام: تفاصيل التوصيل، الدفع عند الاستلام، شارات الثقة، زر التأكيد بالمجموع.",
  },
  thumbnail: "/sections/checkout_form.svg",
  valid_on: ["checkout"],
  schema,
  defaultProps,
  render: CheckoutFormRender,
};

registerSection(definition);
export default definition;
