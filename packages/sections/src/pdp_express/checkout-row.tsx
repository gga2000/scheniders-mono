// Express checkout: a quiet receipt (item, delivery, total) and the CTA
// row — a soft WhatsApp tile on the left of the big submit. The receipt
// above carries the money; the submit carries only the action (bold label,
// an arrow that nudges and a light sweep every few seconds, a spinner while
// placing), so the one price on the button can never disagree with the
// receipt or leave delivery out.

import {
  cn,
  IRAQ_GOVERNORATES,
  computeDeliveryFee,
  resolveI18n,
} from "@scheniders/shared";
import type { GovernorateShippingConfig, LocaleCode } from "@scheniders/shared";
import { ContactLine } from "../helpers/contact-line";
import { formatPrice } from "../helpers/format";
import { MaterialIcon, WhatsAppIcon } from "../helpers/primitives";
import { displayNameOf } from "./identity-label";
import type { ExpressModel } from "./model";
import { PromiseBand } from "./promise-band";
import { readsRtl, xs } from "./text";
import { ExpressTrustStrip } from "./trust-strip";

/** True when every governorate's computed fee is 0 for this basket. */
export function isDeliveryFreeEverywhere(
  subtotal: number,
  qty: number,
  shipping: GovernorateShippingConfig | null | undefined,
): boolean {
  return IRAQ_GOVERNORATES.every(
    (g) => computeDeliveryFee(subtotal, qty, { shipping, governorate: g.code }) === 0,
  );
}

function Row({
  rtl,
  label,
  note,
  value,
  strong,
}: {
  rtl: boolean;
  label: string;
  note?: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        strong ? "py-3" : "py-2",
        rtl && "flex-row-reverse",
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-baseline gap-1.5 font-bk-body",
          rtl && "flex-row-reverse",
          strong ? "text-[15px] font-black text-bk-ink" : "text-[13px] text-bk-ink-soft",
        )}
      >
        <span className="truncate">{label}</span>
        {note && <bdi className="shrink-0 text-xs text-bk-ink-faint tabular-nums">{note}</bdi>}
      </span>
      <span
        className={cn(
          "shrink-0 whitespace-nowrap tabular-nums",
          strong
            ? "font-bk-display text-[22px] font-black leading-none text-bk-ink"
            : "font-bk-body text-[13px] font-bold text-bk-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function CheckoutRow({
  m,
  locale,
  waHref,
  waFallbackHref,
}: {
  m: ExpressModel;
  locale: LocaleCode;
  /** The WhatsApp order link — built by the express view, which owns the
   *  landmark the message must carry. Null = no WhatsApp tile. */
  waHref: string | null;
  /** The same order on WhatsApp, offered when a submit ends `unconfirmed`
   *  (landmark included). Null = the store has no WhatsApp number. */
  waFallbackHref: string | null;
}) {
  const rtl = readsRtl(locale);
  const freeEverywhere = isDeliveryFreeEverywhere(m.subtotal, m.qty, m.shipping);
  // color_lock (D4): green is for WhatsApp and success states only.
  const freeInk = m.props.color_lock === true ? "text-bk-ink" : "text-bk-success";
  // promise_layout "band": the band replaces the reassurance line, the
  // contact line and the under-CTA chips, and renders after the status
  // messages so they stay directly under the submit.
  const band = m.props.promise_layout === "band";
  const idle = !m.oos && !m.submitting;
  const saving =
    m.props.show_savings && m.compareAt !== null && m.compareAt > m.price
      ? (m.compareAt - m.price) * m.qty
      : 0;
  const submitLabel = m.oos
    ? m.s("outOfStock")
    : m.status === "checking"
      ? m.s("checkingOrder")
      : m.submitting
        ? m.s("placingOrder")
        : resolveI18n(m.props.submit_label_i18n, locale);

  return (
    <div className="space-y-bk-sm">
      <div className="divide-y divide-dashed divide-bk-divider rounded-bk-card border-bk border-bk-divider px-4">
        <div>
          <Row
            rtl={rtl}
            label={displayNameOf(m.product)}
            note={`× ${m.qty}`}
            value={<bdi>{formatPrice(m.subtotal, locale)}</bdi>}
          />
          {m.referralAmount > 0 && (
            <Row
              rtl={rtl}
              label={xs("referralRow", locale)}
              value={<bdi>−{formatPrice(m.referralAmount, locale)}</bdi>}
            />
          )}
          {m.pointsDiscount > 0 && (
            <Row
              rtl={rtl}
              label={xs("pointsRow", locale)}
              value={<bdi>−{formatPrice(m.pointsDiscount, locale)}</bdi>}
            />
          )}
          {saving > 0 && (
            <Row
              rtl={rtl}
              label={xs("savingsRow", locale)}
              value={<bdi>−{formatPrice(saving, locale)}</bdi>}
            />
          )}
          <Row
            rtl={rtl}
            label={xs("delivery", locale)}
            value={
              <span data-delivery-fee>
                {freeEverywhere ? (
                  <span className={freeInk}>{xs("deliveryFreeEverywhere", locale)}</span>
                ) : m.delivery === null ? (
                  <span className="font-normal text-bk-ink-faint">{xs("deliveryPending", locale)}</span>
                ) : m.delivery === 0 ? (
                  <span className={freeInk}>{xs("deliveryFree", locale)}</span>
                ) : (
                  <bdi>{formatPrice(m.delivery, locale)}</bdi>
                )}
              </span>
            }
          />
        </div>
        <Row
          rtl={rtl}
          strong
          label={xs("totalPlain", locale)}
          value={<bdi>{formatPrice(m.total, locale)}</bdi>}
        />
      </div>

      <div className="flex items-stretch gap-2" data-layer="submit" data-layer-label="Order buttons">
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={xs("whatsapp", locale)}
            className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-bk-input border-bk border-bk-success/25 bg-bk-success/10 text-bk-success transition-[transform,background-color] duration-bk-fast hover:bg-bk-success/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus active:scale-95 active:bg-bk-success/25 motion-reduce:transition-none"
          >
            <WhatsAppIcon shadow={false} className="h-7 w-7" />
            <span className="font-bk-body text-[11px] font-bold leading-none text-bk-ink-soft">
              {xs("whatsappShort", locale)}
            </span>
          </a>
        )}
        <button
          type="submit"
          disabled={m.oos || m.submitting}
          aria-busy={m.submitting || undefined}
          aria-describedby={
            m.status === "error" || m.status === "unconfirmed" ? m.submitErrorId : undefined
          }
          className={cn(
            "relative isolate flex min-h-[60px] flex-1 items-center justify-center gap-3 overflow-hidden rounded-bk-input bg-bk-primary px-5 text-bk-on-primary shadow-bk-button",
            "transition-[transform,background-color,box-shadow] duration-bk-fast motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bk-surface",
            "disabled:cursor-not-allowed disabled:bg-bk-primary-disabled disabled:shadow-none",
            idle && "hover:bg-bk-primary-hover active:scale-[0.97] active:bg-bk-primary-active active:shadow-none",
            m.submitting && "cursor-progress",
            rtl && "flex-row-reverse",
          )}
        >
          {idle && (
            <span
              aria-hidden="true"
              className={cn(
                "bk-xp-sheen pointer-events-none absolute inset-y-0 left-0 -z-10 w-2/5",
                rtl && "bk-xp-sheen-rtl",
              )}
            />
          )}
          <span className="font-bk-display text-[19px] font-black leading-tight">{submitLabel}</span>
          {!m.oos && (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-bk-pill bg-bk-on-primary/15"
            >
              {m.submitting ? (
                <MaterialIcon
                  name="progress_activity"
                  className="animate-spin text-xl motion-reduce:animate-none"
                />
              ) : (
                <MaterialIcon
                  name={rtl ? "arrow_back" : "arrow_forward"}
                  className={cn("text-xl", rtl ? "bk-xp-nudge-rtl" : "bk-xp-nudge")}
                />
              )}
            </span>
          )}
        </button>
      </div>

      {!band && m.reassurance && (
        <p
          className={cn(
            "flex items-center justify-center gap-1.5 text-center font-bk-body text-[13px] text-bk-ink-soft",
            rtl && "flex-row-reverse",
          )}
          data-i18n-field="reassurance_i18n"
        >
          <MaterialIcon
            name="verified_user"
            className={m.props.color_lock === true ? "text-base text-bk-ink" : "text-base text-bk-success"}
          />
          {m.reassurance}
        </p>
      )}

      {!band && m.contactConfig && (
        <ContactLine
          contact={m.contactConfig}
          locale={locale}
          initialNow={m.ctx.runtime.now}
          className={cn(
            "flex items-center justify-center gap-1.5 text-center font-bk-body text-[13px] text-bk-ink-soft",
            rtl && "flex-row-reverse",
          )}
          iconClassName="text-base text-bk-primary"
        />
      )}

      {m.status === "error" && (
        <p
          id={m.submitErrorId}
          role="alert"
          className="text-center font-bk-body text-sm font-bold text-bk-danger"
        >
          {m.errorMsg ?? m.s("errGeneric")}
        </p>
      )}
      {m.status === "ok" && (
        <p role="status" className="text-center font-bk-body text-sm font-bold text-bk-success">
          {m.s("orderReceived")}
        </p>
      )}
      {m.status === "unconfirmed" && (
        <div id={m.submitErrorId} role="alert" className="space-y-bk-xs">
          <p className="text-center font-bk-body text-sm font-bold text-bk-danger">
            {m.errorMsg ?? m.s("orderUnconfirmed")}
          </p>
          {waFallbackHref && (
            <a
              href={waFallbackHref}
              target="_blank"
              rel="noopener noreferrer"
              data-wa-fallback="true"
              className={cn(
                "flex min-h-[52px] items-center justify-center gap-2 rounded-bk-input border-bk border-bk-success/25 bg-bk-success/10 px-4 font-bk-body text-[15px] font-bold text-bk-success transition-colors duration-bk-fast hover:bg-bk-success/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus motion-reduce:transition-none",
                rtl && "flex-row-reverse",
              )}
            >
              <WhatsAppIcon shadow={false} className="h-6 w-6" />
              {m.s("sendOnWhatsapp")}
            </a>
          )}
        </div>
      )}
      {m.status === "duplicate" && (
        <p role="status" className="text-center font-bk-body text-sm font-bold text-bk-success">
          {m.s("alreadyOrdered")}
        </p>
      )}

      {!band && m.props.trust_chips_placement === "under_cta" && m.trustChips.length > 0 && (
        <ExpressTrustStrip chips={m.trustChips} locale={locale} />
      )}

      {band && <PromiseBand m={m} locale={locale} freeEverywhere={freeEverywhere} />}
    </div>
  );
}
