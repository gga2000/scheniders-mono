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

"use client";

import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import type { I18nString, LocaleCode } from "@scheniders/shared";
import {
  EyebrowChip,
  MaterialIcon,
  PRESSABLE,
  Section,
  WhatsAppButton,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { formatPrice } from "./helpers/format";
import { resolveTenantWhatsapp, whatsappDigits } from "./helpers/whatsapp";
import { i18nStringOptional, i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

/* ─── Session stash (written by checkout_form / pdp_direct_order) ───── */

const STASH_KEY = "schn:last-order";
/** Only a fresh stash counts — a stale one belongs to a previous order. */
const STASH_TTL_MS = 60 * 60 * 1000;

interface StashedItem {
  name: string;
  variant: string | null;
  qty: number;
  price: number;
}

interface StashedOrder {
  number: string;
  items: StashedItem[];
  total: number;
  ts: number;
}

function isStashedItem(v: unknown): v is StashedItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.qty === "number" &&
    typeof o.price === "number"
  );
}

/** Parse the stash defensively: it is browser-held JSON, so a malformed or
 *  stale value simply yields "no stash" rather than a broken thank-you page. */
function parseStash(raw: string | null, now: number): StashedOrder | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON — treat as absent (documented degradation, see above).
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.ts !== "number" || now - o.ts > STASH_TTL_MS) return null;
  const items = Array.isArray(o.items) ? o.items.filter(isStashedItem) : [];
  return {
    number: typeof o.number === "string" ? o.number : "",
    items: items.map((i) => ({
      name: i.name,
      variant: typeof i.variant === "string" ? i.variant : null,
      qty: i.qty,
      price: i.price,
    })),
    total: typeof o.total === "number" ? o.total : 0,
    ts: o.ts,
  };
}

function readStash(): StashedOrder | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStash(window.sessionStorage.getItem(STASH_KEY), Date.now());
  } catch {
    // sessionStorage can throw (privacy mode / blocked storage) — no stash.
    return null;
  }
}

/* ─── Props ─────────────────────────────────────────────────────────── */

const stepSchema = z.object({
  title_i18n: i18nStringSchema,
  body_i18n: i18nStringOptional,
});

const schema = z.object({
  eyebrow_i18n: i18nStringSchema,
  heading_i18n: i18nStringSchema,
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

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { ar: "تم استلام طلبك", en: "Order received" },
  heading_i18n: { ar: "شكراً لك على طلبك", en: "Thank you for your order" },
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

/* ─── Styles ────────────────────────────────────────────────────────── */

const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";

const CARD_STYLE = {
  backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
  borderRadius: "var(--bk-radius-card, 1rem)",
  color: "var(--bk-ink, #1a1a1a)",
} as const;

const LABEL_CLS =
  "font-label font-bold text-[11px] bk-caps tracking-[0.2em] text-bk-ink-soft";

/* ─── Helpers ───────────────────────────────────────────────────────── */

function buildWhatsappHref(
  phone: string,
  template: string,
  orderNumber: string,
): string {
  const message = orderNumber
    ? template.replace("{order}", orderNumber)
    : template.replace(/\s*\{order\}/g, "");
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(message)}`;
}

/* ─── Sub-blocks ────────────────────────────────────────────────────── */

function OrderNumber({
  value,
  label,
  copyLabel,
  copiedLabel,
}: {
  value: string;
  label: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(
      () => setCopied(true),
      // Clipboard permission denied: the number is `select-all` text, so
      // the shopper can still long-press to copy — nothing to surface.
      () => setCopied(false),
    );
  };

  return (
    <div className="mt-bk-md flex flex-col items-center gap-bk-2xs">
      <span className={LABEL_CLS}>{label}</span>
      <div className="flex items-center gap-bk-xs">
        <code
          className="select-all px-3 py-1.5 font-display text-bk-h3 font-black tabular-nums"
          style={{
            backgroundColor: "var(--bk-surface, #ffffff)",
            border: INK_BORDER,
            borderRadius: "var(--bk-radius-input, 0.75rem)",
            fontFamily: "var(--bk-font-display, inherit)",
          }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className={`inline-flex min-h-11 items-center gap-1 px-3 font-label text-sm font-bold ${PRESSABLE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus`}
          style={{
            border: INK_BORDER,
            borderRadius: "var(--bk-radius-pill, 9999px)",
            backgroundColor: "var(--bk-surface, #ffffff)",
            color: "var(--bk-ink, #1a1a1a)",
          }}
        >
          <MaterialIcon
            name={copied ? "check" : "content_copy"}
            className="text-base"
          />
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}

function Recap({
  order,
  locale,
  heading,
  totalLabel,
}: {
  order: StashedOrder;
  locale: LocaleCode;
  heading: string;
  totalLabel: string;
}) {
  return (
    <div className="mt-bk-md p-bk-md" style={CARD_STYLE}>
      <h2 className="font-display text-bk-h3 font-black">{heading}</h2>
      <ul className="mt-bk-xs space-y-bk-2xs">
        {order.items.map((it, i) => (
          <li
            key={`${i}-${it.name}`}
            className="flex items-start justify-between gap-bk-sm text-sm"
          >
            <span className="min-w-0 font-body">
              <span className="font-bold">{it.name}</span>
              {it.variant ? (
                <span className="text-bk-ink-soft"> · {it.variant}</span>
              ) : null}
              <span className="text-bk-ink-soft tabular-nums"> × {it.qty}</span>
            </span>
            <span className="whitespace-nowrap font-display font-black tabular-nums">
              {formatPrice(it.price * it.qty, locale)}
            </span>
          </li>
        ))}
      </ul>
      <div
        className="mt-bk-sm flex items-center justify-between pt-bk-sm"
        style={{
          borderTop: "2px dashed var(--bk-ink-faint, rgb(26 26 26 / 0.2))",
        }}
      >
        <span className="font-display font-black bk-caps">{totalLabel}</span>
        <span
          className="font-display text-bk-h3 font-black tabular-nums"
          style={{ color: "var(--bk-primary, #ff5a8a)" }}
        >
          {formatPrice(order.total, locale)}
        </span>
      </div>
    </div>
  );
}

/* ─── Render ────────────────────────────────────────────────────────── */

function OrderConfirmationRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const stepsId = useId();
  const [stash, setStash] = useState<StashedOrder | null>(null);
  useEffect(() => {
    setStash(readStash());
  }, []);

  const runtimeOrder = ctx.runtime.order_number?.trim() ?? "";
  const orderNumber = runtimeOrder || stash?.number || "";
  // The recap must belong to THIS order: a stash from an earlier order in
  // the same session must not render under a different order number.
  const recap =
    props.show_order_recap &&
    stash &&
    stash.items.length > 0 &&
    (!runtimeOrder || stash.number === runtimeOrder)
      ? stash
      : null;

  const phone = resolveTenantWhatsapp(ctx.tenant);
  const t = (s: I18nString) => resolveI18n(s, locale);
  const eta = props.eta_i18n ? t(props.eta_i18n) : "";
  const trackHref = orderNumber
    ? `/track?order=${encodeURIComponent(orderNumber)}`
    : "/track";

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        <div className="p-bk-lg text-center sm:p-bk-xl" style={CARD_STYLE}>
          <EyebrowChip glyph="sparkle" data-i18n-field="eyebrow_i18n">
            {t(props.eyebrow_i18n)}
          </EyebrowChip>
          <h1
            data-i18n-field="heading_i18n"
            className="mt-bk-sm font-display text-bk-h1 font-black text-balance"
            style={{ fontFamily: "var(--bk-font-display, inherit)" }}
          >
            {t(props.heading_i18n)}
          </h1>
          <p
            data-i18n-field="call_promise_i18n"
            className="mx-auto mt-bk-xs max-w-prose font-body text-base text-pretty text-bk-ink-soft"
          >
            {t(props.call_promise_i18n)}
          </p>
          {orderNumber && (
            <OrderNumber
              value={orderNumber}
              label={t(props.order_label_i18n)}
              copyLabel={t(props.copy_label_i18n)}
              copiedLabel={t(props.copied_label_i18n)}
            />
          )}
        </div>

        {recap && (
          <Recap
            order={recap}
            locale={locale}
            heading={t(props.recap_heading_i18n)}
            totalLabel={t(props.total_label_i18n)}
          />
        )}

        <section aria-labelledby={stepsId} className="mt-bk-md">
          <h2
            id={stepsId}
            data-i18n-field="steps_heading_i18n"
            className="font-display text-bk-h3 font-black"
          >
            {t(props.steps_heading_i18n)}
          </h2>
          <ol className="mt-bk-sm space-y-bk-xs">
            {props.steps.map((step, i) => {
              const body = step.body_i18n ? t(step.body_i18n) : "";
              return (
                <li
                  key={i}
                  className="flex items-start gap-bk-sm p-bk-sm"
                  style={CARD_STYLE}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center font-display text-base font-black tabular-nums"
                    style={{
                      backgroundColor: "var(--bk-primary, #ff5a8a)",
                      color: "var(--bk-on-primary, #ffffff)",
                      borderRadius: "var(--bk-radius-pill, 9999px)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display font-bold">
                      {t(step.title_i18n)}
                    </p>
                    {body && (
                      <p className="mt-0.5 font-body text-sm text-bk-ink-soft">
                        {body}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {eta && (
          <div
            className="mt-bk-md flex items-start gap-bk-sm p-bk-md"
            style={CARD_STYLE}
          >
            <MaterialIcon name="local_shipping" className="text-2xl" />
            <div>
              <p className={LABEL_CLS}>{t(props.eta_label_i18n)}</p>
              <p
                data-i18n-field="eta_i18n"
                className="mt-0.5 font-display font-bold"
              >
                {eta}
              </p>
            </div>
          </div>
        )}

        <div className="mt-bk-lg flex flex-col gap-bk-xs">
          {phone && (
            <WhatsAppButton
              href={buildWhatsappHref(
                phone,
                t(props.whatsapp_message_i18n),
                orderNumber,
              )}
              tone="solid"
              size="lg"
              fullWidth
              data-i18n-field="whatsapp_label_i18n"
            >
              {t(props.whatsapp_label_i18n)}
            </WhatsAppButton>
          )}
          <StoreLink
            href={trackHref}
            data-i18n-field="track_label_i18n"
            className={`inline-flex min-h-12 w-full items-center justify-center gap-2 px-6 py-3 font-display text-base font-bold ${PRESSABLE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus`}
            style={{
              backgroundColor: "var(--bk-surface, #ffffff)",
              color: "var(--bk-ink, #1a1a1a)",
              border: INK_BORDER,
              borderRadius: "var(--bk-radius-pill, 9999px)",
              boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
            <MaterialIcon name="package_2" className="text-xl" />
            {t(props.track_label_i18n)}
          </StoreLink>
          <StoreLink
            href="/products"
            data-i18n-field="continue_label_i18n"
            className="inline-flex min-h-11 items-center justify-center font-label text-sm font-bold underline underline-offset-4 text-bk-ink-soft hover:text-bk-ink"
          >
            {t(props.continue_label_i18n)}
          </StoreLink>
        </div>
      </div>
    </Section>
  );
}

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
