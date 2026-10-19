// Express checkout: the total ledger and the CTA row — a compact WhatsApp
// tile on the left of the big submit. The "you pay on delivery" wording
// and the price subline only render when the delivery fee is actually
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
  value,
  strong,
}: {
  rtl: boolean;
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        rtl && "flex-row-reverse",
        strong ? "text-bk-ink" : "text-bk-ink-soft",
      )}
    >
      <span className={cn("font-bk-body", strong ? "text-[15px] font-black" : "text-[13px]")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "font-bk-display text-[28px] font-black leading-none" : "font-bk-body text-[13px] font-bold",
        )}
      >
        {value}
      </span>
    </div>
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
      <div className="space-y-1.5 rounded-bk-card bg-bk-surface-alt px-4 py-3">
        <Row
          rtl={rtl}
          label={xs("itemsLine", locale, { name: displayNameOf(m.product), count: m.qty })}
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
                xs("deliveryPending", locale)
              ) : m.delivery === 0 ? (
                xs("deliveryFree", locale)
              ) : (
                <bdi>{formatPrice(m.delivery, locale)}</bdi>
              )}
            </span>
          }
        />
        <div className="border-t border-dashed border-bk-divider pt-2">
          <Row
            rtl={rtl}
            strong
            label={xs(deliveryKnown ? "total" : "totalPlain", locale)}
            value={<bdi>{formatPrice(m.total, locale)}</bdi>}
          />
        </div>
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
              {xs("submitSubline", locale, { total: formatPrice(m.total, locale) })}
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
