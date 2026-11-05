import type { Order } from "@/types/order";
import { normalizeShieldPhone } from "./lookup";
import { trustBand, type ShieldBand } from "./trust";

/**
 * The orders page's danger level (Ali, 2026-11-05): every order falls in one
 * of three bands by its customer's Shield Trust score. High (red) is under 50,
 * medium (yellow) 50-79, low (green) 80 or more or a new customer.
 * `trustByPhone` holds only the customers under 80 (shield_customer_trust), so
 * a phone missing from it is low.
 */
export type DangerBand = ShieldBand;

export const DANGER_BANDS: readonly DangerBand[] = ["red", "yellow", "green"];

/** The customer's Trust score, or null when it is 80+ or a new customer. */
export function orderTrust(order: Pick<Order, "phone">, trustByPhone: ReadonlyMap<string, number>): number | null {
    const norm = normalizeShieldPhone(order.phone);
    return norm ? (trustByPhone.get(norm) ?? null) : null;
}

export function dangerBandOf(order: Pick<Order, "phone">, trustByPhone: ReadonlyMap<string, number>): DangerBand {
    const trust = orderTrust(order, trustByPhone);
    return trust === null ? "green" : trustBand(trust);
}

export function dangerCounts(
    orders: readonly Pick<Order, "phone">[],
    trustByPhone: ReadonlyMap<string, number>,
): Record<DangerBand, number> {
    const counts: Record<DangerBand, number> = { red: 0, yellow: 0, green: 0 };
    for (const o of orders) counts[dangerBandOf(o, trustByPhone)] += 1;
    return counts;
}

/** Order id → Trust score for the orders under 80, for the riskiest-first sort. */
export function trustByOrderId(
    orders: readonly Pick<Order, "id" | "phone">[],
    trustByPhone: ReadonlyMap<string, number>,
): Map<string, number> {
    const out = new Map<string, number>();
    for (const o of orders) {
        const trust = orderTrust(o, trustByPhone);
        if (trust !== null) out.set(o.id, trust);
    }
    return out;
}
