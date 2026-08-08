import { describe, it, expect } from 'vitest';
import {
    valueTier,
    riskLevel,
    codRiskKey,
    hasRatedScore,
    displayScore,
    effectiveSuccessRate,
    recencyStatus,
    firstDeliveryPending,
    reliabilityBand,
    statusFlags,
    VALUE_META,
    RISK_META,
    type RiskInput,
} from './customer-reliability';

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

describe('recencyStatus', () => {
    it('high/blocked always reads red', () => {
        expect(recencyStatus(daysAgo(3), 'high').dot).toBe('bg-rose-600');
        expect(recencyStatus(daysAgo(3), 'blocked').dot).toBe('bg-rose-600');
    });
    it('buckets active / cooling / dormant for healthy customers', () => {
        expect(recencyStatus(daysAgo(2), 'clean').dot).toBe('bg-emerald-500');
        expect(recencyStatus(daysAgo(20), 'clean').dot).toBe('bg-amber-500');
        expect(recencyStatus(daysAgo(60), 'caution').dot).toBe('bg-zinc-400');
    });
    it('handles missing date', () => {
        expect(recencyStatus(null, 'clean').label).toBe('No orders yet');
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
    it('reliabilityBand summarises an average', () => {
        expect(reliabilityBand(90)).toBe('Excellent overall');
        expect(reliabilityBand(75)).toBe('Good overall');
        expect(reliabilityBand(55)).toBe('Mixed overall');
        expect(reliabilityBand(30)).toBe('Needs attention');
    });
    it('hasRatedScore is false only for the engine "new" tier', () => {
        expect(hasRatedScore('new')).toBe(false);
        expect(hasRatedScore('silver')).toBe(true);
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
