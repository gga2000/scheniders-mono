// =====================================================================
// Section — checkout_form
// =====================================================================
// Customer details form for checkout: name, phone, governorate, area,
// address, optional email, optional notes, and a payment-method
// selector. Submits to `/api/checkout/orders` — the endpoint lives in
// the storefront API layer.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
  MaterialIcon,
  ScribbleHeading,
} from "./helpers/primitives";
import { useCart } from "./helpers/cart-store";
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

const PAYMENT_LABEL: Record<
  z.infer<typeof paymentMethod>,
  { en: string; ar: string; icon: string }
> = {
  cod: {
    en: "Cash on delivery",
    ar: "الدفع عند الاستلام",
    icon: "payments",
  },
  card: { en: "Card", ar: "بطاقة", icon: "credit_card" },
  fastpay: { en: "FastPay", ar: "FastPay", icon: "bolt" },
};

const GOVERNORATES = [
  "Baghdad",
  "Basra",
  "Erbil",
  "Sulaymaniyah",
  "Duhok",
  "Najaf",
  "Karbala",
  "Babil",
  "Anbar",
  "Ninawa",
  "Kirkuk",
  "Diwaniyah",
  "Wasit",
  "Maysan",
  "Dhi Qar",
  "Muthanna",
  "Saladin",
  "Diyala",
];

function CheckoutFormRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.getTotal());
  const clearCart = useCart((s) => s.clearCart);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "ok" | "error"
  >("idle");
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    email: "",
    governorate_code: GOVERNORATES[0],
    city: "",
    address_details: "",
    notes: "",
    payment_method: props.payment_methods[0] ?? "cod",
  });
  const reassurance = resolveI18n(props.reassurance_text_i18n, locale);
  const t = locale === "ar";

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
          ...form,
          items,
          subtotal,
          locale,
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
    "w-full rounded-xl border-[3px] border-candy-ink bg-white px-3 py-3 font-body text-base focus:outline-none";

  return (
    <section className="px-4 py-6">
      <BentoCard bg="cream" size="md" className="p-5 sm:p-6">
        <ScribbleHeading color="pink" className="mb-4">
          {t ? "تفاصيل الطلب" : "Your details"}
        </ScribbleHeading>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-1">
                {t ? "الاسم الكامل" : "Full name"}
              </span>
              <input
                type="text"
                required
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-1">
                {t ? "رقم الهاتف" : "Phone"}
              </span>
              <input
                type="tel"
                required
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          {props.require_email && (
            <label className="block">
              <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-1">
                {t ? "البريد الإلكتروني" : "Email"}
              </span>
              <input
                type="email"
                required={props.require_email}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={inputCls}
              />
            </label>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-1">
                {t ? "المحافظة" : "Governorate"}
              </span>
              <select
                required
                value={form.governorate_code}
                onChange={(e) => set("governorate_code", e.target.value)}
                className={inputCls}
              >
                {GOVERNORATES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-1">
                {t ? "المنطقة" : "Area"}
              </span>
              <input
                type="text"
                required
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
          <label className="block">
            <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-1">
              {t ? "العنوان بالتفصيل" : "Address details"}
            </span>
            <textarea
              required
              rows={3}
              value={form.address_details}
              onChange={(e) => set("address_details", e.target.value)}
              className={inputCls + " resize-y"}
            />
          </label>
          {(props.require_notes || form.notes) && (
            <label className="block">
              <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-1">
                {t ? "ملاحظات" : "Notes"}{" "}
                {!props.require_notes && (
                  <span className="text-candy-ink/40 normal-case">
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
              />
            </label>
          )}
          {props.payment_methods.length > 1 && (
            <fieldset>
              <legend className="font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-2">
                {t ? "طريقة الدفع" : "Payment method"}
              </legend>
              <div className="flex flex-wrap gap-2">
                {props.payment_methods.map((m) => {
                  const isSelected = form.payment_method === m;
                  return (
                    <button
                      type="button"
                      key={m}
                      onClick={() => set("payment_method", m)}
                      aria-pressed={isSelected}
                      className={
                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl border-[3px] border-candy-ink font-display font-black text-sm uppercase shadow-bento-sm " +
                        (isSelected ? "bg-candy-pink text-white" : "bg-white")
                      }
                    >
                      <MaterialIcon
                        name={PAYMENT_LABEL[m].icon}
                        className="text-lg"
                      />
                      {t ? PAYMENT_LABEL[m].ar : PAYMENT_LABEL[m].en}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {reassurance && (
            <p className="font-body text-sm text-candy-ink/80 inline-flex items-center gap-2">
              <MaterialIcon
                name="verified"
                className="text-xl text-candy-pink"
              />
              {reassurance}
            </p>
          )}
          <ChunkyButton
            type="submit"
            bg="pink"
            size="lg"
            fullWidth
            disabled={items.length === 0 || status === "submitting"}
          >
            {status === "submitting"
              ? "…"
              : t
                ? "تأكيد الطلب"
                : "Place order"}
          </ChunkyButton>
          {status === "ok" && (
            <p className="font-label font-bold text-sm text-candy-ink">
              {t ? "تم استلام طلبك!" : "Order received!"}
            </p>
          )}
          {status === "error" && (
            <p className="font-label font-bold text-sm text-candy-pink">
              {t ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Try again."}
            </p>
          )}
        </form>
      </BentoCard>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "checkout_form",
  category: "page",
  name: { en: "Checkout form", ar: "نموذج الدفع" },
  description: {
    en: "Customer details form (name, phone, governorate, area, address).",
    ar: "نموذج تفاصيل العميل (الاسم، الهاتف، المحافظة، المنطقة، العنوان).",
  },
  thumbnail: "/sections/checkout_form.svg",
  valid_on: ["checkout"],
  schema,
  defaultProps,
  render: CheckoutFormRender,
};

registerSection(definition);
export default definition;
