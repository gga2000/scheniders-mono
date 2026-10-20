// =====================================================================
// Order status → what the shopper is told
// =====================================================================
// The store runs a WhatsApp-confirmation flow: an order arrives, the bot
// messages the customer, the customer confirms, ops confirm, courier
// delivers, cash at the door. The tracker's job is to tell the customer
// where they are in THAT flow and what to do next — not to leak the 13
// internal statuses ops use.
//
// Two layers, on purpose:
//   - `stageForStatus` maps internal status → customer-facing stage. The
//     public lookup RPC performs the same mapping in SQL; a test pins the
//     two tables together so they cannot drift.
//   - `resolveNarrative` merges the merchant's edits over the shipped
//     defaults, per stage, and fills `{contact}` with the tenant's number.
// =====================================================================

import type {
  CustomerOrderStage,
  I18nString,
  LocaleCode,
  OrderStatusNarrative,
} from "./types/store-config-v2";
import { resolveI18n } from "./types/store-config-v2";

export const CUSTOMER_ORDER_STAGES: readonly CustomerOrderStage[] = [
  "placed",
  "awaiting_confirmation",
  "confirmed",
  "shipped",
  "delivered",
  "no_response",
  "on_hold",
  "cancelled",
  "returning",
  "refunded",
];

/**
 * Internal status → customer stage. Every status observed in production is
 * listed explicitly; anything unknown falls to "placed", the least
 * committal stage, rather than to an error the shopper cannot act on.
 */
export const STATUS_TO_STAGE: Readonly<Record<string, CustomerOrderStage>> = {
  new: "placed",
  pending_checkout: "placed",
  contacted: "awaiting_confirmation",
  confirmed: "confirmed",
  in_transit: "shipped",
  delivered: "delivered",
  completed: "delivered",
  no_response: "no_response",
  suspended: "on_hold",
  cancelled: "cancelled",
  rejected: "cancelled",
  return_pending: "returning",
  refund_delivered: "refunded",
};

export function stageForStatus(status: string | null | undefined): CustomerOrderStage {
  return STATUS_TO_STAGE[(status ?? "").trim()] ?? "placed";
}

const STAGE_SET: ReadonlySet<string> = new Set(CUSTOMER_ORDER_STAGES);

/**
 * Accept a value that is EITHER an internal status OR already a stage —
 * the lookup RPC's `stage` column and its legacy `status` buckets are both
 * stage names, while older callers pass raw statuses. A stage name fed to
 * `stageForStatus` alone would fall through to "placed" — which is how a
 * shipped order once reported itself as merely placed.
 */
export function coerceStage(value: string | null | undefined): CustomerOrderStage {
  const v = (value ?? "").trim();
  return STAGE_SET.has(v) ? (v as CustomerOrderStage) : stageForStatus(v);
}

/** The happy path, in order — drives the timeline. Off-path stages sit outside it. */
export const TIMELINE_STAGES = [
  "placed",
  "awaiting_confirmation",
  "confirmed",
  "shipped",
  "delivered",
] as const satisfies readonly CustomerOrderStage[];

export type TimelineStage = (typeof TIMELINE_STAGES)[number];

/* ─────────────────────────────────────────────────────────────────── */
/* Shipped defaults — Iraqi dialect, WhatsApp flow                      */
/* ─────────────────────────────────────────────────────────────────── */

const ar = (s: string, en: string): I18nString => ({ ar: s, en });

export const DEFAULT_NARRATIVES: Readonly<Record<CustomerOrderStage, Required<Pick<OrderStatusNarrative, "title_i18n" | "body_i18n">> & OrderStatusNarrative>> = {
  placed: {
    title_i18n: ar("طلبك وصلنا", "We have your order"),
    body_i18n: ar(
      "فريقنا راح يتواصل وياك عبر واتساب حتى يأكد الطلب.",
      "Our team will reach you on WhatsApp to confirm it.",
    ),
    next_i18n: ar(
      "ما وصلتك رسالة؟ اتصل بينا على {contact}.",
      "No message yet? Call us on {contact}.",
    ),
    cta: { kind: "phone", label_i18n: ar("اتصل بينا", "Call us") },
  },
  awaiting_confirmation: {
    title_i18n: ar("ننتظر تأكيدك", "Waiting for your confirmation"),
    body_i18n: ar(
      "دزينالك رسالة على واتساب. أكّد الطلب حتى نكمل.",
      "We sent you a WhatsApp message. Confirm the order so we can continue.",
    ),
    next_i18n: ar("ما لكيت الرسالة؟ اكتبلنا مباشرة.", "Can't find it? Message us directly."),
    cta: { kind: "whatsapp", label_i18n: ar("أكّد على واتساب", "Confirm on WhatsApp") },
  },
  confirmed: {
    title_i18n: ar("طلبك مؤكد ✓", "Order confirmed ✓"),
    body_i18n: ar("قيد التحضير. راح نسلّمه للمندوب قريباً.", "Being prepared. It goes to the courier soon."),
  },
  shipped: {
    title_i18n: ar("طلبك بالطريق", "On its way"),
    body_i18n: ar(
      "المندوب راح يتصل بيك قبل ما يوصل. خلي التلفون قريب منك.",
      "The courier will call before arriving. Keep your phone close.",
    ),
    next_i18n: ar("تدفع نقداً عند الاستلام.", "You pay cash on delivery."),
  },
  delivered: {
    title_i18n: ar("تم التسليم. شكراً!", "Delivered. Thank you!"),
    body_i18n: ar("نتمنى يعجبك. رأيك يهمنا.", "We hope you love it. Your opinion matters to us."),
    cta: { kind: "review", label_i18n: ar("قيّم طلبك", "Rate your order") },
  },
  no_response: {
    title_i18n: ar("حاولنا نتصل بيك", "We tried to reach you"),
    body_i18n: ar(
      "ما كدرنا نوصلّك. طلبك محفوظ — راجعنا حتى نكمله.",
      "We couldn't get through. Your order is saved — get back to us to continue.",
    ),
    cta: { kind: "whatsapp", label_i18n: ar("راجعنا على واتساب", "Reach us on WhatsApp") },
  },
  on_hold: {
    title_i18n: ar("طلبك متوقف مؤقتاً", "Your order is on hold"),
    body_i18n: ar("تواصل وياتا حتى نشوف شنو صار.", "Get in touch and we'll sort it out."),
    cta: { kind: "whatsapp", label_i18n: ar("تواصل وياتا", "Contact us") },
  },
  cancelled: {
    title_i18n: ar("تم إلغاء الطلب", "Order cancelled"),
    body_i18n: ar("إذا كان بالغلط أو تريد تعيده، إحنا هنا.", "If that was a mistake or you'd like to reorder, we're here."),
    cta: { kind: "reorder", label_i18n: ar("اطلب من جديد", "Order again") },
  },
  returning: {
    title_i18n: ar("الطلب راجع إلنا", "Coming back to us"),
    body_i18n: ar(
      "ما تم استلامه. إذا بعدك تريده، راجعنا ونرتّب توصيل ثاني.",
      "It wasn't received. If you still want it, get back to us and we'll arrange another delivery.",
    ),
    cta: { kind: "whatsapp", label_i18n: ar("أريد إعادة التوصيل", "Redeliver, please") },
  },
  refunded: {
    title_i18n: ar("تم إرجاع المبلغ", "Refund completed"),
    body_i18n: ar("شكراً لصبرك.", "Thank you for your patience."),
  },
};

/* ─────────────────────────────────────────────────────────────────── */
/* Resolution                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface ResolvedNarrative {
  stage: CustomerOrderStage;
  title: string;
  body: string;
  next: string | null;
  cta: { kind: NonNullable<OrderStatusNarrative["cta"]>["kind"]; label: string; value: string | null } | null;
  /** Index into TIMELINE_STAGES, or -1 when the stage is off the happy path. */
  timeline_index: number;
}

/** Substitute `{contact}`; drop the sentence entirely when no number exists. */
function fillContact(text: string, contact: string | null): string | null {
  if (!text.includes("{contact}")) return text;
  return contact ? text.replaceAll("{contact}", contact) : null;
}

/**
 * The merchant's copy for a stage, over the shipped defaults, with the
 * tenant's contact number filled in. A line that needs a number the tenant
 * has not set is dropped rather than rendered with a hole.
 */
export function resolveNarrative(
  stage: CustomerOrderStage,
  locale: LocaleCode,
  overrides: Partial<Record<CustomerOrderStage, OrderStatusNarrative>> | null | undefined,
  contact: string | null,
): ResolvedNarrative {
  const base = DEFAULT_NARRATIVES[stage];
  const own = overrides?.[stage] ?? {};
  // Precedence: the merchant's line IN THIS LOCALE, then the shipped default
  // in this locale, then whatever the fallback chain finds. Consulting the
  // override first through resolveI18n's cross-locale fallback would push a
  // merchant's Arabic-only edit onto English visitors when a proper English
  // default exists — wrong language beats no line, but a right-language
  // default beats both.
  const direct = (s: I18nString | undefined): string => (s?.[locale] ?? "").trim();
  const pick = (k: "title_i18n" | "body_i18n" | "next_i18n"): string =>
    direct(own[k]) || resolveI18n(base[k], locale) || resolveI18n(own[k], locale);

  const title = fillContact(pick("title_i18n"), contact) ?? "";
  const body = fillContact(pick("body_i18n"), contact) ?? "";
  const nextText = own.next_i18n || base.next_i18n ? pick("next_i18n") : "";
  const next = nextText ? fillContact(nextText, contact) : null;

  const ctaSrc = own.cta ?? base.cta ?? null;
  const cta = ctaSrc
    ? {
        kind: ctaSrc.kind,
        label: resolveI18n(ctaSrc.label_i18n ?? base.cta?.label_i18n, locale),
        value: ctaSrc.value ?? null,
      }
    : null;

  return {
    stage,
    title,
    body,
    next: next && next.trim() ? next : null,
    // A phone/whatsapp CTA with no number to dial is a dead button.
    cta: cta && (cta.kind === "phone" || cta.kind === "whatsapp") && !contact ? null : cta,
    timeline_index: (TIMELINE_STAGES as readonly CustomerOrderStage[]).indexOf(stage),
  };
}
