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
    dot: string;
}

export const VALUE_META: Record<ValueTier, ValueMeta> = {
    vip: { label: 'VIP', pillBg: 'bg-purple-100 dark:bg-purple-500/15', pillText: 'text-purple-800 dark:text-purple-200', dot: 'bg-purple-500' },
    good: { label: 'Good', pillBg: 'bg-lime-50 dark:bg-lime-500/15', pillText: 'text-lime-800 dark:text-lime-200', dot: 'bg-lime-500' },
    newcomer: { label: 'Newcomer', pillBg: 'bg-blue-50 dark:bg-blue-500/15', pillText: 'text-blue-800 dark:text-blue-200', dot: 'bg-blue-400' },
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
    dot: string;
}

export const RISK_META: Record<RiskLevel, RiskMeta> = {
    clean: { label: 'Clean', chipBg: 'bg-emerald-50 dark:bg-emerald-500/15', chipText: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
    caution: { label: 'Caution', chipBg: 'bg-amber-50 dark:bg-amber-500/15', chipText: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-500' },
    high: { label: 'High risk', chipBg: 'bg-rose-50 dark:bg-rose-500/15', chipText: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-600' },
    blocked: { label: 'Blocked', chipBg: 'bg-zinc-800 dark:bg-rose-500/20', chipText: 'text-white dark:text-rose-200', dot: 'bg-rose-600' },
};

/** The colours a customer's band and banner are drawn in. */
export interface CustomerAccent {
    surfaceBg: string;
    surfaceText: string;
}

const UNSAFE_ACCENT: CustomerAccent = {
    surfaceBg: 'bg-rose-50 dark:bg-rose-500/15',
    surfaceText: 'text-rose-800 dark:text-rose-200',
};

/**
 * The value tier colours a customer, except when shipping them COD is unsafe:
 * a blocked or high-risk customer is drawn in the risk colour, so the
 * do-not-ship signal is never painted as a green "Good".
 */
export function customerAccent(value: ValueTier, risk: RiskLevel): CustomerAccent {
    if (risk === 'blocked' || risk === 'high') return UNSAFE_ACCENT;
    const meta = VALUE_META[value];
    return { surfaceBg: meta.pillBg, surfaceText: meta.pillText };
}

export interface RiskInput {
    severe_count: number;
    recent_severe_count: number;
    moderate_count: number;
    recent_moderate_count: number;
    is_blacklisted?: boolean;
    trust_tier?: TrustTier | string;
}

/**
 * Mirror of risk_level_calc over customer_order_facts. severe = a purchase
 * refused at the door (rejected or no_response); moderate = a cancelled
 * purchase, plus one per purchase the customer had refunded. Return orders and
 * a delivered purchase later exchanged or returned never count as severe.
 * recent = last 6 months.
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

/**
 * The COD verdict for the drawer and the profile banner. A clean customer whose
 * first delivery is still on the road has no history yet: "safe to ship" would
 * claim more than is known, so they get a neutral line instead.
 */
export function codVerdictKey(risk: RiskLevel, firstDeliveryIsPending: boolean): string {
    if (risk === 'clean' && firstDeliveryIsPending) return 'customers.codRisk.pending';
    return codRiskKey(risk);
}

// ───────────────────────── shared helpers ─────────────────────────

export interface BlockInput {
    is_blacklisted?: boolean | null;
    risk_level?: RiskLevel | null;
    trust_tier?: TrustTier | string | null;
}

/**
 * The one rule for "this customer is blocked", shared by the profile hero, the
 * drawer and the score breakdown: on the store's blacklist, or blocked by
 * either the risk model or the trust engine.
 */
export function isBlockedCustomer(c: BlockInput): boolean {
    return !!c.is_blacklisted || c.risk_level === 'blocked' || c.trust_tier === 'blocked';
}

/**
 * Whether a numeric trust score is shown for this customer. Every surface
 * applies the same rule: a blocked customer shows no score (the instruction
 * is "do not ship", not a number), and an unrated customer has none yet.
 */
export function showsTrustScore(c: BlockInput): boolean {
    return !isBlockedCustomer(c) && hasRatedScore(c.trust_tier ?? 'new');
}

/**
 * Whether to show a numeric engine score: only proven customers have one.
 * Unrated ("new") customers have no proof yet, and a blocked customer's score
 * ("100/100" next to Blocked) would mislead.
 */
export function hasRatedScore(tier: TrustTier | string): boolean {
    return tier !== 'new' && tier !== 'blocked';
}

/** Average basket: what a delivered order is worth. Undelivered orders earned nothing. */
export function averageBasket(totalSpent: number, deliveredCount: number): number | null {
    return deliveredCount > 0 ? Math.round(totalSpent / deliveredCount) : null;
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

export type RecencyState = 'active' | 'cooling' | 'dormant' | 'none';

export interface RecencyStatus {
    /** The full line, e.g. "Cooling · last order 12 days ago". */
    label: string;
    /** Just the time since the last order ("12 days ago"), for one-line table cells. */
    ago: string;
    /** What the dot means, in words: "Active", "Cooling", "Dormant". */
    stateLabel: string;
    state: RecencyState;
    dot: string;
}

type RecencyTranslate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * "today", "yesterday", "2 days ago", "12 days ago", in the active language.
 * Arabic counts 2 as a dual and 3–10 with a plural noun; English is the same for all.
 */
export function daysAgoLabel(days: number, t: RecencyTranslate): string {
    if (days <= 0) return t('customers.recency.today');
    if (days === 1) return t('customers.recency.yesterday');
    if (days === 2) return t('customers.recency.daysAgoTwo');
    if (days <= 10) return t('customers.recency.daysAgoFew', { days });
    return t('customers.recency.daysAgo', { days });
}

const RECENCY_DOT: Record<RecencyState, string> = {
    active: 'bg-emerald-500',
    cooling: 'bg-amber-500',
    dormant: 'bg-zinc-400',
    none: 'bg-zinc-300 dark:bg-zinc-600',
};

/**
 * Recency line + status dot. The dot means one thing only, how recently the
 * customer ordered (active ≤ 7 days, cooling ≤ 30, dormant after); COD risk
 * has its own pill and is never folded into it.
 */
export function recencyStatus(lastOrderDate: string | null | undefined, t: RecencyTranslate): RecencyStatus {
    const d = daysSince(lastOrderDate);
    if (d === null) {
        return { label: t('customers.recency.none'), ago: '—', stateLabel: t('customers.recency.none'), state: 'none', dot: RECENCY_DOT.none };
    }
    const ago = daysAgoLabel(d, t);
    const state: RecencyState = d <= 7 ? 'active' : d <= 30 ? 'cooling' : 'dormant';
    const label = state === 'active' ? t('customers.recency.last', { ago }) : t(`customers.recency.${state}`, { ago });
    return { label, ago, stateLabel: t(`customers.recency.state.${state}`), state, dot: RECENCY_DOT[state] };
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
        ['rejected', c.rejected_count, 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', 'customers.flag.rejected'],
        ['no_response', c.no_response_count, 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', 'customers.flag.noResponse'],
        ['returned', c.returned_count, 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300', 'customers.flag.returned'],
        ['cancelled', c.cancelled_count, 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', 'customers.flag.cancelled'],
        ['refund', c.refund_count, 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300', 'customers.flag.refunded'],
    ];
    return defs
        .filter(([, n]) => n > 0)
        .map(([key, count, tone, i18nKey]) => ({ key, count, tone, i18nKey }));
}

/**
 * Order statuses with a final delivery outcome: the base the trust engine's
 * delivery rate is computed on. Orders still in flight are not in it.
 */
const FINISHED_STATUSES = new Set([
    'delivered', 'completed', 'cancelled', 'rejected', 'returned', 'refunded',
    'refund_delivered', 'return_pending', 'no_response',
]);

/** True when the order has a final outcome (delivered or failed), so it counts toward the delivery rate. */
export function isFinishedOrder(status: string | null | undefined): boolean {
    return !!status && FINISHED_STATUSES.has(status.toLowerCase());
}

// ───────────────────────── score breakdown ─────────────────────────

export interface ScoreFactor {
    /** i18n key suffix under customers.scoreBreakdown.*; "adjustments" for the closing gap. */
    label: string;
    value: number;
    type: 'positive' | 'negative' | 'neutral';
}

export interface ScoreBreakdownView {
    /** The bars to draw. Empty for a blocked customer: the factors would add up to the hidden score. */
    factors: ScoreFactor[];
    /** The stored score (or, before one is stored, the factor sum), unclamped. */
    raw: number;
    /** The total as shown on a 0–100 scale. */
    score: number;
    /** Whether the total is shown as a number (not for a new or a blocked customer). */
    rated: boolean;
    blocked: boolean;
}

/**
 * How a trust score adds up, the one rule for the profile's Trust factors card
 * and the score-breakdown modal. Zero factors are dropped (the base always
 * stays); the stored score is the total, and when the factors do not reach it
 * the difference is its own "Other adjustments" factor so the arithmetic
 * closes. A blocked customer shows no score, so no factors either.
 */
export function buildScoreBreakdown(
    items: readonly ScoreFactor[],
    { storedScore, blocked, tier }: { storedScore: number | null; blocked: boolean; tier: TrustTier | string | null },
): ScoreBreakdownView {
    const kept = items.filter((item) => item.value !== 0 || item.label === 'base');
    const factorSum = kept.reduce((sum, item) => sum + item.value, 0);
    const raw = storedScore ?? factorSum;
    const gap = Math.round(raw - factorSum);
    const factors: ScoreFactor[] = gap === 0 || kept.length === 0
        ? kept
        : [...kept, { label: 'adjustments', value: gap, type: gap > 0 ? 'positive' : 'negative' }];
    return {
        factors: blocked ? [] : factors,
        raw,
        score: displayScore(raw),
        rated: !blocked && storedScore !== null && showsTrustScore({ trust_tier: tier ?? 'new' }),
        blocked,
    };
}

/**
 * Colours for a score factor: the base is a neutral blue, gains green and
 * losses rose, at the same muted strength in light and dark. The value label
 * sits beside the bar in `text`, never on top of the fill.
 */
export const SCORE_FACTOR_TONE: Record<ScoreFactor['type'], { bar: string; text: string }> = {
    neutral: { bar: 'bg-sky-500/60 dark:bg-sky-400/45', text: 'text-sky-700 dark:text-sky-300' },
    positive: { bar: 'bg-emerald-500/60 dark:bg-emerald-400/45', text: 'text-emerald-700 dark:text-emerald-300' },
    negative: { bar: 'bg-rose-500/60 dark:bg-rose-400/45', text: 'text-rose-700 dark:text-rose-300' },
};
