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
  pixelContentsFromItems,
  isValidIraqiMobile,
  normalizeIraqiMobile,
  computePointsEarned,
  formatPoints,
  computeReferralDiscount,
  normalizeReferralCode,
  stackDiscounts,
} from "@scheniders/shared";
import { trackPixel, newPixelEventId } from "./helpers/pixels";
import { captureReferral, clearCapturedReferral } from "./helpers/referral-capture";
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

/** Chrome strings. Every entry carries Sorani — _kurdish-coverage.test.ts fails the build otherwise. */
const STRINGS = {
  stepCart: { en: "Cart", ar: "السلة", ku: "سەبەتە" },
  stepDetails: { en: "Details", ar: "التفاصيل", ku: "زانیارییەکان" },
  stepConfirm: { en: "Confirm", ar: "التأكيد", ku: "پشتڕاستکردنەوە" },
  deliveryDetails: { en: "Delivery details", ar: "تفاصيل التوصيل", ku: "زانیاری گەیاندن" },
  fullName: { en: "Full name", ar: "الاسم الكامل", ku: "ناوی تەواو" },
  phone: { en: "Phone number", ar: "رقم الهاتف", ku: "ژمارەی مۆبایل" },
  phoneInvalid: {
    en: "Enter a valid Iraqi mobile number, e.g. 0770 123 4567.",
    ar: "أدخل رقم هاتف عراقي صحيح، مثال: 0770 123 4567.",
    ku: "ژمارەیەکی مۆبایلی عێراقی دروست بنووسە، نموونە: 0770 123 4567.",
  },
  welcomeBack: { en: "Welcome back — we filled in your details from your last order.", ar: "رجعتلنا؟ عبّينا معلوماتك من آخر طلب.", ku: "بەخێربێیتەوە — زانیارییەکانت لە داواکاری پێشووت پڕکردەوە." },
  notYou: { en: "Not you? Clear", ar: "مو انت؟ امسح", ku: "تۆ نیت؟ بیسڕەوە" },
  email: { en: "Email", ar: "البريد الإلكتروني", ku: "ئیمەیڵ" },
  governorate: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
  governoratePlaceholder: { en: "Choose a governorate", ar: "اختر المحافظة", ku: "پارێزگا هەڵبژێرە" },
  area: { en: "Area / District", ar: "المنطقة", ku: "ناوچە / گەڕەک" },
  address: { en: "Full address", ar: "العنوان بالتفصيل", ku: "ناونیشانی تەواو" },
  addressPlaceholder: {
    en: "Street, sector, house number…",
    ar: "الشارع، المحلة، رقم الدار…",
    ku: "شەقام، گەڕەک، ژمارەی خانوو…",
  },
  notes: { en: "Delivery notes", ar: "ملاحظات", ku: "تێبینی گەیاندن" },
  optional: { en: "(optional)", ar: "(اختياري)", ku: "(ئارەزوومەندانە)" },
  paymentMethod: { en: "Payment method", ar: "طريقة الدفع", ku: "شێوازی پارەدان" },
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام", ku: "پارەدان لە کاتی وەرگرتن" },
  earnOnDelivery: { en: "Earn {points} when it is delivered", ar: "تكسب {points} لما يوصلك الطلب", ku: "{points} بەدەست دەهێنیت کاتێک داواکارییەکەت دەگاتە دەستت" },
  referralLabel: { en: "Friend's code (optional)", ar: "رمز صديق (اختياري)", ku: "کۆدی هاوڕێ (ئارەزوومەندانە)" },
  referralPlaceholder: { en: "e.g. AB3K7M", ar: "مثال: AB3K7M", ku: "نموونە: AB3K7M" },
  referralOff: { en: "{amount} off with your friend's code", ar: "خصم {amount} برمز صديقك", ku: "{amount} داشکاندن بە کۆدی هاوڕێکەت" },
  referralUnknown: { en: "We don't recognise that code.", ar: "ما نعرف هذا الرمز.", ku: "ئەم کۆدە ناناسین." },
  referralIneligible: { en: "This code can't be used with this number.", ar: "هذا الرمز ما ينفع مع هذا الرقم.", ku: "ئەم کۆدە لەگەڵ ئەم ژمارەیەدا کار ناکات." },
  placeOrder: { en: "Place order", ar: "أكّد الطلب", ku: "داواکاری پشتڕاست بکەرەوە" },
  placingOrder: { en: "Placing your order…", ar: "جارٍ تأكيد الطلب…", ku: "داواکارییەکەت پشتڕاست دەکرێتەوە…" },
  finePrint: {
    en: "By placing this order, you agree to pay cash on delivery. No hidden fees.",
    ar: "بتأكيدك الطلب، توافق على الدفع نقداً عند الاستلام. لا رسوم خفية.",
    ku: "بە پشتڕاستکردنەوەی ئەم داواکارییە، ڕازی دەبیت لە کاتی وەرگرتن بە نەقد پارە بدەیت. هیچ کرێیەکی شاراوە نییە.",
  },
  or: { en: "Or", ar: "أو", ku: "یان" },
  whatsappInstead: {
    en: "Place order via WhatsApp instead",
    ar: "أكمل الطلب عبر واتساب",
    ku: "لە جیاتی ئەوە داواکاری لە ڕێگەی واتسئاپ بکە",
  },
  orderReceived: { en: "Order received!", ar: "تم استلام طلبك!", ku: "داواکارییەکەت گەیشت!" },
  errGeneric: {
    en: "Something went wrong. Please try again.",
    ar: "حدث خطأ. حاول مرة أخرى.",
    ku: "هەڵەیەک ڕوویدا. تکایە دووبارە هەوڵ بدەرەوە.",
  },
  errNetwork: {
    en: "We couldn't reach the server — check your connection and try again.",
    ar: "تعذّر الاتصال بالخادم — تحقّق من الإنترنت وحاول مرة أخرى.",
    ku: "نەتوانرا پەیوەندی بە ڕاژەکار بکرێت — ئینتەرنێتەکەت بپشکنە و دووبارە هەوڵ بدەرەوە.",
  },
  errReview: {
    en: "Your cart was updated. Please review it and confirm again.",
    ar: "تم تحديث سلتك. راجعها ثم أكّد الطلب مرة أخرى.",
    ku: "سەبەتەکەت نوێکرایەوە. تکایە پێداچوونەوەی بۆ بکە و دووبارە پشتڕاستی بکەرەوە.",
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
  // Referral: the friend's code (from a shared ?ref= link or typed) and the
  // server's verdict on it. The amount is previewed from the published
  // program; the server re-checks eligibility and prices it again at submit.
  const [referralCode, setReferralCode] = useState("");
  const [referralState, setReferralState] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "valid"; pct: number; max: number | null }
    | { kind: "invalid"; reason: "unknown" | "ineligible" | "off" }
  >({ kind: "idle" });
  const tenantId = ctx.tenant.id;
  const commerceRef = {
    current: (ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined)?.store_config_v2?.commerce,
  };
  const referralFieldId = useId();
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
  const referralProgram = commerceRef.current?.referral;
  useEffect(() => {
    if (referralProgram?.enabled !== true) return;
    const captured = captureReferral(tenantId);
    if (captured) setReferralCode(captured);
  }, [referralProgram?.enabled]);
  useEffect(() => {
    if (referralProgram?.enabled !== true) return;
    const code = normalizeReferralCode(referralCode);
    if (!code) {
      setReferralState({ kind: "idle" });
      return;
    }
    let active = true;
    setReferralState({ kind: "checking" });
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ tenant_id: tenantId, code });
      const buyer = normalizeIraqiMobile(form.phone);
      if (buyer) params.set("phone", buyer);
      fetch(`/api/referral/validate?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { valid?: boolean; reason?: string; friend_discount_pct?: number; friend_max_discount_iqd?: number | null } | null) => {
          if (!active) return;
          if (d?.valid === true) {
            setReferralState({ kind: "valid", pct: d.friend_discount_pct ?? 0, max: d.friend_max_discount_iqd ?? null });
          } else {
            const reason = d?.reason;
            setReferralState({
              kind: "invalid",
              reason: reason === "ineligible" || reason === "off" ? reason : "unknown",
            });
          }
        })
        .catch(() => {
          if (active) setReferralState({ kind: "idle" });
        });
    }, 500);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [referralProgram?.enabled, referralCode, form.phone]);

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
  // A friend's code does not stack on a coupon (the server applies the same rule).
  const referralWanted =
    referralState.kind === "valid" && couponAmount === 0
      ? computeReferralDiscount(subtotal, { enabled: true, friend_discount_pct: referralState.pct, friend_max_discount_iqd: referralState.max ?? undefined })
      : 0;
  // Stacked exactly as the server stacks them — coupon → bundle → referral,
  // each against what the previous left — so the preview total is the one
  // that gets recorded and the sum never exceeds the subtotal.
  const [couponApplied, bundleApplied, referralAmount] = stackDiscounts(subtotal, [
    couponAmount,
    bundleAmount,
    referralWanted,
  ]).applied;
  // Loyalty points are not redeemable at checkout: the server refuses a
  // redemption backed only by a phone number, since anyone who knows a
  // customer's number could spend their points.
  const loyaltyCfg = commerce?.loyalty;
  const discountAmount = couponApplied + bundleApplied + referralAmount;
  // Credited by the database on delivery, never at placement, on the order's
  // price — which is the subtotal net of discounts.
  const pointsToEarn = computePointsEarned(subtotal - discountAmount, loyaltyCfg);
  const total = subtotal - discountAmount + delivery;
  const returnsDays = commerce?.returns_policy?.window_days;

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
          ...(referralState.kind === "valid" && normalizeReferralCode(referralCode)
            ? { referral_code: normalizeReferralCode(referralCode) }
            : {}),
          ab_test_arms: ctx.runtime.ab_test_arms,
        }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          orderNumber?: string;
          /** The order's id — which order the post-purchase offer grows. */
          orderId?: string;
          /** Proof this browser placed it (server-minted, short-lived). */
          upsellToken?: string;
          total?: number;
        } | null;
        const orderNumber = data?.orderNumber ?? "";
        if (referralState.kind === "valid") clearCapturedReferral(tenantId);
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
              // The order id and the server's proof let the thank-you page's
              // post-purchase offer act on THIS order and no other. Session
              // storage only, like the rest of the stash; additive, so older
              // readers ignore them.
              order_id: data?.orderId ?? null,
              upsell_token: data?.upsellToken ?? null,
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

            {referralProgram?.enabled === true && (
              <div data-testid="referral-field" className="space-y-1">
                <label className={labelCls} htmlFor={referralFieldId}>
                  {s("referralLabel")}
                </label>
                <input
                  id={referralFieldId}
                  type="text"
                  name="referral_code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  dir="ltr"
                  maxLength={12}
                  placeholder={s("referralPlaceholder")}
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  aria-invalid={referralState.kind === "invalid" || undefined}
                  aria-describedby={referralState.kind === "idle" ? undefined : `${referralFieldId}-status`}
                  className={inputCls}
                  style={inputStyle}
                />
                {referralState.kind !== "idle" && (
                  <p
                    id={`${referralFieldId}-status`}
                    role="status"
                    data-referral-state={referralState.kind}
                    className={`font-body text-xs ${referralState.kind === "invalid" ? "text-bk-danger" : "text-bk-ink-soft"}`}
                  >
                    {referralState.kind === "checking"
                      ? "…"
                      : referralState.kind === "valid"
                        ? s("referralOff").replace("{amount}", `−${formatPrice(referralAmount, locale)}`)
                        : referralState.reason === "ineligible"
                          ? s("referralIneligible")
                          : s("referralUnknown")}
                  </p>
                )}
              </div>
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
