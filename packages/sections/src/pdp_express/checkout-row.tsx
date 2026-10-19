// Express checkout: a quiet receipt (item, delivery, total) and the CTA
// row — a compact WhatsApp tile on the left of the big submit. The price
// subline under the submit only renders when the delivery fee is actually
// known (chosen governorate, or free everywhere), so a fee-charging store
// is never told a total that leaves delivery out.

import {
  cn,
  IRAQ_GOVERNORATES,
  computeDeliveryFee,
  resolveI18n,
} from "@scheniders/shared";
import type { GovernorateShippingConfig, LocaleCode } from "@scheniders/shared";
import { formatPrice } from "../helpers/format";
import { MaterialIcon, WhatsAppIcon } from "../helpers/primitives";
import { displayNameOf } from "./identity-label";
import type { ExpressModel } from "./model";
import { readsRtl, xs } from "./text";

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

/** A chrome template with an amount in it, the amount isolated in <bdi>
 *  so the bidi algorithm cannot move it across the Arabic words. */
function WithAmount({ template, amount }: { template: string; amount: string }) {
  const [before, after] = template.split("{total}");
  return (
    <>
      {before}
      <bdi>{amount}</bdi>
      {after}
    </>
  );
}

export function CheckoutRow({ m, locale }: { m: ExpressModel; locale: LocaleCode }) {
  const rtl = readsRtl(locale);
  const freeEverywhere = isDeliveryFreeEverywhere(m.subtotal, m.qty, m.shipping);
  const deliveryKnown = freeEverywhere || m.delivery !== null;
  const saving =
    m.props.show_savings && m.compareAt !== null && m.compareAt > m.price
      ? (m.compareAt - m.price) * m.qty
      : 0;
  const submitLabel = m.oos
    ? m.s("outOfStock")
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
                  <span className="text-bk-success">{xs("deliveryFreeEverywhere", locale)}</span>
                ) : m.delivery === null ? (
                  <span className="font-normal text-bk-ink-faint">{xs("deliveryPending", locale)}</span>
                ) : m.delivery === 0 ? (
                  <span className="text-bk-success">{xs("deliveryFree", locale)}</span>
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
        {m.waHref && (
          <a
            href={m.waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={xs("whatsapp", locale)}
            className="flex w-14 shrink-0 items-center justify-center rounded-bk-input border-bk border-bk-divider bg-bk-surface text-bk-success shadow-bk-card transition-transform duration-bk-fast active:scale-95 motion-reduce:transition-none"
          >
            <WhatsAppIcon className="h-7 w-7" />
          </a>
        )}
        <button
          type="submit"
          disabled={m.oos}
          aria-busy={m.submitting || undefined}
          aria-disabled={m.submitting || undefined}
          aria-describedby={m.status === "error" ? m.submitErrorId : undefined}
          className="flex min-h-[60px] flex-1 flex-col items-center justify-center rounded-bk-input bg-bk-primary px-4 text-bk-on-primary shadow-bk-button transition-transform duration-bk-fast active:scale-[0.98] disabled:bg-bk-primary-disabled motion-reduce:transition-none"
        >
          <span className="flex items-center gap-2 font-bk-display text-[18px] font-black leading-tight">
            {m.submitting && (
              <MaterialIcon name="progress_activity" className="animate-spin motion-reduce:animate-none" />
            )}
            {submitLabel}
          </span>
          {!m.oos && !m.submitting && deliveryKnown && (
            <span className="font-bk-body text-xs font-bold opacity-80">
              <WithAmount
                template={xs("submitSubline", locale)}
                amount={formatPrice(m.total, locale)}
              />
            </span>
          )}
        </button>
      </div>

      {m.reassurance && (
        <p
          className={cn(
            "flex items-center justify-center gap-1.5 text-center font-bk-body text-[13px] text-bk-ink-soft",
          )}
          data-i18n-field="reassurance_i18n"
        >
          <MaterialIcon name="verified_user" className="text-base text-bk-success" />
          {m.reassurance}
        </p>
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
    </div>
  );
}
