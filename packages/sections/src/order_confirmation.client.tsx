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
// Client half of `order_confirmation` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./order_confirmation.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useId, useState } from "react";
import { formatPoints, referralShareUrl, resolveI18n, resolveReferral } from "@scheniders/shared";
import type { I18nString, LocaleCode, StoreConfigV2 } from "@scheniders/shared";
import { EyebrowChip, MaterialIcon, Section, WhatsAppButton } from "./helpers/primitives";
import { PRESSABLE } from "./helpers/utils";
import { StoreLink, useStoreBase } from "./helpers/store-context";
import { formatPrice } from "./helpers/format";
import { resolveTenantWhatsapp, whatsappDigits } from "./helpers/whatsapp";
import { firstName } from "./pdp_express/text";
import { CallCard, STRINGS as CALL_CARD_STRINGS } from "./order_confirmation_call_card.client";
import { CARD_STYLE, INK_BORDER, LABEL_CLS } from "./order_confirmation.styles";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./order_confirmation";

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
  order_id?: string;
  /** The checkout's signed proof that this browser placed the order
   *  (lib/order-upsell-proof) — what lets the page mint a referral code. */
  upsell_token?: string;
  /** Buyer's name as typed at checkout — greets them on the thank-you page.
   *  Absent from stashes written before the field existed. */
  customer_name?: string;
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
  const customerName =
    typeof o.customer_name === "string" ? o.customer_name.trim() : "";
  return {
    number: typeof o.number === "string" ? o.number : "",
    ...(customerName ? { customer_name: customerName } : {}),
    ...(typeof o.order_id === "string" ? { order_id: o.order_id } : {}),
    ...(typeof o.upsell_token === "string" ? { upsell_token: o.upsell_token } : {}),
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

/* ─── Helpers ───────────────────────────────────────────────────────── */

/**
 * The thank-you heading: the named variant when the buyer's name is known
 * AND the merchant's copy actually carries the `{name}` token (a template
 * without it would silently drop the personalisation, so it is treated as
 * "use the generic heading"). Exported for the static-markup tests — the
 * name itself only ever arrives from the client-side stash.
 */
export function resolveGreeting(
  props: Pick<Props, "heading_i18n" | "heading_named_i18n">,
  locale: LocaleCode,
  name?: string,
): string {
  return greetingFrom(props.heading_i18n, props.heading_named_i18n, locale, name);
}

/** The greeting rule with the copy passed in — shared by the default
 *  heading and the call card's, so both follow the same `{name}` rule. */
export function greetingFrom(
  generic: I18nString,
  named: I18nString,
  locale: LocaleCode,
  name?: string,
): string {
  const fallback = resolveI18n(generic, locale);
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return fallback;
  const template = resolveI18n(named, locale);
  if (!template.includes("{name}")) return fallback;
  return template.replace("{name}", trimmed);
}

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

export function OrderConfirmationRender({
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
  const stashIsThisOrder =
    stash !== null && (!runtimeOrder || stash.number === runtimeOrder);
  const recap =
    props.show_order_recap && stashIsThisOrder && stash.items.length > 0
      ? stash
      : null;
  // Same ownership rule for the greeting: never address the buyer by a
  // name stashed for a different order.
  const heading = resolveGreeting(
    props,
    locale,
    stashIsThisOrder ? stash.customer_name : undefined,
  );
  // The call card greets by FIRST name ("تم يا علي"), from the same stash
  // under the same ownership rule as the default heading.
  const callCardName =
    stashIsThisOrder && stash.customer_name ? firstName(stash.customer_name) : undefined;
  // P4's structured contact, read the way the PDP reads it; the call card
  // takes its number and its "who contacts you" line from it.
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;

  const phone = resolveTenantWhatsapp(ctx.tenant);
  const t = (s: I18nString) => resolveI18n(s, locale);
  const eta = props.eta_i18n ? t(props.eta_i18n) : "";
  const trackHref = orderNumber
    ? `/track?order=${encodeURIComponent(orderNumber)}`
    : "/track";

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        {props.show_call_card === true ? (
          <CallCard
            heading={greetingFrom(
              props.call_card_heading_i18n ?? CALL_CARD_STRINGS.heading,
              props.call_card_heading_named_i18n ?? CALL_CARD_STRINGS.headingNamed,
              locale,
              callCardName,
            )}
            whatsappSentCopy={t(
              props.call_card_whatsapp_sent_i18n ?? CALL_CARD_STRINGS.whatsappSent,
            )}
            tenant={ctx.tenant}
            contact={commerce?.contact}
            now={ctx.runtime.now}
            orderId={stashIsThisOrder ? stash.order_id : undefined}
            proof={stashIsThisOrder ? stash.upsell_token : undefined}
            orderNumber={orderNumber}
            locale={locale}
            copyLabel={t(props.copy_label_i18n)}
            copiedLabel={t(props.copied_label_i18n)}
          >
            {orderNumber && (
              <OrderNumber
                value={orderNumber}
                label={t(props.order_label_i18n)}
                copyLabel={t(props.copy_label_i18n)}
                copiedLabel={t(props.copied_label_i18n)}
              />
            )}
          </CallCard>
        ) : (
          <div className="p-bk-lg text-center sm:p-bk-xl" style={CARD_STYLE}>
            <EyebrowChip glyph="sparkle" data-i18n-field="eyebrow_i18n">
              {t(props.eyebrow_i18n)}
            </EyebrowChip>
            <h1
              data-i18n-field="heading_i18n"
              className="mt-bk-sm font-display text-bk-h1 font-black text-balance"
              style={{ fontFamily: "var(--bk-font-display, inherit)" }}
            >
              {heading}
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
        )}

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

        {stashIsThisOrder && stash?.order_id && stash.upsell_token && (
          <ReferralShare
            tenant={ctx.tenant as ReferralTenant}
            orderId={stash.order_id}
            proof={stash.upsell_token}
            locale={locale}
            props={props}
          />
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

/* ── Referral share ───────────────────────────────────────────────── */

interface ReferralTenant {
  id: string;
  business_name?: string | null;
  store_config_v2?: {
    commerce?: {
      referral?: Parameters<typeof resolveReferral>[0];
      loyalty?: Parameters<typeof resolveReferral>[1];
    };
  } | null;
}

/**
 * "You have a code to share." Mints the buyer's code with the same signed
 * proof the post-purchase offer uses (minted by the checkout in the response
 * that created the order, held only in this browser's stash), so a code —
 * which is worth points — only ever goes to someone who just ordered.
 * Renders nothing until the program is on and the code is in hand.
 */
function ReferralShare({
  tenant,
  orderId,
  proof,
  locale,
  props,
}: {
  tenant: ReferralTenant;
  orderId: string;
  proof: string;
  locale: LocaleCode;
  props: Props;
}) {
  const base = useStoreBase();
  const program = resolveReferral(tenant.store_config_v2?.commerce?.referral, tenant.store_config_v2?.commerce?.loyalty);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!program.enabled) return;
    let active = true;
    fetch("/api/referral/code", {
      method: "POST",
      headers: { "content-type": "application/json", "x-upsell-proof": proof },
      body: JSON.stringify({ order_id: orderId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { code?: string } | null) => {
        if (active && typeof d?.code === "string") setCode(d.code);
      })
      .catch(() => {
        /* no code — the block simply does not render */
      });
    return () => {
      active = false;
    };
  }, [program.enabled, orderId, proof]);
  if (!program.enabled || !code) return null;

  const t = (s: I18nString | undefined) => resolveI18n(s, locale);
  const discount = `${program.friendDiscountPct}%`;
  const points = formatPoints(program.referrerPoints, locale);
  const link = referralShareUrl(window.location.origin, base, code);
  const fill = (s: string) =>
    s
      .replaceAll("{discount}", discount)
      .replaceAll("{points}", points)
      .replaceAll("{code}", code)
      .replaceAll("{link}", link)
      .replaceAll("{store}", tenant.business_name ?? "");
  // Referrer points only exist with loyalty on; without it, say only what is true.
  const filledBody = fill(t(props.referral_body_i18n));
  const body =
    program.referrerPoints > 0
      ? filledBody
      : filledBody.replace(/[،,]?\s*(وانت|and you)[^.]*\.?/u, "");
  const shareHref = `https://wa.me/?text=${encodeURIComponent(fill(t(props.referral_share_message_i18n)))}`;

  return (
    <section
      data-testid="referral-share"
      aria-labelledby="referral-share-heading"
      className="mt-bk-md p-bk-md"
      style={CARD_STYLE}
    >
      <p id="referral-share-heading" className={LABEL_CLS} data-i18n-field="referral_heading_i18n">
        {t(props.referral_heading_i18n)}
      </p>
      <p className="mt-1 font-body text-sm text-bk-ink-soft" data-i18n-field="referral_body_i18n">
        {body}
      </p>
      <div className="mt-bk-sm flex flex-wrap items-center gap-bk-xs">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard
              ?.writeText(link)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
          className="inline-flex min-h-11 items-center gap-2 px-4 font-display text-lg font-black tracking-[0.2em] tabular-nums"
          style={{
            border: INK_BORDER,
            borderRadius: "var(--bk-radius-input, 0.75rem)",
            backgroundColor: "var(--bk-surface, #ffffff)",
          }}
          aria-live="polite"
          aria-label={copied ? `${code} — ${locale === "en" ? "copied" : locale === "ku" ? "کۆپی کرا" : "انحفظ"}` : code}
        >
          <MaterialIcon name={copied ? "check" : "content_copy"} className="text-xl" />
          <span dir="ltr">{code}</span>
        </button>
        <WhatsAppButton href={shareHref} tone="solid" size="md" data-i18n-field="referral_share_label_i18n">
          {t(props.referral_share_label_i18n)}
        </WhatsAppButton>
      </div>
    </section>
  );
}
