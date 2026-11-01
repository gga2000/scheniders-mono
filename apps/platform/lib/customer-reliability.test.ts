import { describe, it, expect } from 'vitest';
import { translations, type Locale } from './i18n';
import {
    valueTier,
    riskLevel,
    codRiskKey,
    codVerdictKey,
    hasRatedScore,
    isBlockedCustomer,
    showsTrustScore,
    customerAccent,
    averageBasket,
    displayScore,
    effectiveSuccessRate,
    recencyStatus,
    relativeOrShortDate,
    RELATIVE_DAYS,
    valueTierKey,
    daysAgoLabel,
    buildScoreBreakdown,
    tagNameMatchesRating,
    SCORE_FACTOR_TONE,
    firstDeliveryPending,
    statusFlags,
    isFinishedOrder,
    VALUE_META,
    RISK_META,
    FLAG_ORDER_STATUS,
    trustEventTone,
    customerOrderStatusLabel,
    monthlyScoreSeries,
    type RiskInput,
} from './customer-reliability';
import { ORDER_STATUS_TONE } from './order-status-labels';
import { formatBaghdadShortDate } from './customer-format';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const risk = (o: Partial<RiskInput>): RiskInput => ({
    severe_count: 0, recent_severe_count: 0, moderate_count: 0, recent_moderate_count: 0, ...o,
});

describe('valueTier (by completed orders)', () => {
    it('VIP 3+ / Good 2 / Newcomer 0–1 — only completions count', () => {
        expect(valueTier({ completed_count: 7 })).toBe('vip');
        expect(valueTier({ completed_count: 3 })).toBe('vip');
        expect(valueTier({ completed_count: 2 })).toBe('good');
        expect(valueTier({ completed_count: 1 })).toBe('newcomer');
        expect(valueTier({ completed_count: 0 })).toBe('newcomer');
    });
});

describe('riskLevel (recency- and pattern-weighted, NOT binary)', () => {
    it('blocked wins over everything', () => {
        expect(riskLevel(risk({ is_blacklisted: true, recent_severe_count: 0 }))).toBe('blocked');
        expect(riskLevel(risk({ trust_tier: 'blocked' }))).toBe('blocked');
    });
    it('high: 2+ recent severe, OR chronic severe still recurring', () => {
        expect(riskLevel(risk({ severe_count: 2, recent_severe_count: 2 }))).toBe('high');
        expect(riskLevel(risk({ severe_count: 5, recent_severe_count: 1 }))).toBe('high'); // 3+ and still recent
    });
    it('caution: a single recent severe, any recent moderate, or 2+ total blemishes', () => {
        expect(riskLevel(risk({ severe_count: 1, recent_severe_count: 1 }))).toBe('caution');
        expect(riskLevel(risk({ moderate_count: 1, recent_moderate_count: 1 }))).toBe('caution');
        expect(riskLevel(risk({ severe_count: 1, moderate_count: 1 }))).toBe('caution'); // 2 total, stale
    });
    it('THE KEY FIX: a great buyer with ONE stale hiccup reads Clean, not buried', () => {
        // one old rejection, nothing recent, nothing else
        expect(riskLevel(risk({ severe_count: 1, recent_severe_count: 0 }))).toBe('clean');
        // one old cancellation only
        expect(riskLevel(risk({ moderate_count: 1, recent_moderate_count: 0 }))).toBe('clean');
    });
    it('chronic but long-quiet (3+ severe, none recent) is NOT high', () => {
        expect(riskLevel(risk({ severe_count: 4, recent_severe_count: 0 }))).toBe('caution');
    });
    it('spotless customer is clean', () => {
        expect(riskLevel(risk({}))).toBe('clean');
    });
});

describe('codRiskKey', () => {
    it('maps each risk level to a distinct i18n key', () => {
        const keys = (['clean', 'caution', 'high', 'blocked'] as const).map(codRiskKey);
        expect(new Set(keys).size).toBe(4);
        expect(codRiskKey('high')).toBe('customers.codRisk.high');
    });
});

describe('displayScore', () => {
    it('clamps drift (>100 / negative) and rounds', () => {
        expect(displayScore(104)).toBe(100);
        expect(displayScore(-12)).toBe(0);
        expect(displayScore(81.6)).toBe(82);
    });
    it('handles non-finite input', () => {
        expect(displayScore(NaN)).toBe(0);
        expect(displayScore(Infinity)).toBe(100);
    });
});

describe('effectiveSuccessRate (reconciles trust vs live orders)', () => {
    it('uses the trust-engine rate when present', () => {
        expect(effectiveSuccessRate({ delivery_success_rate: 80, completed_count: 0, total_orders: 0 })).toBe(80);
    });
    it('derives from completed/total when no trust row (no false 0%)', () => {
        expect(effectiveSuccessRate({ delivery_success_rate: 0, completed_count: 3, total_orders: 4 })).toBe(75);
    });
    it('0 when there are no orders at all', () => {
        expect(effectiveSuccessRate({ delivery_success_rate: 0, completed_count: 0, total_orders: 0 })).toBe(0);
    });
});

/** Real dictionary lookup, so the labels are checked in both languages. */
const tIn = (locale: Locale) => (key: string, vars?: Record<string, string | number>) =>
    (translations[locale][key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`));
const tStub = tIn('en');

describe('recencyStatus', () => {
    it('the dot means recency only, whatever the risk', () => {
        expect(recencyStatus(daysAgo(2), tStub, 'en').dot).toBe('bg-foreground');
        expect(recencyStatus(daysAgo(20), tStub, 'en').dot).toBe('bg-muted-foreground/60');
        expect(recencyStatus(daysAgo(60), tStub, 'en').dot).toBe('ring-1 ring-inset ring-muted-foreground/60');
        expect(recencyStatus(daysAgo(2), tStub, 'en').state).toBe('active');
        expect(recencyStatus(daysAgo(20), tStub, 'en').state).toBe('cooling');
        expect(recencyStatus(daysAgo(60), tStub, 'en').state).toBe('dormant');
    });
    it('names what the dot means', () => {
        expect(recencyStatus(daysAgo(2), tStub, 'en').stateLabel).toBe('Active');
        expect(recencyStatus(daysAgo(20), tStub, 'en').stateLabel).toBe('Cooling');
        expect(recencyStatus(daysAgo(60), tIn('ar'), 'ar').stateLabel).toBe('منقطع');
    });
    it('handles missing date', () => {
        expect(recencyStatus(null, tStub, 'en').label).toBe('No orders yet');
        expect(recencyStatus(null, tStub, 'en').state).toBe('none');
    });
    it('writes the label in the active language', () => {
        expect(recencyStatus(daysAgo(20), tStub, 'en').label).toBe('Cooling · last order 20 days ago');
        expect(recencyStatus(daysAgo(20), tIn('ar'), 'ar').label).toBe('قلّ نشاطه · آخر طلب قبل 20 يوماً');
        expect(recencyStatus(daysAgo(1), tIn('ar'), 'ar').label).toBe('آخر طلب أمس');
    });
    it('counts days the Arabic way (dual, few, many)', () => {
        expect(recencyStatus(daysAgo(2), tIn('ar'), 'ar').ago).toBe('قبل يومين');
        expect(recencyStatus(daysAgo(5), tIn('ar'), 'ar').ago).toBe('قبل 5 أيام');
        expect(recencyStatus(daysAgo(12), tIn('ar'), 'ar').ago).toBe('قبل 12 يوماً');
        expect(recencyStatus(daysAgo(5), tStub, 'en').ago).toBe('5 days ago');
    });
    it('gives the bare time since the last order for one-line cells', () => {
        expect(recencyStatus(daysAgo(20), tStub, 'en').ago).toBe('20 days ago');
        expect(recencyStatus(null, tStub, 'en').ago).toBe('—');
    });
    it('switches to the short day past a month, like trust events', () => {
        expect(recencyStatus(daysAgo(RELATIVE_DAYS), tStub, 'en').ago).toBe(`${RELATIVE_DAYS} days ago`);
        const old = '2025-03-14T09:00:00Z';
        expect(recencyStatus(old, tStub, 'en').ago).toBe('Mar 14, 2025');
        expect(recencyStatus(old, tStub, 'en').label).toBe('Dormant · last order Mar 14, 2025');
        expect(recencyStatus(old, tIn('ar'), 'ar').ago).toBe(formatBaghdadShortDate(old, 'ar'));
    });
});

describe('relativeOrShortDate', () => {
    it('is relative up to RELATIVE_DAYS, then the short Baghdad day', () => {
        const now = new Date('2026-11-01T09:00:00Z');
        const iso = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
        expect(relativeOrShortDate(iso(30), 30, 'en', tStub)).toBe('30 days ago');
        expect(relativeOrShortDate(iso(31), 31, 'en', tStub)).toBe(formatBaghdadShortDate(iso(31), 'en'));
    });
});

describe('daysAgoLabel', () => {
    it('never abbreviates Arabic (no "قبل 1 ي")', () => {
        expect(daysAgoLabel(0, tIn('ar'))).toBe('اليوم');
        expect(daysAgoLabel(1, tIn('ar'))).toBe('أمس');
        expect(daysAgoLabel(25, tIn('ar'))).toBe('قبل 25 يوماً');
        expect(daysAgoLabel(1, tStub)).toBe('yesterday');
    });
});

describe('buildScoreBreakdown (Trust factors card and breakdown modal)', () => {
    const items = [
        { label: 'base', value: 50, type: 'neutral' as const },
        { label: 'delivery', value: 45, type: 'positive' as const },
        { label: 'rejected', value: 0, type: 'negative' as const },
        { label: 'no_response', value: 0, type: 'negative' as const },
    ];

    it('drops zero factors but always keeps the base', () => {
        const zeroBase = buildScoreBreakdown([{ label: 'base', value: 0, type: 'neutral' }, { label: 'cancelled', value: 0, type: 'negative' }], { storedScore: 0, blocked: false, tier: 'gold' });
        expect(zeroBase.factors.map((f) => f.label)).toEqual(['base']);
        const view = buildScoreBreakdown(items, { storedScore: 95, blocked: false, tier: 'gold' });
        expect(view.factors.map((f) => f.label)).toEqual(['base', 'delivery']);
    });

    it('closes the gap to the stored score with "Other adjustments"', () => {
        const view = buildScoreBreakdown(items, { storedScore: 92, blocked: false, tier: 'gold' });
        expect(view.factors.at(-1)).toEqual({ label: 'adjustments', value: -3, type: 'negative' });
        expect(view.factors.reduce((sum, f) => sum + f.value, 0)).toBe(92);
        expect(view.score).toBe(92);
        expect(view.rated).toBe(true);
        const up = buildScoreBreakdown(items, { storedScore: 97, blocked: false, tier: 'gold' });
        expect(up.factors.at(-1)).toEqual({ label: 'adjustments', value: 2, type: 'positive' });
    });

    it('names a gap that rounding each line explains "Rounding"', () => {
        const view = buildScoreBreakdown(items, { storedScore: 94, blocked: false, tier: 'gold' });
        expect(view.factors.at(-1)).toEqual({ label: 'rounding', value: -1, type: 'negative' });
    });

    it('adds no gap row when the factors already add up', () => {
        const view = buildScoreBreakdown(items, { storedScore: 95, blocked: false, tier: 'gold' });
        expect(view.factors.some((f) => f.label === 'adjustments')).toBe(false);
    });

    it('uses the factor sum before a score is stored, without a number', () => {
        const view = buildScoreBreakdown(items, { storedScore: null, blocked: false, tier: 'new' });
        expect(view.raw).toBe(95);
        expect(view.rated).toBe(false);
    });

    it('shows no factors and no score for a blocked customer', () => {
        const view = buildScoreBreakdown(items, { storedScore: 12, blocked: true, tier: 'risky' });
        expect(view.factors).toEqual([]);
        expect(view.rated).toBe(false);
        expect(view.blocked).toBe(true);
    });

    it('a new customer has factors but no rated total', () => {
        const view = buildScoreBreakdown(items, { storedScore: 50, blocked: false, tier: 'new' });
        expect(view.rated).toBe(false);
        expect(view.factors.length).toBeGreaterThan(0);
    });

    it('clamps the shown total to 0–100 but keeps the raw sum', () => {
        const view = buildScoreBreakdown(items, { storedScore: 130, blocked: false, tier: 'platinum' });
        expect(view.raw).toBe(130);
        expect(view.score).toBe(100);
        expect(view.factors.reduce((sum, f) => sum + f.value, 0)).toBe(130);
    });

    it('draws the base neutral, never green', () => {
        expect(SCORE_FACTOR_TONE.neutral.bar).not.toMatch(/emerald|green/);
    });
});

describe('isFinishedOrder (the delivery-rate base)', () => {
    it('counts delivered and failed outcomes, not orders in flight', () => {
        for (const s of ['delivered', 'completed', 'cancelled', 'rejected', 'returned', 'refunded', 'refund_delivered', 'return_pending', 'no_response']) {
            expect(isFinishedOrder(s)).toBe(true);
        }
        for (const s of ['new', 'confirmed', 'in_transit', 'pending', null]) {
            expect(isFinishedOrder(s)).toBe(false);
        }
    });
});

describe('firstDeliveryPending', () => {
    it('true when ordered but no completed outcome and latest still unresolved', () => {
        expect(firstDeliveryPending({ total_orders: 1, completed_count: 0, last_order_status: 'in_transit' })).toBe(true);
        expect(firstDeliveryPending({ total_orders: 1, completed_count: 0, last_order_status: 'confirmed' })).toBe(true);
    });
    it('false once there is any completed order', () => {
        expect(firstDeliveryPending({ total_orders: 5, completed_count: 3, last_order_status: 'delivered' })).toBe(false);
    });
    it('false for a resolved failure (e.g. last order rejected)', () => {
        expect(firstDeliveryPending({ total_orders: 3, completed_count: 0, last_order_status: 'rejected' })).toBe(false);
    });
    it('false with no orders', () => {
        expect(firstDeliveryPending({ total_orders: 0, completed_count: 0 })).toBe(false);
    });
});

describe('copy + meta', () => {
    it('hasRatedScore is false for unrated and blocked customers', () => {
        expect(hasRatedScore('new')).toBe(false);
        expect(hasRatedScore('blocked')).toBe(false);
        expect(hasRatedScore('silver')).toBe(true);
    });
    it('averageBasket divides by delivered orders only', () => {
        expect(averageBasket(48_000, 1)).toBe(48_000);
        expect(averageBasket(50_000, 3)).toBe(16_667);
        expect(averageBasket(10_000, 0)).toBeNull();
    });
    it('every value + risk level has visual meta', () => {
        (['vip', 'good', 'newcomer'] as const).forEach((v) => expect(VALUE_META[v].label.length).toBeGreaterThan(0));
        (['clean', 'caution', 'high', 'blocked'] as const).forEach((r) => expect(RISK_META[r].label.length).toBeGreaterThan(0));
    });
});

describe('statusFlags', () => {
    it('surfaces a chip for any non-zero outcome, most-severe first', () => {
        const f = statusFlags({ rejected_count: 0, cancelled_count: 1, no_response_count: 2, returned_count: 0, refund_count: 1 });
        expect(f.map((x) => x.key)).toEqual(['no_response', 'cancelled', 'refund']);
        expect(f.find((x) => x.key === 'no_response')?.count).toBe(2);
    });
    it('orders rejected/no_response/returned before cancelled/refund', () => {
        const f = statusFlags({ rejected_count: 1, cancelled_count: 1, no_response_count: 0, returned_count: 1, refund_count: 0 });
        expect(f.map((x) => x.key)).toEqual(['rejected', 'returned', 'cancelled']);
    });
    it('returns empty when the customer has no flagged outcomes', () => {
        expect(statusFlags({ rejected_count: 0, cancelled_count: 0, no_response_count: 0, returned_count: 0, refund_count: 0 })).toEqual([]);
    });
});

describe('isBlockedCustomer / showsTrustScore', () => {
    it('a blacklisted customer is blocked whatever the trust tier says', () => {
        const c = { is_blacklisted: true, risk_level: 'high' as const, trust_tier: 'risky' };
        expect(isBlockedCustomer(c)).toBe(true);
        expect(showsTrustScore(c)).toBe(false);
    });
    it('the risk model or the trust engine can each block', () => {
        expect(isBlockedCustomer({ risk_level: 'blocked' })).toBe(true);
        expect(isBlockedCustomer({ trust_tier: 'blocked' })).toBe(true);
        expect(isBlockedCustomer({ risk_level: 'high', trust_tier: 'risky' })).toBe(false);
    });
    it('a rated, unblocked customer shows a score; an unrated one does not', () => {
        expect(showsTrustScore({ risk_level: 'high', trust_tier: 'bronze' })).toBe(true);
        expect(showsTrustScore({ risk_level: 'clean', trust_tier: 'new' })).toBe(false);
    });
});

describe('codVerdictKey', () => {
    it('a clean customer with the first delivery pending gets the neutral line', () => {
        expect(codVerdictKey('clean', true)).toBe('customers.codRisk.pending');
        expect(codVerdictKey('clean', false)).toBe('customers.codRisk.clean');
        expect(codVerdictKey('high', true)).toBe('customers.codRisk.high');
    });
    it('every verdict key is translated in both locales', () => {
        for (const l of ['en', 'ar'] as Locale[]) expect(translations[l]['customers.codRisk.pending']).toBeTruthy();
    });
});

describe('customerAccent', () => {
    it('never paints an unsafe customer in the value colour', () => {
        expect(customerAccent('good', 'blocked').surfaceBg).toContain('rose');
        expect(customerAccent('vip', 'high').surfaceBg).toContain('rose');
        expect(customerAccent('good', 'clean').surfaceBg).toBe(VALUE_META.good.pillBg);
    });
});

describe('one outcome, one colour and one word on the customers pages', () => {
    const all = { rejected_count: 1, cancelled_count: 1, no_response_count: 1, returned_count: 1, refund_count: 1 };

    it('each outcome flag wears its order-status pill tone', () => {
        for (const f of statusFlags(all)) expect(f.tone).toBe(ORDER_STATUS_TONE[FLAG_ORDER_STATUS[f.key]]);
    });

    it('a score event wears the same tone as the flag and the pill for that outcome', () => {
        expect(trustEventTone('order_no_response')).toBe(ORDER_STATUS_TONE.no_response);
        expect(trustEventTone('order_cancelled')).toBe(ORDER_STATUS_TONE.cancelled);
        expect(trustEventTone('order_rejected')).toBe(ORDER_STATUS_TONE.rejected);
        expect(trustEventTone('admin_override')).toBe(ORDER_STATUS_TONE.cancelled); // neutral
    });

    it('no response is a refusal (rose), apart from rejected and from neutral cancelled', () => {
        expect(ORDER_STATUS_TONE.no_response).toMatch(/rose/);
        expect(ORDER_STATUS_TONE.no_response).not.toBe(ORDER_STATUS_TONE.rejected);
        expect(ORDER_STATUS_TONE.cancelled).not.toMatch(/rose|orange|amber/);
    });

    it('the order pill uses the same word as the flag, the event and the outcomes line', () => {
        const t = (l: Locale, k: string) => translations[l][k];
        expect(customerOrderStatusLabel('cancelled', false, 'en')).toBe('Cancelled');
        expect(t('en', 'customers.flag.cancelled')).toBe('cancelled');
        expect(customerOrderStatusLabel('no_response', false, 'en')).toBe('No response');
        expect(t('en', 'customers.trust.event.order_no_response')).toBe('No response');
        expect(t('en', 'customers.behavioral.mix.noResponse')).toBe('{pct}% no response');

        const noResponseAr = customerOrderStatusLabel('no_response', false, 'ar');
        expect(noResponseAr).toBe('بلا رد');
        for (const k of ['customers.flag.noResponse', 'customers.trust.event.order_no_response', 'customers.scoreBreakdown.no_response']) {
            expect(t('ar', k)).toBe(noResponseAr);
        }
        expect(t('ar', 'customers.card.noResponse')).toContain(noResponseAr);
        expect(t('ar', 'customers.behavioral.mix.noResponse')).toContain(noResponseAr);

        const cancelledAr = customerOrderStatusLabel('cancelled', false, 'ar');
        expect(t('ar', 'customers.flag.cancelled')).toBe(cancelledAr);
        expect(t('ar', 'customers.behavioral.mix.cancelled')).toContain(cancelledAr);

        // A purchase coming back: the pill and the "1 returned" flag say one word.
        expect(customerOrderStatusLabel('return_pending', false, 'en').toLowerCase()).toBe(t('en', 'customers.flag.returned'));
        expect(customerOrderStatusLabel('return_pending', false, 'ar')).toBe(t('ar', 'customers.flag.returned'));
    });

    it('a refund order keeps its refund wording', () => {
        expect(customerOrderStatusLabel('rejected', true, 'en')).toBe('Refund failed');
        expect(customerOrderStatusLabel('delivered', false, 'ar')).toBe('تم التوصيل');
    });
});

describe('monthlyScoreSeries', () => {
    // 2026-11-15 noon Baghdad
    const now = new Date('2026-11-15T09:00:00Z');
    const rows = [
        { month: '2026-06-01', avg_score: 82.4 },
        { month: '2026-08-01', avg_score: 88 },
        { month: '2026-11-01', avg_score: 104 },
    ];

    it('spans exactly the requested months, ending with the current Baghdad month', () => {
        const year = monthlyScoreSeries(rows, 12, now);
        expect(year).toHaveLength(12);
        expect(year[0].month).toBe('2025-12');
        expect(year[11].month).toBe('2026-11');
        expect(monthlyScoreSeries(rows, 6, now).map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    });

    it('keeps months without history as gaps and clamps scores to 0–100', () => {
        const six = monthlyScoreSeries(rows, 6, now);
        expect(six.map((m) => m.score)).toEqual([82, null, 88, null, null, 100]);
    });

    it('uses the Baghdad month at a month boundary', () => {
        // 22:30 UTC on Oct 31 is already Nov 1 in Baghdad (UTC+3).
        expect(monthlyScoreSeries([], 1, new Date('2026-10-31T22:30:00Z'))[0].month).toBe('2026-11');
    });
});

describe('valueTierKey', () => {
    it('names every tier in both languages, with the one word for customer in Arabic', () => {
        for (const tier of ['vip', 'good', 'newcomer'] as const) {
            expect(translations.en[valueTierKey(tier)]).toBeTruthy();
            expect(translations.ar[valueTierKey(tier)]).toBeTruthy();
            expect(translations.ar[valueTierKey(tier)]).not.toMatch(/زبون|زبائن/);
        }
    });
});

describe('tagNameMatchesRating (a tag named like a value tier or COD risk)', () => {
    it('matches a rating label in any language, ignoring case and spaces', () => {
        expect(tagNameMatchesRating(' vip ')).toBe(true);
        expect(tagNameMatchesRating('محظور')).toBe(true);
        expect(tagNameMatchesRating('blocked')).toBe(true);
        expect(tagNameMatchesRating('Needs confirming')).toBe(true);
        // The customers screens' tier name as well as the Orders panel's.
        expect(tagNameMatchesRating('عميل جديد')).toBe(true);
        expect(tagNameMatchesRating('زبون جديد')).toBe(true);
    });
    it('leaves other names alone', () => {
        expect(tagNameMatchesRating('Wholesale')).toBe(false);
        expect(tagNameMatchesRating('  ')).toBe(false);
    });
});
