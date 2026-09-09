// =====================================================================
// Section — checkout_form
// =====================================================================
// Cash-on-delivery checkout:
//   • Cart › Details › Confirm step indicator
//   • "we'll call to confirm" reassurance callout (copy is a prop — no
//     hardcoded minutes the merchant can't keep)
//   • delivery-details form (name, +964 phone, governorate, area, address,
//     notes) with autocomplete + Iraqi-mobile validation
//   • COD payment block — the only method a COD store has; no "coming
//     soon" placeholders
//   • trust pills (returns window read from the tenant's commerce config)
//   • totaled primary CTA + cash-on-delivery fine print
//   • "Place order via WhatsApp instead" alternative
// Submits to `/api/checkout/orders`. Every fill/border/radius/shadow is a
// `--bk-*` token so any brand kit renders it as its own.
// =====================================================================
// Client half of `checkout_form` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./checkout_form.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  resolveI18n,
  IRAQ_GOVERNORATES,
  governorateLabel,
  computeDeliveryFee,
  computeDiscount,
  computeBundleDiscounts,
  computePointsRedemption,
  pixelContentsFromItems,
  isValidIraqiMobile,
  normalizeIraqiMobile,
  computePointsEarned,
  formatPoints,
} from "@scheniders/shared";
import { trackPixel, newPixelEventId } from "./helpers/pixels";
import {
  clearCustomerMemory,
  prefillFromMemory,
  readCustomerMemory,
  writeCustomerMemory,
} from "./helpers/customer-memory";
import type { StoreConfigV2, GovernorateCode, LocaleCode } from "@scheniders/shared";
import { CenteredSectionHeader, ChunkyButton, MaterialIcon, WhatsAppButton } from "./helpers/primitives";
import { useCart } from "./helpers/cart-store";
import { useStoreBase } from "./helpers/store-context";
import { isPlausiblePhone, whatsappCartLink } from "./helpers/whatsapp";
import { formatCount, formatPrice } from "./helpers/format";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./checkout_form";

/** Chrome strings (Kurdish resolves through the ar fallback chain). */
const STRINGS = {
  stepCart: { en: "Cart", ar: "السلة" },
  stepDetails: { en: "Details", ar: "التفاصيل" },
  stepConfirm: { en: "Confirm", ar: "التأكيد" },
  deliveryDetails: { en: "Delivery details", ar: "تفاصيل التوصيل" },
  fullName: { en: "Full name", ar: "الاسم الكامل" },
  phone: { en: "Phone number", ar: "رقم الهاتف" },
  phoneInvalid: {
    en: "Enter a valid Iraqi mobile number, e.g. 0770 123 4567.",
    ar: "أدخل رقم هاتف عراقي صحيح، مثال: 0770 123 4567.",
  },
  welcomeBack: { en: "Welcome back — we filled in your details from your last order.", ar: "رجعتلنا؟ عبّينا معلوماتك من آخر طلب." },
  notYou: { en: "Not you? Clear", ar: "مو انت؟ امسح" },
  email: { en: "Email", ar: "البريد الإلكتروني" },
  governorate: { en: "Governorate", ar: "المحافظة" },
  governoratePlaceholder: { en: "Choose a governorate", ar: "اختر المحافظة" },
  area: { en: "Area / District", ar: "المنطقة" },
  address: { en: "Full address", ar: "العنوان بالتفصيل" },
  addressPlaceholder: {
    en: "Street, sector, house number…",
    ar: "الشارع، المحلة، رقم الدار…",
  },
  notes: { en: "Delivery notes", ar: "ملاحظات" },
  optional: { en: "(optional)", ar: "(اختياري)" },
  paymentMethod: { en: "Payment method", ar: "طريقة الدفع" },
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
  useAll: { en: "Use all", ar: "استخدم الكل" },
  earnOnDelivery: { en: "Earn {points} when it is delivered", ar: "تكسب {points} لما يوصلك الطلب" },
  enterPoints: { en: "Enter points to redeem", ar: "أدخل عدد النقاط" },
  placeOrder: { en: "Place order", ar: "أكّد الطلب" },
  placingOrder: { en: "Placing your order…", ar: "جارٍ تأكيد الطلب…" },
  finePrint: {
    en: "By placing this order, you agree to pay cash on delivery. No hidden fees.",
    ar: "بتأكيدك الطلب، توافق على الدفع نقداً عند الاستلام. لا رسوم خفية.",
  },
  or: { en: "Or", ar: "أو" },
  whatsappInstead: {
    en: "Place order via WhatsApp instead",
    ar: "أكمل الطلب عبر واتساب",
  },
  orderReceived: { en: "Order received!", ar: "تم استلام طلبك!" },
  errGeneric: {
    en: "Something went wrong. Please try again.",
    ar: "حدث خطأ. حاول مرة أخرى.",
  },
  errNetwork: {
    en: "We couldn't reach the server — check your connection and try again.",
    ar: "تعذّر الاتصال بالخادم — تحقّق من الإنترنت وحاول مرة أخرى.",
  },
  errReview: {
    en: "Your cart was updated. Please review it and confirm again.",
    ar: "تم تحديث سلتك. راجعها ثم أكّد الطلب مرة أخرى.",
  },
} as const;

function returnsPill(days: number, locale: LocaleCode): string {
  return locale === "en"
    ? formatCount(days, locale, {
        one: "{count}-day returns",
        other: "{count}-day returns",
      })
    : formatCount(days, locale, {
        one: "إرجاع خلال يوم واحد",
        two: "إرجاع خلال يومين",
        few: "إرجاع خلال {count} أيام",
        many: "إرجاع خلال {count} يوماً",
        other: "إرجاع خلال {count} يوم",
      });
}

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

/** One human sentence per server issue, using the cart's own line names
 *  (the server only echoes ids) and the old → new price where it moved. */
function describeIssue(
  issue: CheckoutIssue,
  line:
    | { name: string; variant_name: string | null; price: number }
    | undefined,
  locale: LocaleCode,
): string {
  const en = locale === "en";
  const name = line
    ? line.variant_name
      ? `${line.name} (${line.variant_name})`
      : line.name
    : en
      ? "An item"
      : "أحد المنتجات";
  if (issue.reason === "price_changed" && typeof issue.new_price === "number") {
    const from = line ? formatPrice(line.price, locale) : null;
    const to = formatPrice(issue.new_price, locale);
    return en
      ? `${name}: price changed${from ? ` from ${from}` : ""} to ${to}.`
      : `${name}: تغيّر السعر${from ? ` من ${from}` : ""} إلى ${to}.`;
  }
  if (issue.reason === "invalid_quantity") {
    return en
      ? `${name}: that quantity isn't available — it was removed from your cart.`
      : `${name}: الكمية غير متاحة — تمت إزالته من السلة.`;
  }
  return en
    ? `${name} is no longer available — it was removed from your cart.`
    : `${name} لم يعد متوفراً — تمت إزالته من السلة.`;
}

const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";
const ACCENT_TINT =
  "color-mix(in srgb, var(--bk-accent, #ffd84a) 16%, transparent)";

export function CheckoutFormRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale: LocaleCode = ctx.runtime.locale;
  const t = locale !== "en";
  const s = (key: keyof typeof STRINGS) => resolveI18n(STRINGS[key], locale);
  const items = useCart((st) => st.items);
  const subtotal = useCart((st) => st.getTotal());
  const clearCart = useCart((st) => st.clearCart);
  const removeItem = useCart((st) => st.removeItem);
  const updatePrice = useCart((st) => st.updatePrice);
  const setGovernorate = useCart((st) => st.setGovernorate);
  const couponCode = useCart((st) => st.couponCode);
  const base = useStoreBase();
  const phoneErrorId = useId();
  const submitErrorId = useId();
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
  // EC24: specific, actionable error lines (which items changed and how)
  // instead of a generic "something went wrong" dead-end.
  const [errorLines, setErrorLines] = useState<string[]>([]);
  // Phone is validated on blur (not with an HTML `pattern`) so the shopper
  // gets a readable, localised message instead of the browser's tooltip.
  const [phoneError, setPhoneError] = useState(false);
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
  const tenantId = ctx.tenant.id;
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    email: "",
    // Empty until chosen: a pre-selected Baghdad silently shipped orders to
    // the wrong governorate (and priced the wrong fee) when shoppers skipped
    // the field.
    governorate_code: "",
    city: "",
    address_details: "",
    notes: "",
    payment_method: "cod" as const,
  });

  // A returning shopper's details, from THIS browser only — see
  // helpers/customer-memory for why nothing is looked up by phone. Applied
  // after mount so server HTML and first client render agree; only blank
  // fields are filled.
  const [recognised, setRecognised] = useState(false);
  useEffect(() => {
    const memory = readCustomerMemory(tenantId);
    if (!memory) return;
    setForm((prev) => prefillFromMemory(prev, memory).next);
    setRecognised(true);
  }, [tenantId]);
  function forgetMe(): void {
    clearCustomerMemory(tenantId);
    setRecognised(false);
    setForm((prev) => ({
      ...prev,
      customer_name: "",
      phone: "",
      governorate_code: "",
      city: "",
      address_details: "",
    }));
  }
  const reassurance = resolveI18n(props.reassurance_text_i18n, locale);
  const callPromise = resolveI18n(props.call_promise_i18n, locale);
  const callPromiseNote = resolveI18n(props.call_promise_note_i18n, locale);

  // R2b: broadcast the chosen governorate to the cart store so the order-summary
  // section (rendered separately) shows the SAME per-governorate fee as this CTA.
  useEffect(() => {
    setGovernorate(form.governorate_code || null);
  }, [form.governorate_code, setGovernorate]);

  // Abandoned-cart capture: once the shopper has items + a plausible Iraqi
  // phone, beacon the cart so a WhatsApp recovery nudge can go out if they
  // don't complete. Debounced; best-effort (keepalive) — failures are ignored,
  // and placing the order marks the cart recovered server-side.
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
    governorate: (form.governorate_code || undefined) as
      | GovernorateCode
      | undefined,
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
  // Credited by the database on delivery, never at placement.
  const pointsToEarn = computePointsEarned(subtotal, loyaltyCfg);
  const discountAmount = couponAmount + bundleAmount + pointsDiscount;
  const total = subtotal - discountAmount + delivery;
  const returnsDays = commerce?.returns_policy?.window_days;

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
          if (active)
            setPointsBalance(typeof d?.balance === "number" ? d.balance : 0);
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

  const phone =
    (ctx.tenant as { contact_phone?: string | null } | undefined)
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
    setForm((st) => ({ ...st, [k]: v }));
  }

  function validatePhone(): boolean {
    const ok = isValidIraqiMobile(form.phone);
    setPhoneError(!ok);
    return ok;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0 || status === "submitting") return;
    if (!validatePhone()) return;
    setStatus("submitting");
    setErrorLines([]);
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
          // The server's `email` is `z.string().email().optional()` — an
          // empty string fails the format check (zod 4), so the field must
          // be ABSENT when the shopper leaves it blank.
          ...(form.email.trim() === "" ? { email: undefined } : {}),
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
        const data = (await res.json().catch(() => null)) as {
          orderNumber?: string;
          /** The order's id — proof of ownership for the post-purchase upsell. */
          orderId?: string;
          total?: number;
        } | null;
        const orderNumber = data?.orderNumber ?? "";
        // Remember the shopper for next time — in their browser only.
        writeCustomerMemory(tenantId, {
          customer_name: form.customer_name.trim(),
          phone: form.phone.trim(),
          governorate_code: form.governorate_code,
          city: form.city.trim() || undefined,
          address_details: form.address_details.trim(),
        });
        // Stash the just-placed order for the thank-you recap. This is the
        // privacy-safe path (only the buyer's browser holds it) — never fetch
        // an order by number on the public success page (enumeration risk).
        try {
          sessionStorage.setItem(
            "schn:last-order",
            JSON.stringify({
              number: orderNumber,
              // Order id + phone let the thank-you page prove to the upsell
              // endpoint that this browser placed the order. Additive: older
              // readers of the stash ignore them.
              order_id: data?.orderId ?? null,
              phone: normalizeIraqiMobile(form.phone) ?? null,
              // Lets the thank-you page greet the buyer by name; optional so
              // older readers of the stash keep working unchanged.
              customer_name: form.customer_name.trim(),
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
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          issues?: CheckoutIssue[];
        } | null;
        const reported = data?.issues;
        const issues = Array.isArray(reported) ? reported : [];
        // Describe before mutating: once a line is removed its name is gone.
        const lines = issues.map((it) =>
          describeIssue(
            it,
            items.find(
              (i) =>
                i.product_id === it.product_id &&
                (i.variant_id ?? null) === (it.variant_id ?? null),
            ),
            locale,
          ),
        );
        for (const it of issues) {
          if (
            it.reason === "price_changed" &&
            typeof it.new_price === "number"
          ) {
            updatePrice(it.product_id, it.variant_id, it.new_price);
          } else {
            removeItem(it.product_id, it.variant_id);
          }
        }
        if (issues.length > 0) {
          idempotencyKeyRef.current = null;
          setErrorLines([s("errReview"), ...lines]);
        } else {
          // The server's own messages are Arabic; show them to Arabic-script
          // locales and the localised generic line to English readers.
          setErrorLines([(t && data?.error) || s("errGeneric")]);
        }
        setStatus("error");
      }
    } catch {
      // fetch() only throws on network failure — nothing was submitted.
      setErrorLines([s("errNetwork")]);
      setStatus("error");
    }
  }

  const inputCls =
    "w-full px-3 py-3 font-body text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";
  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--bk-surface, #ffffff)",
    border: INK_BORDER,
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    color: "var(--bk-ink, #1a1a1a)",
  };
  const labelCls =
    "block font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft mb-bk-2xs";

  const steps = [s("stepCart"), s("stepDetails"), s("stepConfirm")];
  const submitting = status === "submitting";
  const pills = [
    ...(props.trust_pills ?? []).map((p) => ({
      label: resolveI18n(p.label_i18n, locale),
      icon: p.icon,
    })),
    ...(returnsDays && returnsDays > 0
      ? [{ label: returnsPill(returnsDays, locale), icon: "cached" }]
      : []),
  ];

  return (
    <section className="px-4 py-bk-section-dense">
      <div className="mx-auto max-w-2xl space-y-bk-md">
        {/* Step indicator */}
        <ol className="flex items-center justify-center gap-bk-xs font-label font-bold text-[11px] bk-caps tracking-[0.15em]">
          {steps.map((label, i) => {
            const active = i === 1; // "Details" is the current step
            return (
              <li key={label} className="flex items-center gap-bk-xs">
                <span
                  className="px-2.5 py-1"
                  aria-current={active ? "step" : undefined}
                  style={
                    active
                      ? {
                          backgroundColor: "var(--bk-accent, #ffd84a)",
                          color: "var(--bk-on-accent, #1a1a1a)",
                          border: INK_BORDER,
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

        {/* "We'll call to confirm" reassurance callout */}
        {callPromise && (
          <div
            className="flex items-start gap-3 p-bk-md"
            style={{
              backgroundColor: ACCENT_TINT,
              color: "var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-card, 1rem)",
            }}
          >
            <MaterialIcon name="call" className="text-2xl shrink-0" />
            <div>
              <p
                className="font-display font-black text-base leading-tight"
                data-i18n-field="call_promise_i18n"
              >
                {callPromise}
              </p>
              {callPromiseNote && (
                <p
                  className="font-body text-sm leading-snug text-bk-ink-soft"
                  data-i18n-field="call_promise_note_i18n"
                >
                  {callPromiseNote}
                </p>
              )}
            </div>
          </div>
        )}

        <div
          className="p-bk-lg sm:p-bk-xl"
          style={{
            backgroundColor: "var(--bk-surface, #ffffff)",
            color: "var(--bk-ink, #1a1a1a)",
            border: INK_BORDER,
            borderRadius: "var(--bk-radius-card, 1rem)",
            boxShadow: "var(--bk-shadow-card, 4px 4px 0px 0px #1a1a1a)",
          }}
        >
          <CenteredSectionHeader
            // The checkout page has no other heading, so this is its h1.
            as="h1"
            align="start"
            title={s("deliveryDetails")}
            className="mb-bk-md"
          />
          <form onSubmit={onSubmit} className="space-y-bk-sm">
            {recognised && (
              <p data-testid="welcome-back" className="flex items-center justify-between gap-bk-xs rounded-bk-input bg-bk-decor-a/40 px-3 py-2 text-xs sm:text-sm text-bk-ink">
                <span className="inline-flex items-center gap-1.5">
                  <MaterialIcon name="waving_hand" className="text-sm" />
                  {s("welcomeBack")}
                </span>
                <button
                  type="button"
                  onClick={forgetMe}
                  className="shrink-0 font-semibold underline underline-offset-2"
                >
                  {s("notYou")}
                </button>
              </p>
            )}
            <label className="block">
              <span className={labelCls}>{s("fullName")}</span>
              <input
                type="text"
                name="name"
                autoComplete="name"
                required
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </label>

            {/* Phone with +964 prefix */}
            <div>
              <label className="block">
                <span className={labelCls}>{s("phone")}</span>
                <div className="flex" dir="ltr">
                  <span
                    className="inline-flex items-center px-3 font-display font-black text-base shrink-0"
                    style={{
                      backgroundColor: ACCENT_TINT,
                      color: "var(--bk-ink, #1a1a1a)",
                      border: INK_BORDER,
                      borderRight: "none",
                      borderRadius:
                        "var(--bk-radius-input, 0.75rem) 0 0 var(--bk-radius-input, 0.75rem)",
                    }}
                  >
                    +964
                  </span>
                  <input
                    type="tel"
                    name="phone"
                    required
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="770 000 0000"
                    value={form.phone}
                    onChange={(e) => {
                      set("phone", e.target.value);
                      if (phoneError) setPhoneError(false);
                    }}
                    onBlur={() => {
                      if (form.phone.trim() !== "") validatePhone();
                    }}
                    aria-invalid={phoneError || undefined}
                    aria-describedby={phoneError ? phoneErrorId : undefined}
                    className={inputCls}
                    style={{
                      ...inputStyle,
                      borderRadius:
                        "0 var(--bk-radius-input, 0.75rem) var(--bk-radius-input, 0.75rem) 0",
                      ...(phoneError
                        ? { borderColor: "var(--bk-danger, #dc2626)" }
                        : {}),
                    }}
                  />
                </div>
              </label>
              {phoneError && (
                <p
                  id={phoneErrorId}
                  role="alert"
                  className="mt-bk-2xs font-label font-bold text-xs text-bk-danger"
                >
                  {s("phoneInvalid")}
                </p>
              )}
            </div>

            {props.require_email && (
              <label className="block">
                <span className={labelCls}>{s("email")}</span>
                <input
                  type="email"
                  name="email"
                  inputMode="email"
                  autoComplete="email"
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
                <span className={labelCls}>{s("governorate")}</span>
                <select
                  name="governorate"
                  autoComplete="address-level1"
                  required
                  value={form.governorate_code}
                  onChange={(e) => set("governorate_code", e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                >
                  <option value="" disabled>
                    {s("governoratePlaceholder")}
                  </option>
                  {IRAQ_GOVERNORATES.map((g) => (
                    <option key={g.code} value={g.code}>
                      {governorateLabel(g.code, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>{s("area")}</span>
                <input
                  type="text"
                  name="city"
                  autoComplete="address-level2"
                  required
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                />
              </label>
            </div>

            <label className="block">
              <span className={labelCls}>{s("address")}</span>
              <textarea
                name="address"
                autoComplete="street-address"
                required
                rows={3}
                placeholder={s("addressPlaceholder")}
                value={form.address_details}
                onChange={(e) => set("address_details", e.target.value)}
                className={inputCls + " resize-y"}
                style={inputStyle}
              />
            </label>

            {(props.require_notes || form.notes) && (
              <label className="block">
                <span className={labelCls}>
                  {s("notes")}{" "}
                  {!props.require_notes && (
                    <span className="text-bk-ink-faint normal-case">
                      {s("optional")}
                    </span>
                  )}
                </span>
                <textarea
                  name="notes"
                  rows={2}
                  required={props.require_notes}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className={inputCls + " resize-y"}
                  style={inputStyle}
                />
              </label>
            )}

            {/* Payment method — COD is the only option on a COD store, shown
                as the selected state so the shopper sees what happens next. */}
            <fieldset className="space-y-bk-xs pt-bk-2xs">
              <legend className="font-display font-black text-base bk-caps mb-bk-xs">
                {s("paymentMethod")}
              </legend>
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--bk-success, #7cf0bd) 18%, transparent)",
                  color: "var(--bk-ink, #1a1a1a)",
                  border: INK_BORDER,
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                }}
              >
                <MaterialIcon name="payments" className="text-2xl" />
                <span className="font-display font-black text-base bk-caps flex-1">
                  {s("cod")}
                </span>
                <MaterialIcon
                  name="check_circle"
                  className="text-2xl text-bk-success"
                />
              </div>
            </fieldset>

            {/* Trust pills */}
            {pills.length > 0 && (
              <ul className="-mx-1 flex flex-wrap gap-bk-xs pt-bk-2xs">
                {pills.map((pill) => (
                  <li
                    key={pill.label}
                    className="inline-flex items-center gap-2 px-3 py-1.5 font-label font-bold text-xs bk-caps"
                    style={{
                      backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
                      color: "var(--bk-ink, #1a1a1a)",
                      border: INK_BORDER,
                      borderRadius: "var(--bk-radius-pill, 9999px)",
                    }}
                  >
                    {pill.icon && (
                      <MaterialIcon name={pill.icon} className="text-base" />
                    )}
                    {pill.label}
                  </li>
                ))}
              </ul>
            )}

            {reassurance && (
              <p
                className="font-body text-sm text-bk-ink-soft inline-flex items-center gap-2"
                data-i18n-field="reassurance_text_i18n"
              >
                <MaterialIcon
                  name="visibility"
                  className="text-xl text-bk-primary"
                />
                {reassurance}
              </p>
            )}

            {pointsToEarn > 0 && (
              <p
                data-points-to-earn={pointsToEarn}
                className="inline-flex items-center gap-1.5 font-body text-sm text-bk-ink-soft"
              >
                <MaterialIcon name="loyalty" className="text-base" />
                {s("earnOnDelivery").replace("{points}", formatPoints(pointsToEarn, locale))}
              </p>
            )}

            {/* Loyalty points redemption */}
            {loyaltyCfg?.enabled && (pointsBalance ?? 0) > 0 && (
              <div
                className="space-y-bk-xs p-bk-sm"
                style={{
                  backgroundColor: ACCENT_TINT,
                  border: INK_BORDER,
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                }}
              >
                <div className="flex items-center justify-between gap-bk-sm">
                  <span className="font-display font-black text-sm bk-caps inline-flex items-center gap-2 tabular-nums">
                    <MaterialIcon name="loyalty" className="text-xl" />
                    {t
                      ? `لديك ${pointsBalance} نقطة`
                      : `You have ${pointsBalance} points`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRedeemPoints(pointsBalance ?? 0)}
                    className="min-h-11 font-label font-bold text-xs bk-caps underline"
                  >
                    {s("useAll")}
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
                      const n = Math.max(
                        0,
                        Math.floor(Number(e.target.value) || 0),
                      );
                      setRedeemPoints(Math.min(n, pointsBalance ?? 0));
                    }}
                    className="w-24 px-3 py-2 font-body text-base tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
                    style={inputStyle}
                  />
                  <span className="font-label font-bold text-sm tabular-nums">
                    {pointsDiscount > 0
                      ? t
                        ? `خصم −${formatPrice(pointsDiscount, locale)}`
                        : `−${formatPrice(pointsDiscount, locale)} off`
                      : s("enterPoints")}
                  </span>
                </div>
              </div>
            )}

            {/* Primary CTA with running total. Stays focusable while pending
                (aria-busy/aria-disabled) so focus isn't dropped mid-submit. */}
            <ChunkyButton
              type="submit"
              bg="pink"
              size="lg"
              fullWidth
              disabled={items.length === 0}
              aria-busy={submitting || undefined}
              aria-disabled={submitting || undefined}
              aria-describedby={
                status === "error" && errorLines.length > 0
                  ? submitErrorId
                  : undefined
              }
            >
              {submitting ? (
                <>
                  <MaterialIcon
                    name="progress_activity"
                    className="animate-spin motion-reduce:animate-none"
                  />
                  {s("placingOrder")}
                </>
              ) : (
                <>
                  {s("placeOrder")}
                  {items.length > 0 && (
                    <>
                      {" — "}
                      <bdi className="tabular-nums">
                        {formatPrice(total, locale)}
                      </bdi>
                    </>
                  )}
                  <MaterialIcon name="arrow_forward" />
                </>
              )}
            </ChunkyButton>
            <p className="text-center font-body text-xs text-bk-ink-soft">
              {s("finePrint")}
            </p>

            {/* WhatsApp alternative */}
            {waEnabled && (
              <>
                <div className="my-bk-2xs flex items-center gap-bk-sm">
                  <span
                    aria-hidden="true"
                    className="flex-1"
                    style={{
                      height: "var(--bk-border-thickness, 3px)",
                      backgroundColor:
                        "var(--bk-divider, rgb(26 26 26 / 0.15))",
                    }}
                  />
                  <span className="font-display font-black text-sm bk-caps text-bk-ink-soft">
                    {s("or")}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex-1"
                    style={{
                      height: "var(--bk-border-thickness, 3px)",
                      backgroundColor:
                        "var(--bk-divider, rgb(26 26 26 / 0.15))",
                    }}
                  />
                </div>
                <WhatsAppButton href={waHref} tone="outline" fullWidth>
                  {s("whatsappInstead")}
                </WhatsAppButton>
              </>
            )}

            {status === "ok" && (
              <p className="font-label font-bold text-sm text-bk-success">
                {s("orderReceived")}
              </p>
            )}
            {status === "error" && errorLines.length > 0 && (
              <div
                id={submitErrorId}
                role="alert"
                className="space-y-bk-2xs font-label font-bold text-sm text-bk-danger"
              >
                {errorLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
