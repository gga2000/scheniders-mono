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
import { translations, type Locale } from '@/lib/i18n';
import { baghdadMonthKey, formatBaghdadShortDate } from '@/lib/customer-format';
import {
    ORDER_STATUS_TONE, REFUND_ORDER_STATUS_LABELS, getOrderStatusLabel, orderStatusTone, type OrderStatusKey,
} from '@/lib/order-status-labels';

// ───────────────────────── VALUE axis ─────────────────────────

export type ValueTier = 'vip' | 'good' | 'newcomer';

export interface ValueMeta {
    /** Human label (fallback; i18n key `valueTierKey(tier)` overrides). */
    label: string;
    pillBg: string;
    pillText: string;
    dot: string;
}

export const VALUE_META: Record<ValueTier, ValueMeta> = {
    vip: { label: 'VIP', pillBg: 'bg-purple-100 dark:bg-purple-500/15', pillText: 'text-purple-800 dark:text-purple-200', dot: 'bg-purple-500' },
    // Green means "safe to ship" (COD risk Clean) and nothing else, so a spend tier is never green.
    good: { label: 'Good', pillBg: 'bg-sky-50 dark:bg-sky-500/15', pillText: 'text-sky-800 dark:text-sky-200', dot: 'bg-sky-500' },
    // No value proven yet, so no colour: neutral ink, which also keeps sky "Good" from reading as a second blue.
    newcomer: { label: 'Newcomer', pillBg: 'bg-zinc-100 dark:bg-white/10', pillText: 'text-zinc-700 dark:text-zinc-200', dot: 'bg-zinc-400' },
};

/**
 * The i18n key for a value tier's name on the customers screens. The Orders risk
 * panel keeps its own `customers.value.<tier>` wording; these say "customer" the
 * way the rest of the customers screens do.
 */
export function valueTierKey(tier: ValueTier): string {
    return `customers.tier.${tier}`;
}

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
    // The same solid rose in both themes, as on the drawer band and the profile.
    blocked: { label: 'Blocked', chipBg: 'bg-rose-700', chipText: 'text-white', dot: 'bg-rose-700' },
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
    /** Just when the last order was, for one-line cells: "12 days ago" up to a month, then "Sep 14" (relativeOrShortDate). */
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

/** Up to this many days a date reads relative ("20 days ago"); older, as its short day ("Jul 12"). */
export const RELATIVE_DAYS = 30;

/**
 * When something happened, the one way the customers screens write it (last order on the card
 * and the table, trust-score events on the profile): relative up to a month, then the short
 * Baghdad day ("Jul 12", or "Jul 12, 2025" before this year), so nobody counts back from
 * "117 days ago". `days` is daysSince(iso).
 */
export function relativeOrShortDate(iso: string, days: number, language: string, t: RecencyTranslate): string {
    return days <= RELATIVE_DAYS ? daysAgoLabel(days, t) : formatBaghdadShortDate(iso, language);
}

/**
 * Recency is a single neutral ramp, ink fading to a hollow ring, so it can
 * never be read as a status colour (amber already means "Needs confirming").
 */
const RECENCY_DOT: Record<RecencyState, string> = {
    active: 'bg-foreground',
    cooling: 'bg-muted-foreground/60',
    dormant: 'ring-1 ring-inset ring-muted-foreground/60',
    none: 'ring-1 ring-inset ring-muted-foreground/30',
};

/**
 * The dot beside "First delivery" on the card and the table row: the colour of
 * the "First delivery" saved view, so the row and the view it belongs to match.
 */
export const FIRST_DELIVERY_DOT = 'bg-teal-500';

/**
 * Recency line + status dot. The dot means one thing only, how recently the
 * customer ordered (active ≤ 7 days, cooling ≤ 30, dormant after); COD risk
 * has its own pill and is never folded into it.
 */
export function recencyStatus(lastOrderDate: string | null | undefined, t: RecencyTranslate, language: string): RecencyStatus {
    const d = daysSince(lastOrderDate);
    if (d === null || !lastOrderDate) {
        return { label: t('customers.recency.none'), ago: '—', stateLabel: t('customers.recency.none'), state: 'none', dot: RECENCY_DOT.none };
    }
    const ago = relativeOrShortDate(lastOrderDate, d, language, t);
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
    /** bg + text classes for the chip: the order-status pill's tone, so an outcome reads the same everywhere. */
    tone: string;
    i18nKey: string;
}

/** The order status each outcome flag counts, whose pill colour the flag wears. */
export const FLAG_ORDER_STATUS: Record<StatusFlag['key'], OrderStatusKey> = {
    rejected: 'rejected',
    no_response: 'no_response',
    returned: 'return_pending',
    cancelled: 'cancelled',
    refund: 'refund_delivered',
};

/** The order status behind each trust-engine event, so its icon wears that outcome's colour. */
const TRUST_EVENT_ORDER_STATUS: Record<string, OrderStatusKey> = {
    order_delivered: 'delivered',
    order_rejected: 'rejected',
    order_cancelled: 'cancelled',
    order_no_response: 'no_response',
    order_refund: 'refund_delivered',
};

/** Icon tone for a score event: the order-status tone for an order outcome, neutral for anything else. */
export function trustEventTone(eventType: string): string {
    return orderStatusTone(TRUST_EVENT_ORDER_STATUS[eventType] ?? null);
}

/**
 * The customers pages call each outcome by one word wherever it appears: the
 * order pill, the outcome flag, the score event and the order-outcomes line.
 * Where that word differs from the shared order table these override it here
 * only; the Orders page keeps the shared table's wording until its own design
 * review changes it.
 */
const CUSTOMER_STATUS_WORDING: Record<Locale, Partial<Record<OrderStatusKey, string>>> = {
    // A purchase on its way back is counted by the "1 returned" flag, so its pill says the same word.
    en: { cancelled: 'Cancelled', return_pending: 'Returned' },
    ar: { cancelled: 'ملغاة', no_response: 'بلا رد', return_pending: 'راجعة' },
};

/** An order status as the customer drawer and profile print it (see CUSTOMER_STATUS_WORDING). */
export function customerOrderStatusLabel(status: string, isReturn: boolean, locale: Locale): string {
    const key = status.toLowerCase() as OrderStatusKey;
    const refund = isReturn ? REFUND_ORDER_STATUS_LABELS[locale][key] : undefined;
    return refund ?? CUSTOMER_STATUS_WORDING[locale][key] ?? getOrderStatusLabel(status, locale, isReturn);
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
    const defs: Array<[StatusFlag['key'], number, string]> = [
        ['rejected', c.rejected_count, 'customers.flag.rejected'],
        ['no_response', c.no_response_count, 'customers.flag.noResponse'],
        ['returned', c.returned_count, 'customers.flag.returned'],
        ['cancelled', c.cancelled_count, 'customers.flag.cancelled'],
        ['refund', c.refund_count, 'customers.flag.refunded'],
    ];
    return defs
        .filter(([, n]) => n > 0)
        .map(([key, count, i18nKey]) => ({ key, count, tone: ORDER_STATUS_TONE[FLAG_ORDER_STATUS[key]], i18nKey }));
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

// ───────────────────────── trust history ─────────────────────────

export interface MonthlyScore {
    /** "YYYY-MM". */
    month: string;
    /** The month's average score on the 0–100 scale; null for a month with no scored events. */
    score: number | null;
}

/**
 * The Trust history chart's months: exactly `months` calendar months ending
 * with the current Baghdad month, oldest first. A month the history has no
 * row for is kept as a gap (score null), so "1Y" always spans a year and a
 * quiet stretch reads as quiet rather than disappearing.
 */
export function monthlyScoreSeries(
    rows: readonly { month: string; avg_score: number }[],
    months: number,
    now: Date = new Date(),
): MonthlyScore[] {
    const byMonth = new Map(rows.map((r) => [r.month.slice(0, 7), displayScore(r.avg_score)]));
    const [year, month] = baghdadMonthKey(now).split('-').map(Number);
    const series: MonthlyScore[] = [];
    for (let back = months - 1; back >= 0; back--) {
        const index = year * 12 + (month - 1) - back;
        const key = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
        series.push({ month: key, score: byMonth.get(key) ?? null });
    }
    return series;
}

// ───────────────────────── score breakdown ─────────────────────────

export interface ScoreFactor {
    /**
     * i18n key suffix under customers.scoreBreakdown.*. The closing gap is
     * "rounding" when it is no bigger than rounding each line can explain,
     * otherwise "adjustments" (a manual change, or points the stored
     * breakdown does not list).
     */
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
 * the difference is its own "Rounding" or "Other adjustments" factor so the
 * arithmetic closes. A blocked customer shows no score, so no factors either.
 */
export function buildScoreBreakdown(
    items: readonly ScoreFactor[],
    { storedScore, blocked, tier }: { storedScore: number | null; blocked: boolean; tier: TrustTier | string | null },
): ScoreBreakdownView {
    const kept = items.filter((item) => item.value !== 0 || item.label === 'base');
    const factorSum = kept.reduce((sum, item) => sum + item.value, 0);
    const raw = storedScore ?? factorSum;
    const gap = Math.round(raw - factorSum);
    // The engine rounds each weighted line and the total, so up to half a point
    // per line (and half for the total) can go missing in the arithmetic.
    const label = Math.abs(gap) <= (kept.length + 1) / 2 ? 'rounding' : 'adjustments';
    const factors: ScoreFactor[] = gap === 0 || kept.length === 0
        ? kept
        : [...kept, { label, value: gap, type: gap > 0 ? 'positive' : 'negative' }];
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

// ───────────────────────── tags vs tiers ─────────────────────────

/** The labels the store computes for a customer; a merchant tag with one of these names reads as the rating itself. */
const RATING_LABEL_KEYS = [
    'customers.value.vip', 'customers.value.good', 'customers.value.newcomer',
    'customers.tier.vip', 'customers.tier.good', 'customers.tier.newcomer',
    'customers.risk.clean', 'customers.risk.caution', 'customers.risk.high', 'customers.risk.blocked',
] as const;

/**
 * Whether a tag name copies a computed rating ("VIP", "Blocked", "جيد") in any
 * language the app speaks, compared without case or surrounding spaces, so
 * "vip" typed in the Arabic UI still matches.
 */
export function tagNameMatchesRating(name: string): boolean {
    const wanted = name.trim().toLowerCase();
    if (!wanted) return false;
    return Object.values(translations).some((dict) =>
        RATING_LABEL_KEYS.some((key) => (dict[key] ?? '').trim().toLowerCase() === wanted));
}
