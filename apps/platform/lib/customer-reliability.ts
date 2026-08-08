// =============================================
// CUSTOMER TWO-AXIS MODEL
// Single source of truth (TS side) for how a customer is presented across the
// customers page (grid card, list row, detail dialog) and the order-creation
// COD-risk panel.
//
// We split the old, over-flagging single "reliability" tier into TWO independent
// axes — the authoritative values are computed in Postgres by value_tier_calc /
// risk_level_calc (see migration 20260629180000) and returned by the RPCs, so the
// list, the filter chips, the KPI strip and the order warning can never disagree.
// The pure functions below MIRROR that SQL exactly: they are the documented spec
// (unit-tested) and the fallback for any client-only computation.
//
//   VALUE  (loyalty / volume) — by COMPLETED (delivered) orders.
//   RISK   (COD trust)        — recency- and pattern-weighted, NOT binary; a great
//                               repeat buyer with one stale hiccup reads "Clean".
// =============================================

import type { TrustTier } from '@/types/customer';

// ───────────────────────── VALUE axis ─────────────────────────

export type ValueTier = 'vip' | 'good' | 'newcomer';

export interface ValueMeta {
    /** Human label (fallback; i18n key `customers.value.<tier>` overrides). */
    label: string;
    pillBg: string;
    pillText: string;
    /** 4px card/row accent rail. */
    rail: string;
    dot: string;
}

export const VALUE_META: Record<ValueTier, ValueMeta> = {
    vip: { label: 'VIP', pillBg: 'bg-purple-100', pillText: 'text-purple-800', rail: 'bg-purple-500', dot: 'bg-purple-500' },
    good: { label: 'Good', pillBg: 'bg-lime-50', pillText: 'text-lime-800', rail: 'bg-lime-400', dot: 'bg-lime-500' },
    newcomer: { label: 'Newcomer', pillBg: 'bg-blue-50', pillText: 'text-blue-800', rail: 'bg-blue-400', dot: 'bg-blue-400' },
};

/** Mirror of value_tier_calc: VALUE by completed (delivered) orders. */
export function valueTier(c: { completed_count: number }): ValueTier {
    if (c.completed_count >= 3) return 'vip';
    if (c.completed_count === 2) return 'good';
    return 'newcomer';
}

// ───────────────────────── RISK axis ─────────────────────────

export type RiskLevel = 'clean' | 'caution' | 'high' | 'blocked';

export interface RiskMeta {
    label: string;
    chipBg: string;
    chipText: string;
    rail: string;
    dot: string;
}

export const RISK_META: Record<RiskLevel, RiskMeta> = {
    clean: { label: 'Clean', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', rail: 'bg-emerald-400', dot: 'bg-emerald-500' },
    caution: { label: 'Caution', chipBg: 'bg-amber-50', chipText: 'text-amber-800', rail: 'bg-amber-400', dot: 'bg-amber-500' },
    high: { label: 'High risk', chipBg: 'bg-rose-50', chipText: 'text-rose-700', rail: 'bg-rose-500', dot: 'bg-rose-600' },
    blocked: { label: 'Blocked', chipBg: 'bg-zinc-800', chipText: 'text-white', rail: 'bg-zinc-800', dot: 'bg-zinc-600' },
};

export interface RiskInput {
    severe_count: number;
    recent_severe_count: number;
    moderate_count: number;
    recent_moderate_count: number;
    is_blacklisted?: boolean;
    trust_tier?: TrustTier | string;
}

/**
 * Mirror of risk_level_calc. severe = rejected + no_response + returned(RTO);
 * moderate = cancelled + refund; recent = last 6 months.
 *   blocked                                            → blocked
 *   2+ recent severe, OR chronic (3+) severe still recurring → high
 *   1 recent severe, OR any recent moderate, OR 2+ total blemishes → caution
 *   else (spotless, or a single stale blemish)         → clean
 */
export function riskLevel(c: RiskInput): RiskLevel {
    if (c.is_blacklisted || c.trust_tier === 'blocked') return 'blocked';
    if (c.recent_severe_count >= 2 || (c.severe_count >= 3 && c.recent_severe_count >= 1)) return 'high';
    if (c.recent_severe_count === 1 || c.recent_moderate_count >= 1 || (c.severe_count + c.moderate_count) >= 2) return 'caution';
    return 'clean';
}

/** Plain-language COD verdict i18n key for the dialog / order panel. */
export function codRiskKey(risk: RiskLevel): string {
    switch (risk) {
        case 'clean': return 'customers.codRisk.clean';
        case 'caution': return 'customers.codRisk.caution';
        case 'high': return 'customers.codRisk.high';
        case 'blocked': return 'customers.codRisk.blocked';
    }
}

// ───────────────────────── shared helpers ─────────────────────────

/** Whether to show a numeric engine score — only proven (non-`new`) customers have one. */
export function hasRatedScore(tier: TrustTier | string): boolean {
    return tier !== 'new';
}

/** Clamp the raw engine score to a sane 0–100 for display. */
export function displayScore(trustScore: number): number {
    if (Number.isNaN(trustScore)) return 0;
    return Math.min(100, Math.max(0, Math.round(trustScore)));
}

/**
 * Delivery success %, reconciled: prefer the trust-engine rate when present,
 * else derive from live completed/total so customers without a trust row don't
 * show a false "0%" next to a real delivered count.
 */
export function effectiveSuccessRate(c: {
    delivery_success_rate: number;
    completed_count: number;
    total_orders: number;
}): number {
    if (c.delivery_success_rate > 0) return Math.round(c.delivery_success_rate);
    if (c.total_orders > 0) return Math.round((c.completed_count / c.total_orders) * 100);
    return 0;
}

/** Whole days since a date, or null if absent/unparseable. */
export function daysSince(date?: string | null): number | null {
    if (!date) return null;
    const t = Date.parse(date);
    if (Number.isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86_400_000);
}

export interface RecencyStatus {
    label: string;
    dot: string;
}

/** Recency line + status dot; a high-risk customer always reads red. */
export function recencyStatus(lastOrderDate: string | null | undefined, risk: RiskLevel): RecencyStatus {
    const d = daysSince(lastOrderDate);
    const ago = d === null ? '' : d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
    if (d === null) return { label: 'No orders yet', dot: 'bg-zinc-400' };
    if (risk === 'high' || risk === 'blocked') return { label: `Last order ${ago}`, dot: 'bg-rose-600' };
    if (d <= 7) return { label: `Last order ${ago}`, dot: 'bg-emerald-500' };
    if (d <= 30) return { label: `Cooling · last order ${ago}`, dot: 'bg-amber-500' };
    return { label: `Dormant · last order ${ago}`, dot: 'bg-zinc-400' };
}

/** Order statuses that mean "no delivery outcome resolved yet". */
const UNRESOLVED_STATUSES = new Set([
    'new', 'contacted', 'confirmed', 'in_transit', 'pending', 'pending_checkout', 'suspended',
]);

/**
 * True when a customer has ordered but has no delivered outcome yet — so we show
 * "First delivery pending" instead of an alarming red "0%".
 */
export function firstDeliveryPending(c: {
    total_orders: number;
    completed_count: number;
    last_order_status?: string | null;
}): boolean {
    if (c.total_orders < 1) return false;
    if (c.completed_count > 0) return false;
    return c.last_order_status ? UNRESOLVED_STATUSES.has(c.last_order_status) : c.total_orders <= 1;
}

export interface StatusFlag {
    key: 'rejected' | 'cancelled' | 'no_response' | 'returned' | 'refund';
    count: number;
    /** bg + text classes for the chip. */
    tone: string;
    i18nKey: string;
}

/**
 * Factual order-outcome flags for a customer (from live status counts). ANY order
 * with the outcome surfaces the flag — e.g. one cancelled order → a "1 cancelled"
 * chip. Ordered most-to-least severe. These ARE the human reason behind the RISK level.
 */
export function statusFlags(c: {
    rejected_count: number;
    cancelled_count: number;
    no_response_count: number;
    returned_count: number;
    refund_count: number;
}): StatusFlag[] {
    const defs: Array<[StatusFlag['key'], number, string, string]> = [
        ['rejected', c.rejected_count, 'bg-rose-50 text-rose-700', 'customers.flag.rejected'],
        ['no_response', c.no_response_count, 'bg-amber-50 text-amber-700', 'customers.flag.noResponse'],
        ['returned', c.returned_count, 'bg-fuchsia-50 text-fuchsia-700', 'customers.flag.returned'],
        ['cancelled', c.cancelled_count, 'bg-orange-50 text-orange-700', 'customers.flag.cancelled'],
        ['refund', c.refund_count, 'bg-purple-50 text-purple-700', 'customers.flag.refunded'],
    ];
    return defs
        .filter(([, n]) => n > 0)
        .map(([key, count, tone, i18nKey]) => ({ key, count, tone, i18nKey }));
}

/** Band the average score (0–100) into a one-word summary for the KPI strip. */
export function reliabilityBand(avgScore: number): string {
    const s = displayScore(avgScore);
    if (s >= 85) return 'Excellent overall';
    if (s >= 70) return 'Good overall';
    if (s >= 50) return 'Mixed overall';
    return 'Needs attention';
}
