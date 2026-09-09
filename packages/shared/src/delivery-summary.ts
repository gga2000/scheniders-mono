// =====================================================================
// Delivery summary — what to say BEFORE the shopper picks a governorate
// =====================================================================
// `computeDeliveryFee` decides the exact fee once a governorate is known.
// Until then the storefront said "—", which is honest but coy: in Iraq the
// fee is usually flat across governorates, and a shopper who is asked to
// fill in a form before learning the delivery cost is a shopper who leaves.
//
// This looks at the WHOLE shipping config and answers: is the fee the same
// everywhere (state it), does it vary (state the range), or is there no
// config (the legacy flat fee). ETA is read from the same rates — the first
// consumer `eta_hours` has ever had.
//
// Nothing here is a guess. "Varies" is only ever reported when the config
// actually contains different numbers; ETA is null unless the merchant set
// one.
// =====================================================================

import {
  FLAT_DELIVERY_FEE_IQD,
  FREE_DELIVERY_THRESHOLD_IQD,
  resolveShippingRate,
} from "./delivery";
import type { GovernorateCode } from "./governorates";
import type {
  GovernorateShippingConfig,
  GovernorateShippingRate,
} from "./types/store-config-v2";

export interface Range {
  min: number;
  max: number;
}

export interface DeliverySummary {
  /** flat: one fee everywhere · varies: differs by governorate · legacy: no config. */
  kind: "flat" | "varies" | "legacy";
  fee: Range;
  /** Free-delivery threshold (IQD) when EVERY rate agrees on one; else null. */
  free_threshold_iqd: number | null;
  /** Hours, when at least one rate declares an ETA; else null. */
  eta_hours: Range | null;
}

function clean(rate: GovernorateShippingRate): GovernorateShippingRate | null {
  const fee = Math.round(rate.fee_iqd);
  if (!Number.isFinite(fee) || fee < 0) return null;
  return {
    fee_iqd: fee,
    free_threshold_iqd:
      typeof rate.free_threshold_iqd === "number" && rate.free_threshold_iqd > 0
        ? rate.free_threshold_iqd
        : undefined,
    eta_hours:
      typeof rate.eta_hours === "number" && rate.eta_hours > 0 ? rate.eta_hours : undefined,
  };
}

/** Every rate the config can resolve to: the default plus each override. */
export function allShippingRates(
  shipping: GovernorateShippingConfig | null | undefined,
): GovernorateShippingRate[] {
  if (!shipping) return [];
  const out: GovernorateShippingRate[] = [];
  const d = shipping.default_rate ? clean(shipping.default_rate) : null;
  if (d) out.push(d);
  for (const r of Object.values(shipping.rates ?? {})) {
    const c = r ? clean(r) : null;
    if (c) out.push(c);
  }
  return out;
}

export function summarizeDelivery(
  shipping: GovernorateShippingConfig | null | undefined,
): DeliverySummary {
  const rates = allShippingRates(shipping);
  if (rates.length === 0) {
    return {
      kind: "legacy",
      fee: { min: FLAT_DELIVERY_FEE_IQD, max: FLAT_DELIVERY_FEE_IQD },
      free_threshold_iqd: FREE_DELIVERY_THRESHOLD_IQD,
      eta_hours: null,
    };
  }

  const fees = rates.map((r) => r.fee_iqd);
  const min = Math.min(...fees);
  const max = Math.max(...fees);

  const thresholds = new Set(rates.map((r) => r.free_threshold_iqd ?? 0));
  const free_threshold_iqd =
    thresholds.size === 1 && !thresholds.has(0) ? [...thresholds][0] : null;

  const etas = rates.map((r) => r.eta_hours).filter((h): h is number => typeof h === "number");
  const eta_hours = etas.length ? { min: Math.min(...etas), max: Math.max(...etas) } : null;

  return { kind: min === max ? "flat" : "varies", fee: { min, max }, free_threshold_iqd, eta_hours };
}

/** ETA for ONE governorate, when its rate declares one. */
export function etaForGovernorate(
  shipping: GovernorateShippingConfig | null | undefined,
  governorate: GovernorateCode | null | undefined,
): number | null {
  const rate = resolveShippingRate(shipping, governorate);
  const h = rate?.eta_hours;
  return typeof h === "number" && h > 0 ? h : null;
}
