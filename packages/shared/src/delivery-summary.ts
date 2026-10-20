// =====================================================================
// Delivery summary — what to say BEFORE the shopper picks a governorate
// =====================================================================
// `computeDeliveryFee` decides the exact fee once a governorate is known.
// Until then the storefront said "—", which is honest but coy: in Iraq the
// fee is usually flat across governorates, and a shopper who is asked to
// fill in a form before learning the delivery cost is a shopper who leaves.
//
// This answers one question for a given basket: would every governorate
// pay the same delivery fee? It does not read the config's shape to guess —
// it asks `computeDeliveryFee` itself, once per governorate, so whatever the
// summary says is exactly what the checkout will charge. That matters
// because the config's shape and its meaning differ: a governorate with no
// override and no default rate falls back to the legacy flat fee, so "every
// override says 10,000" is NOT "10,000 everywhere".
//
// Nothing here is a guess. "Varies" only appears when the engine really
// prices governorates differently; an ETA only when the merchant set one
// for every governorate.
// =====================================================================

import {
  FREE_DELIVERY_THRESHOLD_IQD,
  computeDeliveryFee,
  resolveShippingRate,
} from "./delivery";
import { IRAQ_GOVERNORATES, type GovernorateCode } from "./governorates";
import type { GovernorateShippingConfig } from "./types/store-config-v2";

export interface Range {
  min: number;
  max: number;
}

export interface DeliverySummary {
  /** flat: one fee everywhere · varies: differs by governorate · legacy: no
   *  shipping config, so the platform's flat fallback applies everywhere. */
  kind: "flat" | "varies" | "legacy";
  /** The fee THIS basket would pay, across all governorates. */
  fee: Range;
  /** Free-delivery threshold (IQD) when every governorate's rate agrees on
   *  one; else null. */
  free_threshold_iqd: number | null;
  /** Hours, when every governorate's rate declares an ETA; else null. */
  eta_hours: Range | null;
}

/** The rate the engine applies to a governorate, legacy fallback included. */
function effectiveRate(
  shipping: GovernorateShippingConfig | null | undefined,
  code: GovernorateCode,
): { free_threshold_iqd: number | null; eta_hours: number | null } {
  const rate = resolveShippingRate(shipping, code);
  if (!rate) {
    return { free_threshold_iqd: FREE_DELIVERY_THRESHOLD_IQD, eta_hours: null };
  }
  const threshold = rate.free_threshold_iqd;
  const eta = rate.eta_hours;
  return {
    free_threshold_iqd: typeof threshold === "number" && threshold > 0 ? threshold : null,
    eta_hours: typeof eta === "number" && eta > 0 ? eta : null,
  };
}

export function summarizeDelivery(
  shipping: GovernorateShippingConfig | null | undefined,
  basket: { subtotalIqd: number; itemCount: number },
): DeliverySummary {
  const codes = IRAQ_GOVERNORATES.map((g) => g.code);
  const fees = codes.map((governorate) =>
    computeDeliveryFee(basket.subtotalIqd, basket.itemCount, { shipping, governorate }),
  );
  const min = Math.min(...fees);
  const max = Math.max(...fees);

  const rates = codes.map((code) => effectiveRate(shipping, code));
  const thresholds = new Set(rates.map((r) => r.free_threshold_iqd));
  const onlyThreshold = thresholds.size === 1 ? [...thresholds][0] : null;

  const etas = rates.map((r) => r.eta_hours);
  const eta_hours = etas.every((h): h is number => h !== null)
    ? { min: Math.min(...etas), max: Math.max(...etas) }
    : null;

  const configured = codes.some((code) => resolveShippingRate(shipping, code) !== null);
  return {
    kind: !configured ? "legacy" : min === max ? "flat" : "varies",
    fee: { min, max },
    free_threshold_iqd: onlyThreshold ?? null,
    eta_hours,
  };
}

/** ETA for ONE governorate, when its rate declares one. */
export function etaForGovernorate(
  shipping: GovernorateShippingConfig | null | undefined,
  governorate: GovernorateCode | null | undefined,
): number | null {
  if (!governorate) return null;
  return effectiveRate(shipping, governorate).eta_hours;
}
