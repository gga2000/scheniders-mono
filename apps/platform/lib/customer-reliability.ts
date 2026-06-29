// =============================================
// CUSTOMER RELIABILITY MODEL
// Single source of truth for how a customer's trust is presented across the
// customers page (grid card, list row, detail drawer).
//
// We do NOT compute trust here — the trust engine (`calculate_customer_trust`)
// already does, producing `trust_tier` (9 engine tiers) + `trust_score`. This
// module RENAMES those engine tiers into a small, human, COD-legible set and
// fixes the historical display drift (score shown >100 / negative, cryptic ring).
//
// Reliability answers one question for an Iraqi cash-on-delivery merchant:
// "Can I trust this customer with a COD order?"
// =============================================

import type { TrustTier } from '@/types/customer';

export type Reliability = 'excellent' | 'good' | 'watch' | 'risky' | 'new' | 'blocked';

export interface ReliabilityMeta {
    /** Human label shown on the hero pill, e.g. "Excellent". */
    label: string;
    /** Soft tinted pill background (token-aligned pastel). */
    pillBg: string;
    /** Pill text colour. */
    pillText: string;
    /** 4px card/row accent rail colour. */
    rail: string;
    /** Default status dot (recency may override). */
    dot: string;
}

/**
 * Visual treatment per reliability level. Colours map to the app's semantic
 * pastels: lime = reliable, amber = caution, rose = risk, blue = new, zinc = blocked.
 */
export const RELIABILITY_META: Record<Reliability, ReliabilityMeta> = {
    excellent: { label: 'VIP', pillBg: 'bg-purple-100', pillText: 'text-purple-800', rail: 'bg-purple-500', dot: 'bg-purple-500' },
    good: { label: 'Good', pillBg: 'bg-lime-50', pillText: 'text-lime-800', rail: 'bg-lime-400', dot: 'bg-lime-500' },
    watch: { label: 'Watch', pillBg: 'bg-amber-50', pillText: 'text-amber-800', rail: 'bg-amber-400', dot: 'bg-amber-500' },
    risky: { label: 'Risky', pillBg: 'bg-rose-50', pillText: 'text-rose-800', rail: 'bg-rose-500', dot: 'bg-rose-600' },
    new: { label: 'Newcomer', pillBg: 'bg-blue-50', pillText: 'text-blue-800', rail: 'bg-blue-400', dot: 'bg-blue-400' },
    blocked: { label: 'Blocked', pillBg: 'bg-zinc-800', pillText: 'text-white', rail: 'bg-zinc-800', dot: 'bg-zinc-500' },
};

/**
 * Collapse the 9 engine tiers into the reliability set.
 * The engine already classifies risk authoritatively; we only rename for humans.
 */
export function reliabilityFromTier(tier: TrustTier, totalOrders: number): Reliability {
    if (tier === 'blocked') return 'blocked';
    if (tier === 'risky' || tier === 'critical') return 'risky';
    if (tier === 'watch') return 'watch';
    if (tier === 'new') return 'new';
    // Safety: a positive tier with too little history still reads as "new".
    if (totalOrders < 3) return 'new';
    if (tier === 'platinum' || tier === 'gold') return 'excellent';
    if (tier === 'silver' || tier === 'bronze') return 'good';
    return 'new';
}

/**
 * Customer value tier, ranked by how many orders actually COMPLETED (delivered) —
 * so a customer with 5 orders but only 1 delivered is NOT a VIP. Risk overrides
 * keep a problem customer from ever reading as high-value:
 *   - blocked (blacklisted) → blocked
 *   - any rejection / no-response → risky
 *   - any cancellation / return / refund → watch
 *   - otherwise by COMPLETED orders: 3+ → VIP (`excellent`), 2 → Good, 0–1 → Newcomer (`new`)
 *
 * (The `excellent`/`new` keys are kept for storage/i18n stability; they DISPLAY as
 * "VIP" and "Newcomer".)
 */
export function reliabilityForCustomer(c: {
    trust_tier: TrustTier;
    completed_count: number;
    cancelled_count: number;
    rejected_count: number;
    returned_count: number;
    refund_count: number;
    no_response_count: number;
}): Reliability {
    if (c.trust_tier === 'blocked') return 'blocked';
    if (c.rejected_count > 0 || c.no_response_count > 0) return 'risky';
    if (c.cancelled_count > 0 || c.returned_count > 0 || c.refund_count > 0) return 'watch';
    if (c.completed_count >= 3) return 'excellent'; // VIP
    if (c.completed_count === 2) return 'good';
    return 'new'; // Newcomer (0–1 completed orders)
}

/** Whether to show a numeric engine score — only proven (>=3-order) customers have one. */
export function hasRatedScore(tier: TrustTier): boolean {
    return tier !== 'new';
}

/** Clamp the raw engine score to a sane 0–100 for display (fixes >100 / negative drift). */
export function displayScore(trustScore: number): number {
    if (Number.isNaN(trustScore)) return 0;
    return Math.min(100, Math.max(0, Math.round(trustScore)));
}

export interface ValuePill {
    label: 'VIP' | 'Gold';
    pillBg: string;
    pillText: string;
}

/** Quiet corner pill for value tier — only the top two tiers earn one. */
export function valuePill(tier: TrustTier): ValuePill | null {
    if (tier === 'platinum') return { label: 'VIP', pillBg: 'bg-purple-50', pillText: 'text-purple-700' };
    if (tier === 'gold') return { label: 'Gold', pillBg: 'bg-amber-50', pillText: 'text-amber-700' };
    return null;
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

/**
 * Recency line + status dot. Risky customers always read red. New customers
 * read by join recency. Otherwise: active (≤7d) → cooling (≤30d) → dormant (>30d).
 */
export function recencyStatus(lastOrderDate: string | null | undefined, reliability: Reliability): RecencyStatus {
    const d = daysSince(lastOrderDate);
    const ago = d === null ? '' : d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;

    if (reliability === 'new') {
        return { label: d === null ? 'Just joined' : `Joined ${ago}`, dot: 'bg-blue-400' };
    }
    if (d === null) return { label: 'No orders yet', dot: 'bg-zinc-400' };
    if (reliability === 'risky') return { label: `Last order ${ago}`, dot: 'bg-rose-600' };
    if (d <= 7) return { label: `Last order ${ago}`, dot: 'bg-lime-500' };
    if (d <= 30) return { label: `Cooling · last order ${ago}`, dot: 'bg-amber-500' };
    return { label: `Dormant · last order ${ago}`, dot: 'bg-zinc-400' };
}

/** Order statuses that mean "no delivery outcome resolved yet". */
const UNRESOLVED_STATUSES = new Set([
    'new', 'contacted', 'confirmed', 'in_transit', 'pending', 'pending_checkout', 'suspended',
]);

/**
 * True when a customer has ordered but has no delivered/returned outcome yet —
 * so we show "First delivery pending" instead of an alarming red "0%".
 */
export function firstDeliveryPending(args: {
    total_orders: number;
    delivery_success_rate: number;
    last_order_status?: string | null;
}): boolean {
    if (args.total_orders < 1) return false;
    if (args.delivery_success_rate > 0) return false;
    // No successes AND the latest order is still unresolved → genuinely pending,
    // not a string of failures.
    return args.last_order_status ? UNRESOLVED_STATUSES.has(args.last_order_status) : args.total_orders <= 1;
}

/** Plain-language COD verdict for the detail drawer. */
export function codVerdict(reliability: Reliability): string {
    switch (reliability) {
        case 'excellent': return 'Low COD risk · safe to ship cash-on-delivery';
        case 'good': return 'Low COD risk · reliable for cash-on-delivery';
        case 'watch': return 'Some COD risk · confirm before shipping';
        case 'risky': return 'High COD risk · consider asking for prepayment';
        case 'blocked': return 'Blocked · do not ship';
        case 'new': return 'No history yet · first delivery will set the tone';
    }
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
 * chip. Ordered most-to-least severe.
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
        ['cancelled', c.cancelled_count, 'bg-orange-50 text-orange-700', 'customers.flag.cancelled'],
        ['no_response', c.no_response_count, 'bg-amber-50 text-amber-700', 'customers.flag.noResponse'],
        ['returned', c.returned_count, 'bg-fuchsia-50 text-fuchsia-700', 'customers.flag.returned'],
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
