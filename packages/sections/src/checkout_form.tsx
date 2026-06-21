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

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  resolveI18n,
  IRAQ_GOVERNORATES,
  computeDeliveryFee,
  computeDiscount,
  computeBundleDiscounts,
  computePointsRedemption,
  pixelContentsFromItems,
  normalizeIraqiMobile,
} from "@scheniders/shared";
import { trackPixel, newPixelEventId } from "./helpers/pixels";
import type { StoreConfigV2, GovernorateCode } from "@scheniders/shared";
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
import { useStoreBase } from "./helpers/store-context";
import { isPlausiblePhone, whatsappCartLink } from "./helpers/whatsapp";
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

/** A collision-free idempotency key for one checkout submission. Prefers
 *  crypto.randomUUID (available in the storefront's secure contexts, incl.
 *  localhost); falls back to a timestamp+random string if ever unavailable. */
function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** EC24: the subset of the server's checkout-issue shape the form acts on. */
interface CheckoutIssue {
  product_id: string;
  variant_id: string | null;
  reason: "unavailable" | "price_changed" | "invalid_quantity";
  new_price?: number;
}

function CheckoutFormRender({
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
  const clearCart = useCart((s) => s.clearCart);
  const removeItem = useCart((s) => s.removeItem);
  const updatePrice = useCart((s) => s.updatePrice);
  const setGovernorate = useCart((s) => s.setGovernorate);
  const couponCode = useCart((s) => s.couponCode);
  const base = useStoreBase();
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
  // EC24: a specific, actionable error message (which items changed) instead of
  // a generic "something went wrong" dead-end.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // EC17: one stable idempotency key per cart submission — reused across retries
  // (flaky-3G re-tap where the first response was lost) so the server dedupes,
  // then cleared on success so the next order gets a fresh key.
  const idempotencyKeyRef = useRef<string | null>(null);
  // One Purchase event_id per submission — minted before the POST so the browser
  // pixel and the server CAPI twin share it (dedup); cleared on success.
  const purchaseEventIdRef = useRef<string | null>(null);
  // Loyalty: the customer's balance (fetched by phone) + how many they redeem.
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
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

  // R2b: broadcast the chosen governorate to the cart store so the order-summary
  // section (rendered separately) shows the SAME per-governorate fee as this CTA.
  useEffect(() => {
    setGovernorate(form.governorate_code);
  }, [form.governorate_code, setGovernorate]);

  // Abandoned-cart capture: once the shopper has items + a plausible Iraqi
  // phone, beacon the cart so a WhatsApp recovery nudge can go out if they
  // don't complete. Debounced; best-effort (keepalive) — failures are ignored,
  // and placing the order marks the cart recovered server-side.
  const tenantId = ctx.tenant.id;
  useEffect(() => {
    if (items.length === 0) return;
    const recoveryPhone = normalizeIraqiMobile(form.phone);
    if (!recoveryPhone) return;
    const handle = setTimeout(() => {
      fetch("/api/cart/abandoned", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          tenant_id: tenantId,
          phone: recoveryPhone,
          items: items.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id ?? null,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
          })),
          governorate: form.governorate_code,
          locale,
        }),
      }).catch(() => {
        /* best-effort beacon */
      });
    }, 1500);
    return () => clearTimeout(handle);
  }, [items, form.phone, form.governorate_code, tenantId, locale]);

  // Pixel InitiateCheckout once the cart is on the checkout form (fires once).
  const initiateCheckoutFired = useRef(false);
  useEffect(() => {
    if (initiateCheckoutFired.current || items.length === 0) return;
    initiateCheckoutFired.current = true;
    trackPixel("InitiateCheckout", pixelContentsFromItems(items));
  }, [items]);

  // Per-governorate shipping engine — reads the published shipping config off
  // the tenant + the chosen governorate, so the CTA total matches what the
  // server records (falls back to the legacy flat fee when unconfigured).
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;
  const delivery = computeDeliveryFee(subtotal, items.length, {
    shipping: commerce?.shipping,
    governorate: form.governorate_code as GovernorateCode,
  });
  // Discount: preview the applied coupon (server re-validates + records it).
  const discount = computeDiscount(subtotal, couponCode, commerce?.discounts);
  const couponAmount = discount?.amount_iqd ?? 0;
  const bundleAmount = computeBundleDiscounts(
    items,
    commerce?.bundles,
  ).total_amount_iqd;
  // Loyalty: preview the points redemption (server re-validates vs the
  // authoritative balance + config and records the real discount).
  const loyaltyCfg = commerce?.loyalty;
  const pointsRedemption = computePointsRedemption({
    balance: pointsBalance ?? 0,
    requestedPoints: redeemPoints,
    subtotalIqd: subtotal,
    cfg: loyaltyCfg,
  });
  const pointsDiscount = pointsRedemption.discount_iqd;
  const discountAmount = couponAmount + bundleAmount + pointsDiscount;
  const total = subtotal - discountAmount + delivery;

  // Fetch the customer's points balance once they've entered a valid phone
  // (debounced). Resets the chosen redemption when the phone changes.
  useEffect(() => {
    if (!loyaltyCfg?.enabled) return;
    const recoveryPhone = normalizeIraqiMobile(form.phone);
    if (!recoveryPhone) {
      setPointsBalance(null);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      const params = new URLSearchParams({
        tenant_id: tenantId,
        phone: recoveryPhone,
      });
      fetch(`/api/loyalty/balance?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { balance?: number } | null) => {
          if (active) setPointsBalance(typeof d?.balance === "number" ? d.balance : 0);
        })
        .catch(() => {
          /* balance just won't show */
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [loyaltyCfg?.enabled, form.phone, tenantId]);

  const phone = (ctx.tenant as { contact_phone?: string | null } | undefined)
    ?.contact_phone ?? null;
  const waEnabled = isPlausiblePhone(phone);
  // EC26: the "order via WhatsApp instead" CTA now carries the WHOLE order —
  // every line (with variant + qty), the delivery details the shopper has
  // entered, and the total — so the merchant gets a real order, not a bare ping.
  // Recomputed each render so it reflects the current form state.
  const waGovernorate = IRAQ_GOVERNORATES.find(
    (g) => g.code === form.governorate_code,
  );
  const waHref =
    whatsappCartLink(
      phone,
      {
        items: items.map((i) => ({
          name: i.name,
          variant: i.variant_name,
          quantity: i.quantity,
        })),
        customer: {
          name: form.customer_name || undefined,
          phone: form.phone || undefined,
          governorate:
            (t ? waGovernorate?.name : waGovernorate?.name_en) || undefined,
          area: form.city || undefined,
          address: form.address_details || undefined,
        },
        total: formatPrice(total, locale),
      },
      locale,
    ) ?? "#";

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0 || status === "submitting") return;
    setStatus("submitting");
    setErrorMsg(null);
    // Reuse the existing key on a retry; mint one on the first attempt.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    if (!purchaseEventIdRef.current) {
      purchaseEventIdRef.current = newPixelEventId();
    }
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
          idempotency_key: idempotencyKeyRef.current,
          ...(couponCode ? { coupon_code: couponCode } : {}),
          ...(purchaseEventIdRef.current
            ? { event_id: purchaseEventIdRef.current }
            : {}),
          ...(redeemPoints > 0 ? { redeem_points: redeemPoints } : {}),
          ab_test_arms: ctx.runtime.ab_test_arms,
        }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { orderNumber?: string; total?: number }
          | null;
        const orderNumber = data?.orderNumber ?? "";
        // Stash the just-placed order for the thank-you recap. This is the
        // privacy-safe path (only the buyer's browser holds it) — never fetch
        // an order by number on the public success page (enumeration risk).
        try {
          sessionStorage.setItem(
            "schn:last-order",
            JSON.stringify({
              number: orderNumber,
              items: items.map((i) => ({
                name: i.name,
                variant: i.variant_name ?? null,
                qty: i.quantity,
                price: i.price,
              })),
              subtotal,
              total: data?.total ?? subtotal,
              ts: Date.now(),
            }),
          );
        } catch {
          /* sessionStorage unavailable — the recap just won't render */
        }
        // Pixel Purchase — same event_id the server sent to CAPI (dedup).
        trackPixel(
          "Purchase",
          pixelContentsFromItems(items),
          purchaseEventIdRef.current ?? undefined,
        );
        clearCart();
        // EC17: order placed — retire the key so a future order isn't deduped
        // against this one.
        idempotencyKeyRef.current = null;
        purchaseEventIdRef.current = null;
        setStatus("ok");
        // Navigate to the celebratory thank-you page (full nav keeps the stash).
        window.location.href = `${base}/checkout/success${
          orderNumber ? `?order=${encodeURIComponent(orderNumber)}` : ""
        }`;
      } else {
        // EC24: the server reports WHICH lines failed and why — self-heal the
        // cart (remove unavailable lines, re-price changed ones) so the shopper
        // can review + re-confirm instead of looping on a generic error. A new
        // idempotency key marks the corrected cart as a fresh order.
        const data = (await res.json().catch(() => null)) as
          | { error?: string; issues?: CheckoutIssue[] }
          | null;
        const issues = Array.isArray(data?.issues) ? data!.issues : [];
        for (const it of issues) {
          if (it.reason === "price_changed" && typeof it.new_price === "number") {
            updatePrice(it.product_id, it.variant_id, it.new_price);
          } else {
            removeItem(it.product_id, it.variant_id);
          }
        }
        if (issues.length > 0) idempotencyKeyRef.current = null;
        setErrorMsg(
          data?.error ??
            (t ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Try again."),
        );
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

            {/* Loyalty points redemption */}
            {loyaltyCfg?.enabled && (pointsBalance ?? 0) > 0 && (
              <div
                className="space-y-bk-xs p-bk-sm"
                style={{
                  backgroundColor: "var(--bk-accent, #ffd84a)",
                  border:
                    "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                }}
              >
                <div className="flex items-center justify-between gap-bk-sm">
                  <span className="font-display font-black text-sm uppercase inline-flex items-center gap-2">
                    <MaterialIcon name="loyalty" className="text-xl" />
                    {t
                      ? `لديك ${pointsBalance} نقطة`
                      : `You have ${pointsBalance} points`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRedeemPoints(pointsBalance ?? 0)}
                    className="font-label font-bold text-xs uppercase tracking-wide underline"
                  >
                    {t ? "استخدم الكل" : "Use all"}
                  </button>
                </div>
                <div className="flex items-center gap-bk-sm" dir="ltr">
                  <input
                    type="number"
                    min={0}
                    max={pointsBalance ?? 0}
                    inputMode="numeric"
                    value={redeemPoints || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      setRedeemPoints(Math.min(n, pointsBalance ?? 0));
                    }}
                    className="w-24 bg-white px-3 py-2 font-body text-base focus:outline-none"
                    style={{
                      border:
                        "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                      borderRadius: "var(--bk-radius-input, 0.75rem)",
                    }}
                  />
                  <span className="font-label font-bold text-sm">
                    {pointsDiscount > 0
                      ? t
                        ? `خصم −${formatPrice(pointsDiscount, locale)}`
                        : `−${formatPrice(pointsDiscount, locale)} off`
                      : t
                        ? "أدخل عدد النقاط"
                        : "Enter points to redeem"}
                  </span>
                </div>
              </div>
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
                  {items.length > 0 && (
                    <>
                      {" — "}
                      <bdi>{formatPrice(total, locale)}</bdi>
                    </>
                  )}
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
                  href={waHref}
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
                {errorMsg ??
                  (t
                    ? "حدث خطأ. حاول مرة أخرى."
                    : "Something went wrong. Try again.")}
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
