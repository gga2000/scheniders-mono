// =====================================================================
// Section — pdp_direct_order
// =====================================================================
// LightFunnels-style inline COD order form for product pages — a
// single-product checkout embedded directly in the PDP (the classic
// Iraqi funnel "buy box"):
//   • rating chip + product title + price row (sale + struck compare +
//     % chip)
//   • step 01 — delivery details (name, phone, alt phone, governorate,
//     address) with visible labels, trailing icons and inline errors
//   • step 02 — quantity stepper
//   • highlighted Cash-on-Delivery payment card
//   • total row (incl. per-governorate delivery fee) + big primary
//     submit + WhatsApp order alternative
//   • stock urgency line, optional description block, trust chips
//
// Submits to the SAME `/api/checkout/orders` endpoint as the
// `checkout_form` section, with an identical payload shape — the only
// differences are that `items` is a single line built from `ctx.product`
// + the chosen quantity instead of the cart store, and the optional
// structured `alt_phone`. Validation, labels, governorate placeholder and
// the 422 self-heal mirror checkout_form so both COD forms behave alike.
// Success behaves exactly like checkout_form: stash the recap in
// sessionStorage, fire the Purchase pixel, redirect to `/checkout/success`.
// =====================================================================
// Client half of `pdp_direct_order` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./pdp_direct_order.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  resolveI18n,
  IRAQ_GOVERNORATES,
  governorateLabel,
  computeDeliveryFee,
  pixelContentsFromItems,
  isValidIraqiMobile,
  normalizeIraqiMobile,
  cn,
  buildPriceLadder,
  resolveTierPrice,
  offersForProduct,
  applyBumpDiscount,
  summarizeDelivery,
  etaForGovernorate,
  formatHours,
  computePointsEarned,
  computePointsRedemption,
  formatPoints,
  computeReferralDiscount,
  normalizeReferralCode,
  stackDiscounts,
} from "@scheniders/shared";
import type { StoreConfigV2, GovernorateCode, LocaleCode } from "@scheniders/shared";
import { trackPixel, newPixelEventId } from "./helpers/pixels";
import { captureReferral, clearCapturedReferral } from "./helpers/referral-capture";
import { focusVariantPicker, stockLeftFor, useSelectedVariant } from "./helpers/variant-store";
import {
  clearCustomerMemory,
  prefillFromMemory,
  readCustomerMemory,
  writeCustomerMemory,
} from "./helpers/customer-memory";
import {
  clearOrderDraft,
  mergeDraftForm,
  readOrderDraft,
  writeOrderDraft,
} from "./helpers/order-draft";
import { postOrderWithResubmit, readPlacedOrder } from "./helpers/submit-order";
import {
  BentoCard,
  ChunkyButton,
  ChunkyLink,
  MaterialIcon,
  WhatsAppIcon,
  Stars,
} from "./helpers/primitives";
import { PRESSABLE } from "./helpers/utils";
import { useStoreBase } from "./helpers/store-context";
import { resolveTenantWhatsapp, whatsappCartLink } from "./helpers/whatsapp";
import {
  formatCount,
  formatPrice,
  discountPercent,
  formatPercent,
} from "./helpers/format";
import { isOptimizableImageHost } from "./helpers/image";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./pdp_direct_order";
// Value import from our own definition half: `defaultProps` needs the same
// constant, and the definition module cannot import it from here (a value
// exported by a "use client" module is an opaque reference on the server).
// The two-way import is benign — the constant is only read at render time.
import { DEFAULT_URGENCY_MAX_STOCK } from "./pdp_direct_order";
import { PdpExpress } from "./pdp_express/express-view";
import { EXPRESS_FIELD_ORDER } from "./pdp_express/model";

/** Chrome strings. Every entry carries Sorani — _kurdish-coverage.test.ts fails the build otherwise. */
export const STRINGS = {
  fullName: { en: "Full name", ar: "الاسم الكامل", ku: "ناوی تەواو" },
  namePlaceholder: { en: "Your name", ar: "اكتب اسمك", ku: "ناوت بنووسە" },
  phone: { en: "Phone number", ar: "رقم الهاتف", ku: "ژمارەی مۆبایل" },
  phoneHint: { en: "(WhatsApp preferred)", ar: "(يفضل عليه واتساب)", ku: "(واتسئاپ پەسەندترە)" },
  phonePlaceholder: { en: "0770 123 4567", ar: "0770 123 4567", ku: "0770 123 4567" },
  altPhone: { en: "Alternative phone", ar: "رقم بديل", ku: "ژمارەی جێگرەوە" },
  altPhoneHint: {
    en: "(optional — in case we can't reach you)",
    ar: "(اختياري — نتصل عليه إذا ما وصلنا إلك)",
    ku: "(ئارەزوومەندانە — ئەگەر پێت نەگەیشتین)",
  },
  governorate: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
  governoratePlaceholder: { en: "Choose governorate", ar: "اختر المحافظة", ku: "پارێزگا هەڵبژێرە" },
  address: { en: "Address", ar: "العنوان", ku: "ناونیشان" },
  addressPlaceholder: {
    en: "Nearest landmark, street, house number…",
    ar: "أقرب نقطة دالة، الشارع، رقم الدار…",
    ku: "نزیکترین شوێنی ناسراو، شەقام، ژمارەی خانوو…",
  },
  required: { en: "This field is required.", ar: "هذا الحقل مطلوب.", ku: "ئەم خانەیە پێویستە." },
  phoneInvalid: {
    en: "Enter a valid Iraqi mobile number, e.g. 0770 123 4567.",
    ar: "أدخل رقم هاتف عراقي صحيح، مثال: 0770 123 4567.",
    ku: "ژمارەیەکی مۆبایلی عێراقی دروست بنووسە، نموونە: 0770 123 4567.",
  },
  governorateRequired: {
    en: "Choose your governorate so we can price delivery.",
    ar: "اختر محافظتك حتى نحسب أجرة التوصيل.",
    ku: "پارێزگاکەت هەڵبژێرە تاکو کرێی گەیاندن بژمێرین.",
  },
  /** When the fee is flat the price is already known — the governorate is
   *  needed for the address, and the copy must not pretend otherwise. */
  governorateRequiredFlat: {
    en: "Choose your governorate for delivery.",
    ar: "اختر محافظتك للتوصيل.",
    ku: "پارێزگاکەت بۆ گەیاندن هەڵبژێرە.",
  },
  deliveryAllGovernorates: { en: "all governorates", ar: "لكل المحافظات", ku: "بۆ هەموو پارێزگاکان" },
  deliveryRange: { en: "{min} – {max} by governorate", ar: "{min} – {max} حسب المحافظة", ku: "{min} – {max} بەپێی پارێزگا" },
  deliveryFreeAbove: { en: "free above {amount}", ar: "مجاني فوق {amount}", ku: "بەخۆڕایی سەرووی {amount}" },
  deliveryEta: { en: "Delivery in {eta}", ar: "التوصيل خلال {eta}", ku: "گەیاندن لە ماوەی {eta}" },
  deliveryEtaRange: { en: "Delivery in {min} – {max}", ar: "التوصيل خلال {min} – {max}", ku: "گەیاندن لە ماوەی {min} – {max}" },
  totalExcludesDelivery: { en: "before delivery", ar: "بدون التوصيل", ku: "بەبێ گەیاندن" },
  youHavePoints: { en: "You have {points}", ar: "عندك {points}", ku: "{points}ت هەیە" },
  useAll: { en: "Use all", ar: "استخدم الكل", ku: "هەمووی بەکاربهێنە" },
  enterPoints: { en: "Enter points to redeem", ar: "أدخل عدد النقاط", ku: "ژمارەی خاڵەکان بنووسە" },
  pointsOff: { en: "{amount} off", ar: "خصم {amount}", ku: "{amount} داشکاندن" },
  earnOnDelivery: { en: "Earn {points} when it is delivered", ar: "تكسب {points} لما يوصلك الطلب", ku: "{points} بەدەست دەهێنیت کاتێک داواکارییەکەت دەگاتە دەستت" },
  referralLabel: { en: "Friend's code (optional)", ar: "رمز صديق (اختياري)", ku: "کۆدی هاوڕێ (ئارەزوومەندانە)" },
  referralPlaceholder: { en: "e.g. AB3K7M", ar: "مثال: AB3K7M", ku: "نموونە: AB3K7M" },
  referralOff: { en: "{amount} off with your friend's code", ar: "خصم {amount} برمز صديقك", ku: "{amount} داشکاندن بە کۆدی هاوڕێکەت" },
  referralUnknown: { en: "We don't recognise that code.", ar: "ما نعرف هذا الرمز.", ku: "ئەم کۆدە ناناسین." },
  referralIneligible: { en: "This code can't be used with this number.", ar: "هذا الرمز ما ينفع مع هذا الرقم.", ku: "ئەم کۆدە لەگەڵ ئەم ژمارەیەدا کار ناکات." },
  /** Only rendered when commerce.returns_policy.inspect_before_paying is true. */
  inspectBeforePaying: { en: "Open and check it before you pay", ar: "افتح الطلب وتأكد قبل ما تدفع", ku: "پێش پارەدان بیکەرەوە و بیپشکنە" },
  /** Default consent line under the phone field (`show_capture_consent`). */
  captureConsent: {
    en: "We may message you on WhatsApp about your order",
    ar: "ممكن نراسلك واتساب بخصوص طلبك",
    ku: "لەوانەیە سەبارەت بە داواکارییەکەت لە واتسئاپ نامەت بۆ بنێرین",
  },
  chooseVariant: { en: "Choose an option", ar: "اختار الخيار", ku: "هەڵبژاردەیەک دیاری بکە" },
  chooseVariantFirst: { en: "Choose an option first.", ar: "اختار الخيار أول.", ku: "سەرەتا هەڵبژاردەیەک دیاری بکە." },
  variantOut: { en: "out of stock", ar: "نفد", ku: "نەماوە" },
  welcomeBack: { en: "Welcome back — we filled in your details from your last order.", ar: "رجعتلنا؟ عبّينا معلوماتك من آخر طلب.", ku: "بەخێربێیتەوە — زانیارییەکانت لە داواکاری پێشووت پڕکردەوە." },
  notYou: { en: "Not you? Clear", ar: "مو انت؟ امسح", ku: "تۆ نیت؟ بیسڕەوە" },
  quantity: { en: "Quantity", ar: "الكمية", ku: "بڕ" },
  decrease: { en: "Decrease quantity", ar: "إنقاص الكمية", ku: "کەمکردنەوەی بڕ" },
  increase: { en: "Increase quantity", ar: "زيادة الكمية", ku: "زیادکردنی بڕ" },
  price: { en: "Price:", ar: "السعر:", ku: "نرخ:" },
  cod: { en: "Cash on Delivery", ar: "الدفع عند الاستلام", ku: "پارەدان لە کاتی وەرگرتن" },
  codNote: {
    en: "You pay when the order arrives",
    ar: "تدفع المبلغ عند استلام الطلب",
    ku: "کاتێک داواکارییەکە دەگات پارە دەدەیت",
  },
  delivery: { en: "Delivery", ar: "التوصيل", ku: "گەیاندن" },
  deliveryFree: { en: "Free", ar: "مجاني", ku: "بەخۆڕایی" },
  total: { en: "Total amount", ar: "إجمالي المبلغ", ku: "کۆی گشتی" },
  outOfStock: { en: "Out of stock", ar: "نفد المخزون", ku: "لە کۆگا نەماوە" },
  placingOrder: { en: "Placing your order…", ar: "جارٍ تأكيد الطلب…", ku: "داواکارییەکەت پشتڕاست دەکرێتەوە…" },
  orderReceived: { en: "Order received!", ar: "تم استلام طلبك!", ku: "داواکارییەکەت گەیشت!" },
  /** The single same-key resend after an unanswered attempt. */
  checkingOrder: { en: "Checking your order…", ar: "نتأكد من طلبك…", ku: "داواکارییەکەت دەپشکنین…" },
  /** Neither attempt was answered — the order may or may not exist. */
  orderUnconfirmed: {
    en: "We couldn't confirm your order went through. Send the same order on WhatsApp and we'll place it for you.",
    ar: "ما قدرنا نتأكد إذا طلبك وصل. ابعث نفس الطلب بالواتساب ونثبّته إلك.",
    ku: "نەمانتوانی دڵنیا بین داواکارییەکەت گەیشتووە. هەمان داواکاری بە واتسئاپ بنێرە و بۆت تۆماری دەکەین.",
  },
  sendOnWhatsapp: {
    en: "Send the same order on WhatsApp",
    ar: "ابعث نفس الطلب بالواتساب",
    ku: "هەمان داواکاری بە واتسئاپ بنێرە",
  },
  /** The server's soft duplicate guard answered with an existing order. */
  alreadyOrdered: {
    en: "We already have your order — no need to order it again.",
    ar: "طلبك واصلنا، لا تطلبه مرة ثانية",
    ku: "داواکارییەکەت گەیشتووە، دووبارە داوای مەکەرەوە.",
  },
  errGeneric: {
    en: "Something went wrong. Please try again.",
    ar: "حدث خطأ. حاول مرة أخرى.",
    ku: "هەڵەیەک ڕوویدا. تکایە دووبارە هەوڵ بدەرەوە.",
  },
  priceChanged: {
    en: "The price changed to {price} — tap confirm again.",
    ar: "تغيّر السعر إلى {price} — اضغط التأكيد مرة أخرى",
    ku: "نرخەکە گۆڕا بۆ {price} — دووبارە پشتڕاستکردنەوە دابگرە",
  },
  viewImage: { en: "View image {count}", ar: "عرض الصورة {count}", ku: "وێنەی {count} ببینە" },
} as const;

function returnsLine(days: number, locale: LocaleCode): string {
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

/** Anchor for the in-page order form; sticky_cta_bar's "scroll_to_form"
 *  kind targets it. */
export const DIRECT_ORDER_FORM_ID = "direct-order";

/** Rounded input with a trailing icon (the funnel-form lockup), plus an
 *  optional leading icon (the governorate select keeps its map pin while
 *  the trailing slot shows the chevron a select is expected to have).
 *  Module-level on purpose: declared inside the render function it was a
 *  NEW component type on every render, so React unmounted and remounted
 *  the wrapped <input> on each keystroke and focus was lost after one
 *  character. */
function IconField({
  icon,
  leading,
  children,
}: {
  icon: string;
  leading?: string;
  children: React.ReactNode;
}) {
  const iconStyle = { color: "var(--bk-ink-faint, rgb(26 26 26 / 0.38))" };
  return (
    <div className="relative">
      {leading && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
          style={iconStyle}
        >
          <MaterialIcon name={leading} className="text-xl" />
        </span>
      )}
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
        style={iconStyle}
      >
        <MaterialIcon name={icon} className="text-xl" />
      </span>
    </div>
  );
}

/** Step numeral. Latin digits in every locale — prices on the same card
 *  are Latin, and a mixed "٠١ … 25,000" reads as two different pages. */
function StepChip({ n }: { n: 1 | 2 }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center font-display font-black text-sm tabular-nums"
      style={{
        backgroundColor: "var(--bk-primary, #ff5a8a)",
        color: "var(--bk-on-primary, #fff)",
        borderRadius: "var(--bk-radius-pill, 9999px)",
        fontFamily: "var(--bk-font-display, inherit)",
      }}
    >
      {n === 1 ? "01" : "02"}
    </span>
  );
}

/** A collision-free idempotency key for one order submission — same
 *  strategy as `checkout_form` (crypto.randomUUID with a timestamp+random
 *  fallback). Kept local: importing checkout_form would re-trigger its
 *  registerSection side effect. */
function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** EC24 (mirrors checkout_form): the subset of the server's checkout-issue
 *  shape this form acts on. */
interface CheckoutIssue {
  product_id: string;
  variant_id: string | null;
  reason: "unavailable" | "price_changed" | "invalid_quantity";
  new_price?: number;
}

export type FieldKey =
  | "customer_name"
  | "phone"
  | "alt_phone"
  | "governorate_code"
  | "address_details";

/** Visual order of the fields — also the order "focus the first invalid
 *  field" walks on submit. */
const FIELD_ORDER: readonly FieldKey[] = [
  "customer_name",
  "phone",
  "alt_phone",
  "governorate_code",
  "address_details",
];

export type FormState = Record<FieldKey, string>;
export type FieldErrors = Partial<Record<FieldKey, string>>;
export type FieldElement = HTMLInputElement | HTMLSelectElement;

/** Where one submission stands. `checking` is the single same-key resend
 *  after an unanswered attempt; `unconfirmed` means neither attempt was
 *  answered (the order may exist — offer WhatsApp, keep the key);
 *  `duplicate` is the server's soft duplicate guard ("we already have it"). */
export type SubmitStatus =
  | "idle"
  | "submitting"
  | "checking"
  | "ok"
  | "duplicate"
  | "unconfirmed"
  | "error";

/** Per-layout submit options. Classic submits with none, so its request
 *  body is unchanged. */
export interface SubmitOptions {
  /** Appended to address_details as " - {suffix}" when non-empty (the
   *  express layout's optional nearest-landmark field). */
  addressSuffix?: string;
  /** The order "focus the first invalid field" walks, for a layout whose
   *  visual order differs from FIELD_ORDER. A layout that passes it may
   *  also keep fields collapsed (inert) until an error opens them, so the
   *  focus is taken after the error render commits, not synchronously. */
  focusOrder?: readonly FieldKey[];
}

export function isGovernorateCode(v: string): v is GovernorateCode {
  return IRAQ_GOVERNORATES.some((g) => g.code === v);
}

export function PdpDirectOrderRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const product = ctx.product;
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const s = (key: keyof typeof STRINGS) => resolveI18n(STRINGS[key], locale);
  const base = useStoreBase();
  const uid = useId();
  const fieldId = (k: FieldKey) => `${uid}-${k}`;
  const referralFieldId = `${uid}-referral_code`;
  const errorId = (k: FieldKey) => `${uid}-${k}-error`;
  const submitErrorId = `${uid}-submit-error`;
  const variantErrorId = `${uid}-variant-error`;

  const [qty, setQty] = useState(1);
  const [bumpAccepted, setBumpAccepted] = useState(false);
  // Server-corrected unit price (422 `price_changed` self-heal), for the
  // variant it was reported against; null until the server reports a drift.
  // Keyed by variant so choosing another option — here or in any picker on
  // the page — never carries one variant's correction onto another.
  const [livePrice, setLivePrice] = useState<{ variantId: string | null; price: number } | null>(null);
  // Timestamp of the last price drift — drives the scroll-to + 1.2 s
  // highlight on the price row; null once the highlight has faded.
  const [priceFlashAt, setPriceFlashAt] = useState<number | null>(null);
  const priceRowRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  // In flight: the first attempt or the single same-key resend. Both the
  // submit guard and the button read this, so neither layout depends on how
  // its button is disabled to keep a second submit out.
  const submitting = status === "submitting" || status === "checking";
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const fieldRefs = useRef<Partial<Record<FieldKey, FieldElement | null>>>({});
  // The field to focus once the submit-error render has committed (only
  // set when the layout passed SubmitOptions.focusOrder).
  const pendingFocus = useRef<FieldKey | null>(null);
  // No deps on purpose: every submit with errors commits a new
  // fieldErrors object, and the check is a ref read.
  useLayoutEffect(() => {
    const k = pendingFocus.current;
    if (k === null) return;
    pendingFocus.current = null;
    fieldRefs.current[k]?.focus();
  });
  // Gallery column: the thumb the shopper tapped (null = cover image).
  const [activeImage, setActiveImage] = useState<string | null>(null);
  // EC17: one stable idempotency key per submission, reused across retries
  // so the server dedupes; cleared on success (same as checkout_form).
  const idempotencyKeyRef = useRef<string | null>(null);
  // One Purchase event_id per submission — shared by the browser pixel and
  // the server CAPI twin (dedup); cleared on success.
  const purchaseEventIdRef = useRef<string | null>(null);
  // Published commerce config is static for the render; read once up here so
  // effects declared before the pricing block can see it.
  const commerceRef = {
    current: (ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined)?.store_config_v2?.commerce,
  };
  const [form, setForm] = useState<FormState>(() => {
    // Empty until chosen: a pre-selected Baghdad silently shipped orders to
    // the wrong governorate (and priced the wrong fee) when shoppers skipped
    // the field. A returning shopper's `sb_gov` cookie (surfaced by the
    // storefront as runtime.governorate) is the only prefill.
    const remembered = ctx.runtime.governorate;
    return {
      customer_name: "",
      phone: "",
      alt_phone: "",
      governorate_code:
        remembered && isGovernorateCode(remembered) ? remembered : "",
      address_details: "",
    };
  });

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

  const referralProgram = commerceRef.current?.referral;
  useEffect(() => {
    if (referralProgram?.enabled !== true) return;
    const captured = captureReferral(ctx.tenant.id);
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
      const params = new URLSearchParams({ tenant_id: ctx.tenant.id, code });
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
  // Pixel InitiateCheckout fires once, on the FIRST focus of any form field —
  // never on mount, or every PDP view would count as a checkout start.
  const initiateFired = useRef(false);
  // Loyalty: the shopper's balance (fetched by phone, debounced) and how
  // many points they choose to spend. The server re-resolves both against
  // the published config and the authoritative balance.
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  // Which variant is being bought: chosen in a pdp_variants section, the
  // buy box, or the inline pills below (only when no picker is on the page).
  // Nothing is pre-selected — see helpers/variant-store.
  const chosen = useSelectedVariant(product);
  const [variantError, setVariantError] = useState(false);
  const variantPillsRef = useRef<HTMLDivElement | null>(null);

  // A reload mid-order brings back what this tab typed and — when a submit
  // had started — its idempotency key, so tapping again replays that order
  // instead of placing a second one (helpers/order-draft). Declared BEFORE
  // the customer-memory prefill below: effects run in order, so the draft
  // wins and memory only fills what the draft left blank.
  const productId = product?.id ?? null;
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (!productId) return;
    const draft = readOrderDraft(ctx.tenant.id, productId);
    if (!draft) return;
    idempotencyKeyRef.current = draft.idempotencyKey;
    purchaseEventIdRef.current = draft.purchaseEventId;
    setForm((prev) => mergeDraftForm(prev, draft.form));
    setDraftRestored(true);
  }, [ctx.tenant.id, productId]);

  // A returning shopper's details, from THIS browser only — see
  // helpers/customer-memory for why nothing is looked up by phone. Applied
  // after mount so server HTML and first client render agree; only blank
  // fields are filled, so a shopper mid-typing is never overwritten.
  const [recognised, setRecognised] = useState(false);
  useEffect(() => {
    const memory = readCustomerMemory(ctx.tenant.id);
    if (!memory) return;
    setForm((prev) => prefillFromMemory(prev, memory).next);
    setRecognised(true);
  }, [ctx.tenant.id]);
  function forgetMe(): void {
    clearCustomerMemory(ctx.tenant.id);
    setRecognised(false);
    setForm({
      customer_name: "",
      phone: "",
      alt_phone: "",
      governorate_code: "",
      address_details: "",
    });
    fieldRefs.current.customer_name?.focus();
  }

  // The abandoned-cart beacon waits for the same signal: a remembered phone
  // alone must not turn every product view by a returning shopper into an
  // "abandoned cart" and a WhatsApp nudge.
  const [interacted, setInteracted] = useState(false);

  // Never lose the buyer: once they have touched the form (or it came back
  // from a draft) the typed fields and any in-flight keys are kept for this
  // tab, so a reload restores them. Placing the order clears them.
  useEffect(() => {
    if (!productId || (!interacted && !draftRestored)) return;
    writeOrderDraft(ctx.tenant.id, productId, {
      form,
      idempotencyKey: idempotencyKeyRef.current,
      purchaseEventId: purchaseEventIdRef.current,
    });
  }, [form, interacted, draftRestored, ctx.tenant.id, productId]);

  // Price drift: bring the price row on screen and flash it for 1.2 s so the
  // shopper sees WHAT changed before re-confirming.
  useEffect(() => {
    if (priceFlashAt === null) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    priceRowRef.current?.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    const handle = setTimeout(() => setPriceFlashAt(null), 1200);
    return () => clearTimeout(handle);
  }, [priceFlashAt]);

  if (!product) {
    if (process.env.NODE_ENV !== "production") {
      return (
        <div
          data-section-placeholder="pdp_direct_order"
          style={{
            padding: 12,
            border: "1px dashed #999",
            color: "#666",
            fontSize: 12,
          }}
        >
          pdp_direct_order — no product in runtime context
        </div>
      );
    }
    return null;
  }

  // The server verifies each line's price against the live product row and
  // 422s with `new_price` when it drifted; `livePrice` adopts that correction
  // so the retry succeeds without a page reload (parity with checkout_form's
  // cart-store `updatePrice` self-heal).
  // A product sold by variant is bought as one of them, priced from the
  // variant row — the checkout refuses a variant-less line for it.
  const chosenVariantId = chosen.variant?.id ?? null;
  const price =
    livePrice && livePrice.variantId === chosenVariantId
      ? livePrice.price
      : (chosen.variant?.price ?? product.price);

  const compareAt = chosen.variant ? chosen.variant.compare_at_price : product.compare_at_price;
  const onSale = compareAt != null && compareAt > price;
  // The shared helper, not a second implementation of the same sum. This
  // computed the percentage inline and so could disagree with the cards and
  // the hero badge, and it lacked their guard against a zero price — which
  // would have read as 100% off rather than no discount at all.
  const discountPct = discountPercent(price, compareAt);
  // Sold by variant and none chosen: there is no stock to count yet, so
  // `stockLeft` is null — not a placeholder number that the quantity cap and
  // the urgency line would read as real. The form asks for the choice at
  // submit instead of calling the product sold out, unless no variant can be
  // bought at all (`soldOut`), which is sold out.
  const awaitingVariant = chosen.needsVariant;
  const stockLeft: number | null = awaitingVariant
    ? null
    : stockLeftFor(product, chosen.variant);
  const oos = chosen.soldOut || (stockLeft !== null && stockLeft <= 0);
  const maxQty = Math.min(
    props.max_qty,
    stockLeft !== null && stockLeft > 0 ? stockLeft : props.max_qty,
  );
  // The "choose an option" message shows only while a choice is still owed.
  const showVariantError = variantError && awaitingVariant;
  const atMinQty = qty <= 1;
  const atMaxQty = qty >= maxQty;

  // Quantity price break, if the merchant set any. The checkout server
  // re-derives this from the same helper, so what the shopper sees here and
  // what they are charged cannot drift — see @scheniders/shared price-tiers.
  const ladder = buildPriceLadder(product.price_tiers, price, maxQty);
  const unitPrice = resolveTierPrice(product.price_tiers, qty, price);

  // Order bump: one add-on offer attached to this product. Only the first is
  // shown — a checkout form is not the place for a list of upsells. The
  // offered product is resolved with the offer (never from a capped
  // page-level list), and its discount applies to the same unit price the
  // checkout server derives for one unit of it.
  const bumpOffer = offersForProduct(product.order_bumps, product.id)[0] ?? null;

  // Half-filled phone capture: the direct-order form IS this store's
  // checkout. A phone is kept only where the merchant shows the consent line
  // under the phone field (opt-in). Once the shopper has touched the form
  // and typed a valid Iraqi number, the line is beaconed: debounced,
  // best-effort (keepalive), with the consent line exactly as shown. The
  // server works out the store from the request and the names and prices
  // from the catalogue, so neither is sent. Nothing is beaconed while the
  // order is being placed or once it was. Placing it marks the capture
  // recovered.
  const captureConsent =
    props.show_capture_consent === true
      ? resolveI18n(props.capture_consent_i18n, locale) || s("captureConsent")
      : null;
  useEffect(() => {
    if (!captureConsent || !interacted) return;
    if (status !== "idle" && status !== "error") return;
    const recoveryPhone = normalizeIraqiMobile(form.phone);
    if (!recoveryPhone) return;
    const handle = setTimeout(() => {
      fetch("/api/cart/abandoned", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          phone: recoveryPhone,
          items: [{ product_id: product.id, variant_id: chosenVariantId, quantity: qty }],
          ...(form.governorate_code ? { governorate: form.governorate_code } : {}),
          locale,
          consent_text: captureConsent,
        }),
      }).catch((error: unknown) => {
        // Best-effort: a lost beacon only costs one lead, so it must never
        // surface to the shopper. But it is not silent either.
        console.warn("[pdp_direct_order] capture beacon failed", error);
      });
    }, 1500);
    return () => clearTimeout(handle);
  }, [
    captureConsent,
    interacted,
    status,
    form.phone,
    form.governorate_code,
    product.id,
    chosenVariantId,
    qty,
    locale,
  ]);
  const bumpProduct = bumpOffer
    ? ((product.order_bump_products ?? []).find((p) => p.id === bumpOffer.bump_product_id) ?? null)
    : null;
  const bumpAvailable =
    bumpProduct != null &&
    (bumpProduct.stock_quantity ?? 0) - (bumpProduct.reserved_quantity ?? 0) > 0;
  const bumpBasePrice = bumpProduct
    ? resolveTierPrice(bumpProduct.price_tiers, 1, bumpProduct.price)
    : 0;
  const bumpPrice =
    bumpOffer && bumpProduct
      ? applyBumpDiscount(bumpBasePrice, bumpOffer.discount_percentage)
      : 0;
  const acceptedBump =
    bumpAccepted && bumpProduct && bumpAvailable
      ? { product: bumpProduct, price: bumpPrice }
      : null;

  const subtotal = unitPrice * qty + (acceptedBump ? acceptedBump.price : 0);
  // Same per-governorate shipping engine as checkout_form so the total this
  // CTA shows matches what the server records for the order. Never a
  // silently-assumed Baghdad rate: before a governorate is picked the fee is
  // stated only when EVERY governorate would pay it (below).
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;
  const chosenGovernorate = isGovernorateCode(form.governorate_code)
    ? form.governorate_code
    : null;
  // The server counts the paid lines — the parent and an accepted bump.
  const itemCount = qty + (acceptedBump ? 1 : 0);
  const delivery = chosenGovernorate
    ? computeDeliveryFee(subtotal, itemCount, {
        shipping: commerce?.shipping,
        governorate: chosenGovernorate,
      })
    : null;
  // What can honestly be said BEFORE a governorate is picked. The summary
  // asks the same engine for every governorate at this basket: one answer →
  // state it and count it in the total; several → show the range and keep
  // the total "before delivery". Nothing here is a guess.
  const deliverySummary = summarizeDelivery(commerce?.shipping, {
    subtotalIqd: subtotal,
    itemCount,
  });
  const flatFeeKnown = delivery === null && deliverySummary.kind !== "varies";
  const displayedDelivery: number | null = flatFeeKnown
    ? deliverySummary.fee.min
    : delivery;
  const loyaltyCfg = commerce?.loyalty;
  const referralWanted =
    referralState.kind === "valid"
      ? computeReferralDiscount(subtotal, { enabled: true, friend_discount_pct: referralState.pct, friend_max_discount_iqd: referralState.max ?? undefined })
      : 0;
  // Points are priced against what the friend's discount left, and the two
  // are stacked the way the server stacks them, so the sum never exceeds the
  // subtotal and the total shown is the total recorded.
  const pointsRedemption = computePointsRedemption({
    balance: pointsBalance ?? 0,
    requestedPoints: redeemPoints,
    subtotalIqd: subtotal - Math.min(referralWanted, subtotal),
    cfg: loyaltyCfg,
  });
  const [referralAmount, pointsDiscount] = stackDiscounts(subtotal, [
    referralWanted,
    pointsRedemption.discount_iqd,
  ]).applied;
  // Credited by the database when the order is delivered — never at
  // placement — so this is a promise about delivery, worded as one.
  const pointsToEarn = computePointsEarned(subtotal, loyaltyCfg);
  const total = subtotal - referralAmount - pointsDiscount + (displayedDelivery ?? 0);
  const totalExcludesDelivery = displayedDelivery === null;

  // Fetch the balance once a valid phone is in; reset the chosen redemption
  // when the phone changes so a number cannot spend another's points.
  useEffect(() => {
    if (!loyaltyCfg?.enabled) return;
    const balancePhone = normalizeIraqiMobile(form.phone);
    setRedeemPoints(0);
    if (!balancePhone) {
      setPointsBalance(null);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ tenant_id: ctx.tenant.id, phone: balancePhone });
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
  }, [loyaltyCfg?.enabled, form.phone, ctx.tenant.id]);
  const etaHours = chosenGovernorate
    ? etaForGovernorate(commerce?.shipping, chosenGovernorate)
    : null;
  const returnsDays = commerce?.returns_policy?.window_days;
  const inspectBeforePaying = commerce?.returns_policy?.inspect_before_paying === true;

  // Honest social proof: the chip renders ONLY when the product actually has
  // approved reviews. `{count}` in the template becomes the real count, and
  // the stars reflect the real average (rounded to the nearest whole star,
  // matching how product_reviews renders its summary stars).
  const reviewCount = product.review_count ?? 0;
  const avgRating = product.avg_rating ?? 0;
  const ratingChipRaw = resolveI18n(props.rating_chip_i18n, locale);
  const ratingChip =
    ratingChipRaw && reviewCount > 0
      ? ratingChipRaw.replace("{count}", String(reviewCount))
      : null;
  const formTitle = resolveI18n(props.form_title_i18n, locale);
  const qtyTitle = resolveI18n(props.qty_title_i18n, locale);
  const paymentTitle = resolveI18n(props.payment_title_i18n, locale);
  const submitLabel = resolveI18n(props.submit_label_i18n, locale);
  const whatsappLabel = resolveI18n(props.whatsapp_label_i18n, locale);
  const reassurance = resolveI18n(props.reassurance_i18n, locale);
  const deliverySla = resolveI18n(props.delivery_sla_i18n, locale);
  const urgencyRaw = resolveI18n(props.stock_urgency_i18n, locale);
  const urgencyMaxStock = props.urgency_max_stock ?? DEFAULT_URGENCY_MAX_STOCK;
  const urgency = urgencyRaw
    ? urgencyRaw.includes("{count}")
      ? stockLeft !== null && stockLeft > 0 && stockLeft <= urgencyMaxStock
        ? urgencyRaw.replace("{count}", String(stockLeft))
        : null
      : urgencyRaw
    : null;

  const governorate = IRAQ_GOVERNORATES.find(
    (g) => g.code === form.governorate_code,
  );
  const governorateName = governorate
    ? t
      ? governorate.name
      : governorate.name_en
    : undefined;

  // WhatsApp order alternative — same canonical tenant number + full-order
  // message builder the checkout_form WhatsApp CTA uses (product + qty +
  // whatever delivery details the shopper has typed + the total).
  const waNumber = resolveTenantWhatsapp(ctx.tenant);
  const waOrder = {
    items: [{ name: product.name, quantity: qty }],
    customer: {
      name: form.customer_name || undefined,
      phone: form.phone || undefined,
      governorate: governorateName,
      address: form.address_details || undefined,
    },
    total: formatPrice(total, locale),
  };
  const waHref =
    props.show_whatsapp && waNumber ? whatsappCartLink(waNumber, waOrder, locale) : null;
  // The way out when a submit ends unconfirmed: the same order, prefilled,
  // to the store's WhatsApp — offered even where the tile is switched off,
  // because the buyer has no other way to finish. Null without a number.
  const waFallbackHref = whatsappCartLink(waNumber, waOrder, locale);

  function set(k: FieldKey, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
    // Typing clears the field's error; it is re-checked on blur / submit.
    if (fieldErrors[k]) {
      setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
    }
  }

  /** The localised error for one field, or null when it's valid. Phones use
   *  the shared Iraqi-mobile helper (no HTML `pattern`): it accepts the
   *  "+964…" / "00964…" forms the server accepts and rejects the landline
   *  and placeholder numbers the server rejects. */
  function fieldError(k: FieldKey, raw: string): string | null {
    const v = raw.trim();
    switch (k) {
      case "customer_name":
      case "address_details":
        return v ? null : s("required");
      case "phone":
        if (!v) return s("required");
        return isValidIraqiMobile(v) ? null : s("phoneInvalid");
      case "alt_phone":
        return !v || isValidIraqiMobile(v) ? null : s("phoneInvalid");
      case "governorate_code":
        return isGovernorateCode(v) ? null : s(deliverySummary.kind === "varies" ? "governorateRequired" : "governorateRequiredFlat");
    }
  }

  /** Blur validation — only once the shopper has typed something, so
   *  tabbing through an empty form doesn't shout at every field. */
  function validateOnBlur(k: FieldKey) {
    if (form[k].trim() === "") return;
    const err = fieldError(k, form[k]);
    setFieldErrors((prev) => ({ ...prev, [k]: err ?? undefined }));
  }

  function onFormFocus(e: React.FocusEvent<HTMLFormElement>) {
    if (initiateFired.current || !product) return;
    // Only a real field counts as "started checkout" — not the stepper or
    // submit buttons.
    const target = e.target;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    )
      return;
    initiateFired.current = true;
    setInteracted(true);
    trackPixel(
      "InitiateCheckout",
      pixelContentsFromItems([
        { product_id: product.id, price: unitPrice, quantity: qty },
      ]),
    );
  }

  async function onSubmit(
    e: React.FormEvent<HTMLFormElement>,
    opts?: SubmitOptions,
  ) {
    e.preventDefault();
    if (!product || oos || submitting) return;

    // Validate every field, show every error at once, focus the first.
    const errors: FieldErrors = {};
    for (const k of FIELD_ORDER) {
      const err = fieldError(k, form[k]);
      if (err) errors[k] = err;
    }
    const phone = normalizeIraqiMobile(form.phone);
    if (!phone && !errors.phone) errors.phone = s("phoneInvalid");
    const altPhone = normalizeIraqiMobile(form.alt_phone);
    if (form.alt_phone.trim() !== "" && !altPhone && !errors.alt_phone) {
      errors.alt_phone = s("phoneInvalid");
    }
    setFieldErrors(errors);
    // The option is the first thing to fix. It is either this form's own
    // pills or, when a picker section owns the choice, that section — the
    // message then shows beside the submit button, where the shopper tapped.
    setVariantError(awaitingVariant);
    const firstInvalid = (opts?.focusOrder ?? FIELD_ORDER).find((k) => errors[k]);
    if (awaitingVariant) {
      if (chosen.pickerMounted) {
        focusVariantPicker(product.id);
      } else {
        variantPillsRef.current?.scrollIntoView?.({ block: "center" });
        variantPillsRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      }
      return;
    }
    if (firstInvalid || !phone) {
      if (opts?.focusOrder) pendingFocus.current = firstInvalid ?? "phone";
      else fieldRefs.current[firstInvalid ?? "phone"]?.focus();
      return;
    }

    setStatus("submitting");
    setErrorMsg(null);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    if (!purchaseEventIdRef.current) {
      purchaseEventIdRef.current = newPixelEventId();
    }
    // Saved BEFORE the request leaves: a reload while it is in flight comes
    // back with this key, so the next tap replays this order instead of
    // placing a second one (helpers/order-draft).
    writeOrderDraft(ctx.tenant.id, product.id, {
      form,
      idempotencyKey: idempotencyKeyRef.current,
      purchaseEventId: purchaseEventIdRef.current,
    });
    const suffix = opts?.addressSuffix?.trim();
    const addressDetails = suffix
      ? `${form.address_details.trim()} - ${suffix}`
      : form.address_details.trim();
    const items = [
      {
        product_id: product.id,
        variant_id: chosen.variant?.id ?? null,
        name: product.name,
        variant_name: chosen.variant?.name ?? null,
        // `unitPrice`, not `price`: with a quantity break selected the two
        // differ, and the server re-derives the break and rejects the base.
        price: unitPrice,
        quantity: qty,
      },
    ];
    // An accepted bump is a second line at its discounted price. The server
    // re-derives that discount too, and only honours it because this order
    // also contains the parent product above.
    if (acceptedBump) {
      items.push({
        product_id: acceptedBump.product.id,
        variant_id: null,
        name: acceptedBump.product.name,
        variant_name: null,
        price: acceptedBump.price,
        quantity: 1,
      });
    }
    // Same endpoint + payload contract as the checkout_form section —
    // only `items` differs (a single line from ctx.product) plus the
    // optional structured `alt_phone`. The funnel form has no separate
    // area field, so the governorate label fills the required `city`.
    const body = JSON.stringify({
      tenant_id: ctx.tenant.id,
      customer_name: form.customer_name.trim(),
      phone,
      governorate_code: form.governorate_code,
      city: governorateName ?? form.governorate_code,
      address_details: addressDetails,
      ...(altPhone ? { alt_phone: altPhone } : {}),
      payment_method: "cod",
      items,
      subtotal,
      locale,
      idempotency_key: idempotencyKeyRef.current,
      ...(redeemPoints > 0 ? { redeem_points: redeemPoints } : {}),
      ...(referralState.kind === "valid" && normalizeReferralCode(referralCode)
        ? { referral_code: normalizeReferralCode(referralCode) }
        : {}),
      ...(purchaseEventIdRef.current
        ? { event_id: purchaseEventIdRef.current }
        : {}),
      ab_test_arms: ctx.runtime.ab_test_arms,
    });
    // A deadline per attempt and one resend of this same body — so the same
    // key — when an attempt is not answered (helpers/submit-order). The
    // server answers a key it has seen with that order, so the resend is a
    // status check, never a second order.
    const outcome = await postOrderWithResubmit("/api/checkout/orders", body, {
      onResubmit: () => setStatus("checking"),
    });
    if (outcome.kind === "unconfirmed") {
      // Neither attempt was answered: the order may or may not exist. The key
      // stays (here and in the draft), so another tap — or a reload and a
      // tap — replays it rather than ordering twice; WhatsApp is the way to
      // finish now.
      setErrorMsg(s("orderUnconfirmed"));
      setStatus("unconfirmed");
      return;
    }
    if (outcome.ok) {
      const data = readPlacedOrder(outcome.data);
      if (data.duplicate === true) {
        // That order was counted (pixel, CAPI, funnel) when it was placed, so
        // nothing fires again, and there is no new order to thank them for —
        // the form says so instead.
        clearOrderDraft(ctx.tenant.id, product.id);
        idempotencyKeyRef.current = null;
        purchaseEventIdRef.current = null;
        setStatus("duplicate");
        return;
      }
      const orderNumber = data.orderNumber ?? "";
      if (referralState.kind === "valid") clearCapturedReferral(ctx.tenant.id);
      // Remember the shopper for next time — in their browser only.
      writeCustomerMemory(ctx.tenant.id, {
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        alt_phone: form.alt_phone.trim() || undefined,
        governorate_code: form.governorate_code,
        address_details: form.address_details.trim(),
      });
      // Stash the just-placed order for the thank-you recap — identical
      // privacy-safe path to checkout_form (only the buyer's browser
      // holds it; the success page never fetches by order number).
      try {
        sessionStorage.setItem(
          "schn:last-order",
          JSON.stringify({
            number: orderNumber,
            // The order id and the server's proof let the thank-you page's
            // post-purchase offer act on THIS order and no other. Session
            // storage only, like the rest of the stash; additive, so older
            // readers ignore them.
            order_id: data.orderId ?? null,
            upsell_token: data.upsellToken ?? null,
            // Lets the thank-you page greet the buyer by name; optional so
            // older readers of the stash keep working unchanged.
            customer_name: form.customer_name.trim(),
            items: items.map((i) => ({
              name: i.name,
              variant: i.variant_name,
              qty: i.quantity,
              price: i.price,
            })),
            subtotal,
            total: data.total ?? subtotal,
            ts: Date.now(),
          }),
        );
      } catch {
        /* sessionStorage unavailable — the recap just won't render */
      }
      // Pixel Purchase — same event_id the server sent to CAPI (dedup).
      trackPixel(
        "Purchase",
        pixelContentsFromItems(
          items.map((i) => ({
            product_id: i.product_id,
            price: i.price,
            quantity: i.quantity,
          })),
        ),
        purchaseEventIdRef.current ?? undefined,
      );
      clearOrderDraft(ctx.tenant.id, product.id);
      idempotencyKeyRef.current = null;
      purchaseEventIdRef.current = null;
      setStatus("ok");
      // Navigate to the celebratory thank-you page (full nav keeps the stash).
      window.location.href = `${base}/checkout/success${
        orderNumber ? `?order=${encodeURIComponent(orderNumber)}` : ""
      }`;
      return;
    }
    // EC24: surface the server's actionable message; when it reported line
    // issues the corrected re-submit is a fresh order, so retire the
    // idempotency key — in the draft too (mirrors checkout_form).
    const failure = outcome.data as {
      error?: string;
      issues?: CheckoutIssue[];
    } | null;
    const issues = failure && Array.isArray(failure.issues) ? failure.issues : [];
    if (issues.length > 0) {
      idempotencyKeyRef.current = null;
      writeOrderDraft(ctx.tenant.id, product.id, {
        form,
        idempotencyKey: null,
        purchaseEventId: purchaseEventIdRef.current,
      });
    }
    // Self-heal a price drift: adopt the server's verified price so the
    // shopper's retry submits (and displays) the correct number — and
    // SAY so, with the new price, instead of a generic error.
    const newPrice = issues.find(
      (i) => i.reason === "price_changed" && i.product_id === product.id,
    )?.new_price;
    if (typeof newPrice === "number") {
      setLivePrice({ variantId: chosenVariantId, price: newPrice });
      setPriceFlashAt(Date.now());
      setErrorMsg(
        s("priceChanged").replace("{price}", formatPrice(newPrice, locale)),
      );
    } else {
      // The server's own messages are Arabic; show them to Arabic-script
      // locales and the localised generic line to English readers.
      setErrorMsg((t && failure?.error) || s("errGeneric"));
    }
    setStatus("error");
  }

  const inputCls =
    "w-full bg-white py-3 pr-11 font-body text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";
  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    color: "var(--bk-ink, #1a1a1a)",
    fontFamily: "var(--bk-font-body, inherit)",
  };
  const invalidStyle: React.CSSProperties = {
    borderColor: "var(--bk-danger, #dc2626)",
  };
  const labelCls =
    "block font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft mb-bk-2xs";
  const hintCls = "text-bk-ink-faint normal-case tracking-normal";
  const errorCls = "mt-bk-2xs font-label font-bold text-xs text-bk-danger";
  const stepperBtnCls =
    "flex h-11 w-11 items-center justify-center transition-opacity duration-bk-fast motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";

  /** Layout-neutral a11y wiring for one field (id, error linkage, focus
   *  ref); each layout adds its own styling. */
  function fieldA11yCore(k: FieldKey) {
    const err = fieldErrors[k];
    return {
      id: fieldId(k),
      "aria-invalid": err ? true : undefined,
      "aria-describedby": err ? errorId(k) : undefined,
      ref: (el: FieldElement | null) => {
        fieldRefs.current[k] = el;
      },
    };
  }

  /** Shared a11y wiring for one field. */
  function fieldA11y(k: FieldKey) {
    const err = fieldErrors[k];
    return {
      ...fieldA11yCore(k),
      style: err ? { ...inputStyle, ...invalidStyle } : inputStyle,
    };
  }

  /** Inline error line for one field — a plain render helper (not a nested
   *  component type, which would remount on every keystroke). */
  function renderFieldError(k: FieldKey) {
    const err = fieldErrors[k];
    if (!err) return null;
    return (
      <p id={errorId(k)} role="alert" className={errorCls}>
        {err}
      </p>
    );
  }

  // Merchant-editable via props ("original products" / "quality guarantee"
  // are business claims a section must not force on every tenant); the
  // defaults carry the classic funnel quartet.
  const trustChips = props.trust_chips ?? [];

  // Per-product feature cards (typed upstream; guard shape defensively for
  // builder previews feeding looser data).
  const featureCards = Array.isArray(product.feature_cards)
    ? product.feature_cards.filter(
        (c) => c && typeof c.title === "string" && typeof c.body === "string",
      )
    : [];
  const featureCardsTitle = resolveI18n(props.feature_cards_title_i18n, locale);

  // Import-time gallery photos (products.gallery_urls). Typed string[], but
  // guard element shape — builder previews can feed looser data.
  const galleryUrls = Array.isArray(product.gallery_urls)
    ? product.gallery_urls.filter(
        (u): u is string => typeof u === "string" && u.length > 0,
      )
    : [];
  // Merchant-managed gallery rows (product_images, resolved upstream into
  // product.images) join the import-time list — same merge as pdp_gallery.
  const managedImages = Array.isArray(product.images)
    ? product.images.filter(
        (u): u is string => typeof u === "string" && u.length > 0,
      )
    : [];
  // Cover-first, dedup'd image list for the gallery column. With no
  // gallery sources this collapses to [image_url] (or []), so the
  // single-image rendering below stays exactly as before.
  const seenGallery = new Set<string>();
  const galleryImages: string[] = [];
  for (const url of [product.image_url, ...managedImages, ...galleryUrls]) {
    if (!url || seenGallery.has(url)) continue;
    seenGallery.add(url);
    galleryImages.push(url);
  }
  const withGallery = props.show_gallery === true && galleryImages.length > 0;
  // Main image = tapped thumb (if still in the list) ?? cover ?? first photo.
  const mainImage =
    activeImage && galleryImages.includes(activeImage)
      ? activeImage
      : (product.image_url ?? galleryImages[0]);

  if (props.layout === "express") {
    return (
      <PdpExpress
        model={{
          props,
          ctx,
          product,
          locale,
          s,
          price,
          compareAt: compareAt ?? null,
          onSale,
          discountPct,
          qty,
          setQty,
          maxQty,
          atMinQty,
          atMaxQty,
          subtotal,
          referralAmount,
          pointsDiscount,
          // The delivery the total counts: the flat fee when every governorate
          // costs the same, else the chosen governorate's fee (null = varies).
          delivery: displayedDelivery,
          total,
          shipping: commerce?.shipping,
          returnsDays,
          reviewCount,
          avgRating,
          form,
          set,
          fieldErrors,
          fieldError,
          validateOnBlur,
          fieldA11yCore,
          errorId,
          onSubmit: (e, opts) =>
            onSubmit(e, { ...opts, focusOrder: EXPRESS_FIELD_ORDER }),
          onFormFocus,
          status,
          errorMsg,
          submitting,
          submitErrorId,
          oos,
          stockLeft,
          urgency,
          waHref,
          waFallbackHref,
          galleryImages,
          priceRowRef,
          priceFlashAt,
          chosen,
          variantError,
          setVariantError,
          variantPillsRef,
          reassurance,
          deliverySla,
          featureCards,
          featureCardsTitle,
          trustChips,
          captureConsent,
        }}
      />
    );
  }

  return (
    <section className="px-4 py-4">
      <div
        className={
          // minmax(0,1fr) + min-w-0: grid tracks default to
          // minmax(auto, 1fr), and the thumbnail strip's intrinsic width
          // (n × 64px) was sizing the column — with 12 photos the page
          // rendered 1016px wide at 390px and the buy box sat off-screen.
          withGallery
            ? "mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-bk-md lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            : undefined
        }
      >
        {withGallery && (
          <div className="min-w-0 lg:sticky lg:top-4 lg:order-2">
            <div
              className="relative aspect-square overflow-hidden"
              style={{
                borderRadius: "var(--bk-radius-card, 16px)",
                backgroundColor: "var(--bk-surface-alt, #f6f1e7)",
              }}
            >
              {mainImage && (
                // The LCP element on the funnel PDP: optimised (AVIF/WebP,
                // srcset) for allow-listed hosts and fetched at high priority.
                <Image
                  src={mainImage}
                  alt={product.name}
                  fill
                  priority
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  unoptimized={!isOptimizableImageHost(mainImage)}
                  className="object-cover"
                />
              )}
            </div>
            {/* Thumbnail strip — only when the product actually has extra
                gallery photos; tapping a thumb swaps the main image. */}
            {galleryImages.length > 1 && (
              <div className="mt-bk-xs flex w-full min-w-0 gap-bk-xs overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {galleryImages.map((src, i) => (
                  <button
                    key={`${i}-${src}`}
                    type="button"
                    onClick={() => setActiveImage(src)}
                    aria-label={s("viewImage").replace(
                      "{count}",
                      String(i + 1),
                    )}
                    aria-pressed={src === mainImage}
                    className="relative h-16 w-16 shrink-0 overflow-hidden"
                    style={{
                      borderRadius: "var(--bk-radius-input, 0.75rem)",
                      border:
                        src === mainImage
                          ? "2px solid var(--bk-primary, #ff5a8a)"
                          : "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                      boxShadow:
                        src === mainImage
                          ? "0 0 0 3px color-mix(in srgb, var(--bk-primary, #ff5a8a) 30%, transparent)"
                          : undefined,
                    }}
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="64px"
                      unoptimized={!isOptimizableImageHost(src)}
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <BentoCard
          bg="white"
          size="md"
          className={`min-w-0 p-bk-lg sm:p-bk-xl space-y-bk-md ${withGallery ? "lg:order-1" : "mx-auto max-w-2xl"}`}
        >
          {/* ── Rating chip + title + price ── */}
          <div className="space-y-bk-xs text-center">
            {ratingChip && (
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 font-label font-bold text-xs"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--bk-accent, #ffd84a) 22%, var(--bk-surface, #ffffff))",
                  color: "var(--bk-ink, #1a1a1a)",
                  borderRadius: "var(--bk-radius-pill, 9999px)",
                  border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                }}
              >
                {/* Real average-rating stars (filled = rounded avg_rating) —
                    the shared primitive, so the PDP and the reviews block
                    draw the same star. */}
                <Stars
                  value={avgRating}
                  size={14}
                  label={`${avgRating.toFixed(1)} / 5`}
                />
                <span className="tabular-nums">{ratingChip}</span>
              </div>
            )}
            <h1
              // h1 semantics on the h2 step: product names run long ("عطر ويفر
              // انتنس الفاخر من باريس كورنر للرجال") and the h1 step wraps to
              // three heavy lines at 390px.
              className="font-display font-black text-bk-h2 text-balance"
              style={{ color: "var(--bk-ink, #1a1a1a)" }}
            >
              {product.name}
            </h1>
            {props.show_price_row && (
              <div
                ref={priceRowRef}
                data-price-row
                className="-mx-2 flex flex-wrap items-baseline justify-center gap-bk-xs scroll-mt-24 px-2 py-1 transition-[background-color] duration-bk-base motion-reduce:transition-none"
                style={{
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  backgroundColor:
                    priceFlashAt !== null
                      ? "color-mix(in srgb, var(--bk-accent, #ffd84a) 45%, transparent)"
                      : "transparent",
                }}
              >
                <span className="font-body text-sm text-bk-ink-soft">
                  {s("price")}
                </span>
                <span
                  className="font-display font-black text-3xl tabular-nums"
                  style={{
                    // Green means "this is what you pay", exactly as on the
                    // product cards. The same number was yellow here and
                    // green there, so a shopper arriving from a card met it
                    // in a different colour.
                    color: onSale
                      ? "color-mix(in srgb, var(--bk-success, #3ecf8e) 38%, var(--bk-ink, #1a1a1a))"
                      : "var(--bk-ink, #1a1a1a)",
                  }}
                >
                  <bdi>{formatPrice(price, locale)}</bdi>
                </span>
                {onSale && compareAt != null && (
                  <span
                    className="font-body text-lg line-through tabular-nums"
                    style={{
                      color:
                        "color-mix(in srgb, var(--bk-danger, #e2574c) 65%, var(--bk-ink, #1a1a1a))",
                    }}
                  >
                    <bdi>{formatPrice(compareAt, locale)}</bdi>
                  </span>
                )}
                {onSale && (
                  <span
                    className="px-2 py-0.5 font-display font-black text-xs tabular-nums"
                    style={{
                      backgroundColor: "var(--bk-accent, #ffd84a)",
                      color: "var(--bk-ink, #1a1a1a)",
                      borderRadius: "var(--bk-radius-pill, 9999px)",
                    }}
                  >
                    {/* formatPercent owns the locale's sign, so the PDP
                        reads "٢٣٪" like every card rather than "-23%". */}
                    <bdi>{formatPercent(discountPct ?? 0, locale)}</bdi>
                  </span>
                )}
              </div>
            )}
            {/* Per-product promo notice — the merchant's short_description
                (e.g. "خصم 10% اليوم فقط"), dynamic from the product row and
                absent when the merchant sets none. */}
            {props.show_notice !== false && product.short_description && (
              <div
                className="mx-auto inline-flex max-w-full items-center gap-1.5 px-3 py-1.5 font-label font-bold text-xs"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--bk-accent, #ffd84a) 30%, var(--bk-surface, #ffffff))",
                  color: "var(--bk-ink, #1a1a1a)",
                  borderRadius: "var(--bk-radius-pill, 9999px)",
                  border: "1px dashed var(--bk-accent, #ffd84a)",
                }}
              >
                <MaterialIcon name="local_offer" className="text-sm" />
                <span className="truncate">{product.short_description}</span>
              </div>
            )}
          </div>

          <form
            id={DIRECT_ORDER_FORM_ID}
            // onSubmit validates every field and renders inline errors;
            // without noValidate the browser's constraint tooltip fires first
            // and the inline messages never show.
            noValidate
            onSubmit={onSubmit}
            onFocusCapture={onFormFocus}
            className="scroll-mt-24 space-y-bk-md"
          >
            {/* ── Step 01 — delivery details ── */}
            <div
              className="space-y-bk-sm"
              data-layer="form"
              data-layer-label="Order form"
            >
              <div className="flex items-center gap-bk-xs">
                <StepChip n={1} />
                <h2 className="font-display font-black text-base sm:text-lg">
                  {formTitle}
                </h2>
              </div>

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

              <div>
                <label htmlFor={fieldId("customer_name")} className={labelCls}>
                  {s("fullName")}
                </label>
                <IconField icon="person">
                  <input
                    type="text"
                    name="name"
                    required
                    dir="auto"
                    autoComplete="name"
                    placeholder={s("namePlaceholder")}
                    value={form.customer_name}
                    onChange={(e) => set("customer_name", e.target.value)}
                    onBlur={() => validateOnBlur("customer_name")}
                    className={cn(inputCls, "pl-4")}
                    {...fieldA11y("customer_name")}
                  />
                </IconField>
                {renderFieldError("customer_name")}
              </div>

              <div>
                <label htmlFor={fieldId("phone")} className={labelCls}>
                  {s("phone")} <span className={hintCls}>{s("phoneHint")}</span>
                </label>
                <IconField icon="call">
                  <input
                    type="tel"
                    name="phone"
                    required
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder={s("phonePlaceholder")}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    onBlur={() => validateOnBlur("phone")}
                    className={cn(inputCls, "pl-4")}
                    {...fieldA11y("phone")}
                  />
                </IconField>
                {renderFieldError("phone")}
                {captureConsent && (
                  <p
                    data-capture-consent=""
                    data-i18n-field="capture_consent_i18n"
                    className="mt-bk-2xs font-label text-xs text-bk-ink-faint"
                  >
                    {captureConsent}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={fieldId("alt_phone")} className={labelCls}>
                  {s("altPhone")}{" "}
                  <span className={hintCls}>{s("altPhoneHint")}</span>
                </label>
                <IconField icon="phone_iphone">
                  <input
                    type="tel"
                    name="alt_phone"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={s("phonePlaceholder")}
                    value={form.alt_phone}
                    onChange={(e) => set("alt_phone", e.target.value)}
                    onBlur={() => validateOnBlur("alt_phone")}
                    className={cn(inputCls, "pl-4")}
                    {...fieldA11y("alt_phone")}
                  />
                </IconField>
                {renderFieldError("alt_phone")}
              </div>

              <div>
                <label
                  htmlFor={fieldId("governorate_code")}
                  className={labelCls}
                >
                  {s("governorate")}
                </label>
                <IconField icon="expand_more" leading="location_on">
                  <select
                    name="governorate"
                    required
                    autoComplete="address-level1"
                    value={form.governorate_code}
                    onChange={(e) => set("governorate_code", e.target.value)}
                    onBlur={() => validateOnBlur("governorate_code")}
                    className={cn(inputCls, "appearance-none pl-11")}
                    {...fieldA11y("governorate_code")}
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
                </IconField>
                {renderFieldError("governorate_code")}
              </div>

              <div>
                <label
                  htmlFor={fieldId("address_details")}
                  className={labelCls}
                >
                  {s("address")}
                </label>
                <IconField icon="home_pin">
                  <input
                    type="text"
                    name="address"
                    required
                    dir="auto"
                    autoComplete="street-address"
                    placeholder={s("addressPlaceholder")}
                    value={form.address_details}
                    onChange={(e) => set("address_details", e.target.value)}
                    onBlur={() => validateOnBlur("address_details")}
                    className={cn(inputCls, "pl-4")}
                    {...fieldA11y("address_details")}
                  />
                </IconField>
                {renderFieldError("address_details")}
              </div>
            </div>

            {/* ── Step 02 — quantity ── */}
            {chosen.soldByVariant && !chosen.pickerMounted && (
              <div
                ref={variantPillsRef}
                data-layer="variants"
                data-layer-label="Options"
                role="group"
                aria-label={s("chooseVariant")}
                className="space-y-bk-xs"
              >
                <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-bk-ink-soft">
                  {s("chooseVariant")}
                </p>
                <div className="flex flex-wrap gap-bk-xs">
                  {chosen.variants.map((v) => {
                    const left = stockLeftFor(product, v);
                    const active = chosen.variant?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        aria-pressed={active}
                        disabled={left <= 0}
                        onClick={() => {
                          chosen.select(v.id);
                          setVariantError(false);
                        }}
                        className={cn(
                          "min-h-11 rounded-bk-pill border-2 px-4 font-display text-sm font-black transition-colors",
                          active ? "border-bk-ink bg-bk-ink text-bk-surface" : "border-bk-ink bg-bk-surface text-bk-ink",
                          left <= 0 && "opacity-50 line-through",
                        )}
                      >
                        {v.name}
                        {v.price !== product.price && (
                          <span className="ms-1.5 font-body text-xs font-bold tabular-nums">
                            <bdi>{formatPrice(v.price, locale)}</bdi>
                          </span>
                        )}
                        {left <= 0 && (
                          <span className="ms-1 font-body text-xs">{s("variantOut")}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {showVariantError && (
                  <p id={variantErrorId} role="alert" className={errorCls}>
                    {s("chooseVariantFirst")}
                  </p>
                )}
              </div>
            )}

            <div
              className="space-y-bk-xs"
              data-layer="qty"
              data-layer-label="Quantity stepper"
            >
              <div className="flex items-center gap-bk-xs">
                <StepChip n={2} />
                <h2 className="font-display font-black text-base sm:text-lg">
                  {qtyTitle}
                </h2>
              </div>
              {/* Tappable rungs when the merchant set price breaks. This
                  reframes the choice from "one?" to "how many?", and each
                  tile states the real saving rather than implying one.
                  The stepper stays below for any quantity in between. */}
              {ladder.length > 0 && (
                <div
                  className="grid grid-cols-3 gap-bk-2xs"
                  role="group"
                  aria-label={qtyTitle || s("quantity")}
                >
                  {ladder.map((rung) => {
                    const active = qty === rung.quantity;
                    return (
                      <button
                        key={rung.quantity}
                        type="button"
                        onClick={() => setQty(rung.quantity)}
                        aria-pressed={active}
                        className={cn(
                          "flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center",
                          PRESSABLE,
                        )}
                        style={{
                          border: active
                            ? "2px solid var(--bk-ink, #1a1a1a)"
                            : "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                          borderRadius: "var(--bk-radius-input, 0.75rem)",
                          backgroundColor: active
                            ? "var(--bk-decor-a, #fff)"
                            : "var(--bk-surface-alt, #fff)",
                        }}
                      >
                        <span className="font-display text-sm font-black tabular-nums">
                          {rung.quantity}
                        </span>
                        <span className="font-body text-[11px] tabular-nums text-bk-ink-soft">
                          <bdi>{formatPrice(rung.unit_price, locale)}</bdi>
                        </span>
                        {rung.saves > 0 && (
                          <span className="font-label text-[10px] font-bold tabular-nums text-bk-primary">
                            <bdi>
                              {locale === "en" ? "save " : locale === "ku" ? "دەپارێزیت " : "توفّر "}
                              {formatPrice(rung.saves, locale)}
                            </bdi>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <div
                className="flex items-center justify-between bg-white px-2 py-1.5"
                style={{
                  border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                }}
              >
                <span className="pl-2 font-body text-sm text-bk-ink-soft">
                  {s("quantity")}
                </span>
                {/* 44 px targets; at the bounds the button stays in the tab
                    order but is announced + drawn as disabled, so a tap
                    at "1" does nothing instead of silently no-op'ing an
                    apparently live button. */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!atMinQty) setQty((q) => Math.max(1, q - 1));
                    }}
                    aria-label={s("decrease")}
                    aria-disabled={atMinQty || undefined}
                    className={cn(stepperBtnCls, atMinQty && "opacity-40")}
                    style={{
                      border:
                        "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                      borderRadius: "var(--bk-radius-input, 0.75rem)",
                      color: "var(--bk-ink, #1a1a1a)",
                    }}
                  >
                    <MaterialIcon name="remove" />
                  </button>
                  <output
                    aria-live="polite"
                    className="w-10 text-center font-display font-black text-lg tabular-nums"
                    style={{ fontFamily: "var(--bk-font-display, inherit)" }}
                  >
                    {qty}
                  </output>
                  <button
                    type="button"
                    onClick={() => {
                      if (!atMaxQty) setQty((q) => Math.min(maxQty, q + 1));
                    }}
                    aria-label={s("increase")}
                    aria-disabled={atMaxQty || undefined}
                    className={cn(stepperBtnCls, atMaxQty && "opacity-40")}
                    style={{
                      backgroundColor: "var(--bk-primary, #ff5a8a)",
                      color: "var(--bk-on-primary, #fff)",
                      borderRadius: "var(--bk-radius-input, 0.75rem)",
                    }}
                  >
                    <MaterialIcon name="add" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Payment method (COD, highlighted) ── */}
            <div className="space-y-bk-xs">
              <h2 className="font-display font-black text-base sm:text-lg">
                {paymentTitle}
              </h2>
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--bk-primary, #ff5a8a) 7%, var(--bk-surface, #ffffff))",
                  border: "2px solid var(--bk-primary, #ff5a8a)",
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                }}
              >
                <MaterialIcon name="payments" className="text-2xl" />
                <div className="flex-1 leading-tight">
                  <p className="font-display font-black text-sm">{s("cod")}</p>
                  <p className="font-body text-xs text-bk-ink-soft">
                    {s("codNote")}
                  </p>
                  {/* Merchant commitments only — the delivery promise is a
                      prop and the returns window comes from the tenant's
                      commerce config; neither is invented here. */}
                  {(deliverySla || (returnsDays && returnsDays > 0) || pointsToEarn > 0 || inspectBeforePaying) && (
                    <ul className="mt-1 space-y-0.5 font-body text-xs text-bk-ink-soft">
                      {deliverySla && (
                        <li
                          className="flex items-center gap-1"
                          data-i18n-field="delivery_sla_i18n"
                        >
                          <MaterialIcon
                            name="local_shipping"
                            className="text-sm"
                          />
                          {deliverySla}
                        </li>
                      )}
                      {returnsDays && returnsDays > 0 && (
                        <li className="flex items-center gap-1">
                          <MaterialIcon name="cached" className="text-sm" />
                          {returnsLine(returnsDays, locale)}
                        </li>
                      )}
                      {pointsToEarn > 0 && (
                        <li className="flex items-center gap-1" data-points-to-earn={pointsToEarn}>
                          <MaterialIcon name="loyalty" className="text-sm" />
                          {s("earnOnDelivery").replace("{points}", formatPoints(pointsToEarn, locale))}
                        </li>
                      )}
                      {inspectBeforePaying && (
                        <li className="flex items-center gap-1" data-inspect-before-paying>
                          <MaterialIcon name="visibility" className="text-sm" />
                          {s("inspectBeforePaying")}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                <span
                  aria-hidden="true"
                  style={{ color: "var(--bk-primary, #ff5a8a)" }}
                >
                  <MaterialIcon
                    name="radio_button_checked"
                    className="text-xl"
                  />
                </span>
              </div>
            </div>

            {/* ── Total row ── */}
            <div
              className="space-y-1 px-4 py-3"
              style={{
                backgroundColor: "var(--bk-surface, #fff7ed)",
                borderRadius: "var(--bk-radius-input, 0.75rem)",
              }}
            >
              <div className="flex items-center justify-between font-body text-sm text-bk-ink-soft">
                <span>{s("delivery")}</span>
                <span className="tabular-nums" data-delivery-fee>
                  {displayedDelivery === null ? (
                    <bdi>
                      {s("deliveryRange")
                        .replace("{min}", formatPrice(deliverySummary.fee.min, locale))
                        .replace("{max}", formatPrice(deliverySummary.fee.max, locale))}
                    </bdi>
                  ) : displayedDelivery === 0 ? (
                    s("deliveryFree")
                  ) : (
                    <bdi>
                      {formatPrice(displayedDelivery, locale)}
                      {flatFeeKnown && <span className="ms-1 text-xs">{s("deliveryAllGovernorates")}</span>}
                    </bdi>
                  )}
                </span>
              </div>
              {/* Only what the merchant configured: a free-delivery line when
                  every rate agrees on a threshold, an ETA when one is set. */}
              {(flatFeeKnown && deliverySummary.free_threshold_iqd && displayedDelivery !== 0) ||
              etaHours ||
              (delivery === null && deliverySummary.eta_hours) ? (
                <p className="font-body text-xs text-bk-ink-soft" data-delivery-note>
                  {[
                    flatFeeKnown && deliverySummary.free_threshold_iqd && displayedDelivery !== 0
                      ? s("deliveryFreeAbove").replace(
                          "{amount}",
                          formatPrice(deliverySummary.free_threshold_iqd, locale),
                        )
                      : null,
                    etaHours
                      ? s("deliveryEta").replace("{eta}", formatHours(etaHours, locale))
                      : delivery === null && deliverySummary.eta_hours
                        ? deliverySummary.eta_hours.min === deliverySummary.eta_hours.max
                          ? s("deliveryEta").replace("{eta}", formatHours(deliverySummary.eta_hours.min, locale))
                          : s("deliveryEtaRange")
                              .replace("{min}", formatHours(deliverySummary.eta_hours.min, locale))
                              .replace("{max}", formatHours(deliverySummary.eta_hours.max, locale))
                        : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="font-display font-black text-base">
                  {s("total")}
                  {totalExcludesDelivery && (
                    <span className="ms-1 font-body text-xs font-normal text-bk-ink-soft">
                      {s("totalExcludesDelivery")}
                    </span>
                  )}
                </span>
                <span
                  className="font-display font-black text-xl tabular-nums"
                  style={{ color: "var(--bk-ink, #1a1a1a)" }}
                >
                  <bdi>{formatPrice(total, locale)}</bdi>
                </span>
              </div>
            </div>

            {/* ── Order bump ──
                Immediately before the submit button, where an add-on belongs:
                the decision to buy is already made, so this is an addition
                rather than a distraction from it. A checkbox, not a second
                CTA — it must never compete with the order button. */}
            {bumpProduct && bumpAvailable && (
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-bk-sm p-bk-sm",
                  PRESSABLE,
                )}
                style={{
                  border: bumpAccepted
                    ? "2px solid var(--bk-ink, #1a1a1a)"
                    : "1px dashed var(--bk-divider, rgb(26 26 26 / 0.3))",
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  backgroundColor: bumpAccepted
                    ? "var(--bk-decor-a, #fff)"
                    : "var(--bk-surface-alt, #fff)",
                }}
                data-layer="bump"
                data-layer-label="Order bump"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-[var(--bk-primary,#ff5a8a)]"
                  checked={bumpAccepted}
                  onChange={(e) => setBumpAccepted(e.target.checked)}
                />
                {bumpProduct.image_url && (
                  <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-bk-input">
                    <Image
                      src={bumpProduct.image_url}
                      alt=""
                      fill
                      sizes="44px"
                      unoptimized={!isOptimizableImageHost(bumpProduct.image_url)}
                      className="object-cover"
                    />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-black text-bk-ink">
                    {bumpOffer?.headline || bumpProduct.name}
                  </span>
                  {bumpOffer?.description && (
                    <span className="block font-body text-xs text-bk-ink-soft">
                      {bumpOffer.description}
                    </span>
                  )}
                  <span className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="font-display text-sm font-black tabular-nums text-bk-primary">
                      <bdi>{formatPrice(bumpPrice, locale)}</bdi>
                    </span>
                    {bumpPrice < bumpBasePrice && (
                      <span className="font-body text-[11px] tabular-nums text-bk-ink-soft line-through">
                        <bdi>{formatPrice(bumpBasePrice, locale)}</bdi>
                      </span>
                    )}
                  </span>
                </span>
              </label>
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

            {/* ── Loyalty points redemption ── */}
            {loyaltyCfg?.enabled && (pointsBalance ?? 0) > 0 && (
              <div
                data-testid="pdp-redeem-points"
                className="space-y-bk-xs rounded-bk-input bg-bk-decor-a/40 p-bk-sm"
              >
                <div className="flex items-center justify-between gap-bk-sm">
                  <span className="inline-flex items-center gap-2 font-display text-sm font-black tabular-nums text-bk-ink">
                    <MaterialIcon name="loyalty" className="text-xl" />
                    {s("youHavePoints").replace("{points}", formatPoints(pointsBalance ?? 0, locale))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRedeemPoints(pointsBalance ?? 0)}
                    className="min-h-11 font-label text-xs font-bold underline"
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
                    aria-label={s("enterPoints")}
                    value={redeemPoints || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      setRedeemPoints(Math.min(n, pointsBalance ?? 0));
                    }}
                    className="w-24 px-3 py-2 font-body text-base tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
                    style={inputStyle}
                  />
                  <span className="font-label text-sm font-bold tabular-nums">
                    {pointsDiscount > 0
                      ? s("pointsOff").replace("{amount}", `−${formatPrice(pointsDiscount, locale)}`)
                      : s("enterPoints")}
                  </span>
                </div>
              </div>
            )}

            {/* ── Submit + WhatsApp ── */}
            <div
              className="space-y-bk-xs"
              data-layer="submit"
              data-layer-label="Order buttons"
            >
              {/* Disabled while a submission is in flight (aria-busy says
                  why): a tap during the same-key resend must start nothing
                  new. Sold-out disables it too. */}
              <ChunkyButton
                type="submit"
                bg="pink"
                size="lg"
                fullWidth
                disabled={oos || submitting}
                aria-busy={submitting || undefined}
                aria-describedby={
                  [
                    showVariantError ? variantErrorId : null,
                    status === "error" || status === "unconfirmed" ? submitErrorId : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              >
                {submitting ? (
                  <>
                    <MaterialIcon
                      name="progress_activity"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    {status === "checking" ? s("checkingOrder") : s("placingOrder")}
                  </>
                ) : oos ? (
                  s("outOfStock")
                ) : awaitingVariant ? (
                  s("chooseVariant")
                ) : (
                  submitLabel
                )}
              </ChunkyButton>

              {/* A picker section owns the choice, so the form has no pills to
                  hang the message on — say it here, where the shopper tapped. */}
              {showVariantError && chosen.pickerMounted && (
                <p
                  id={variantErrorId}
                  role="alert"
                  className="text-center font-label font-bold text-sm text-bk-danger"
                >
                  {s("chooseVariantFirst")}
                </p>
              )}

              {reassurance && (
                <p
                  className="flex items-center justify-center gap-1.5 text-center font-body text-sm text-bk-ink-soft"
                  data-i18n-field="reassurance_i18n"
                >
                  <MaterialIcon
                    name="visibility"
                    className="text-lg text-bk-primary"
                  />
                  {reassurance}
                </p>
              )}

              {waHref && (
                <ChunkyLink
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  bg="success"
                  size="lg"
                  fullWidth
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  {whatsappLabel}
                </ChunkyLink>
              )}

              {status === "error" && (
                <p
                  id={submitErrorId}
                  role="alert"
                  className="text-center font-label font-bold text-sm text-bk-danger"
                >
                  {errorMsg ?? s("errGeneric")}
                </p>
              )}
              {status === "ok" && (
                <p
                  role="status"
                  className="text-center font-label font-bold text-sm text-bk-success"
                >
                  {s("orderReceived")}
                </p>
              )}
              {status === "unconfirmed" && (
                <div id={submitErrorId} role="alert" className="space-y-bk-xs">
                  <p className="text-center font-label font-bold text-sm text-bk-danger">
                    {errorMsg ?? s("orderUnconfirmed")}
                  </p>
                  {waFallbackHref && (
                    <ChunkyLink
                      href={waFallbackHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      bg="success"
                      size="lg"
                      fullWidth
                      data-wa-fallback="true"
                    >
                      <WhatsAppIcon className="h-5 w-5" />
                      {s("sendOnWhatsapp")}
                    </ChunkyLink>
                  )}
                </div>
              )}
              {status === "duplicate" && (
                <p
                  role="status"
                  className="text-center font-label font-bold text-sm text-bk-success"
                >
                  {s("alreadyOrdered")}
                </p>
              )}

              {urgency && !oos && (
                <p className="flex items-center justify-center gap-1.5 font-label font-bold text-sm">
                  <span
                    aria-hidden="true"
                    style={{ color: "var(--bk-danger, #e2574c)" }}
                  >
                    <MaterialIcon
                      name="local_fire_department"
                      className="text-lg"
                    />
                  </span>
                  {urgency}
                </p>
              )}
            </div>
          </form>

          {/* ── Description ── */}
          {props.show_description && product.description && (
            <div className="border-t border-bk-divider pt-bk-md">
              <p className="whitespace-pre-line font-body text-sm leading-relaxed text-bk-ink-soft">
                {product.description}
              </p>
            </div>
          )}

          {/* ── Per-product feature cards — data-driven from the product
              row, absent when none. ── */}
          {featureCards.length > 0 && (
            <div className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
              {featureCardsTitle && (
                <h2
                  className="text-center font-display font-black text-lg sm:text-xl"
                  data-i18n-field="feature_cards_title_i18n"
                >
                  {featureCardsTitle}
                </h2>
              )}
              <div className="grid grid-cols-1 gap-bk-sm sm:grid-cols-2">
                {featureCards.map((c, i) => (
                  <div
                    key={`${c.title}-${i}`}
                    className="flex items-start gap-3 p-3"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--bk-accent, #ffd84a) 8%, var(--bk-surface, #ffffff))",
                      borderRadius: "var(--bk-radius-card, 1rem)",
                      border:
                        "1px solid var(--bk-divider, rgb(26 26 26 / 0.1))",
                    }}
                  >
                    {c.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element -- arbitrary tenant-hosted note art, small fixed size
                      <img
                        src={c.image_url}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-bk-input object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-label font-bold text-sm text-bk-ink">
                        {c.title}
                      </p>
                      <p className="font-body text-xs leading-relaxed text-bk-ink-soft">
                        {c.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Trust chips ── */}
          {trustChips.length > 0 && (
            <div className="flex flex-wrap items-start justify-center gap-bk-md border-t border-bk-divider pt-bk-md">
              {trustChips.map((c, i) => (
                <div
                  key={`${c.icon}-${i}`}
                  className="flex w-20 flex-col items-center gap-1 text-center"
                >
                  <span
                    aria-hidden="true"
                    style={{ color: "var(--bk-primary, #ff5a8a)" }}
                  >
                    <MaterialIcon name={c.icon} className="text-2xl" />
                  </span>
                  <span
                    className="font-label font-bold text-[11px] leading-tight text-bk-ink-soft"
                    data-i18n-field="trust_chips.label_i18n"
                  >
                    {resolveI18n(c.label_i18n, locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </BentoCard>
      </div>
    </section>
  );
}
