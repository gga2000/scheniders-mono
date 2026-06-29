import { describe, it, expect } from 'vitest';
import {
    reliabilityFromTier,
    reliabilityForCustomer,
    hasRatedScore,
    displayScore,
    valuePill,
    recencyStatus,
    firstDeliveryPending,
    codVerdict,
    reliabilityBand,
    statusFlags,
    RELIABILITY_META,
} from './customer-reliability';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe('reliabilityFromTier', () => {
    it('maps the top value tiers to Excellent (with enough orders)', () => {
        expect(reliabilityFromTier('platinum', 20)).toBe('excellent');
        expect(reliabilityFromTier('gold', 10)).toBe('excellent');
    });
    it('maps mid tiers to Good', () => {
        expect(reliabilityFromTier('silver', 6)).toBe('good');
        expect(reliabilityFromTier('bronze', 4)).toBe('good');
    });
    it('keeps risk tiers authoritative', () => {
        expect(reliabilityFromTier('watch', 5)).toBe('watch');
        expect(reliabilityFromTier('risky', 7)).toBe('risky');
        expect(reliabilityFromTier('critical', 7)).toBe('risky');
        expect(reliabilityFromTier('blocked', 30)).toBe('blocked');
    });
    it('treats engine-new and thin history as New', () => {
        expect(reliabilityFromTier('new', 1)).toBe('new');
        expect(reliabilityFromTier('silver', 2)).toBe('new'); // <3 orders safety override
    });
});

describe('displayScore', () => {
    it('clamps the historical drift (>100 and negative) and rounds', () => {
        expect(displayScore(104)).toBe(100);
        expect(displayScore(-12)).toBe(0);
        expect(displayScore(81.6)).toBe(82);
    });
    it('handles non-finite input', () => {
        expect(displayScore(NaN)).toBe(0);
        expect(displayScore(Infinity)).toBe(100);
    });
});

describe('valuePill', () => {
    it('only the top two tiers earn a pill', () => {
        expect(valuePill('platinum')?.label).toBe('VIP');
        expect(valuePill('gold')?.label).toBe('Gold');
        expect(valuePill('silver')).toBeNull();
        expect(valuePill('risky')).toBeNull();
    });
});

describe('recencyStatus', () => {
    it('new customers read by join recency', () => {
        expect(recencyStatus(daysAgo(2), 'new').label).toMatch(/Joined/);
        expect(recencyStatus(daysAgo(2), 'new').dot).toBe('bg-blue-400');
    });
    it('risky always reads red', () => {
        expect(recencyStatus(daysAgo(3), 'risky').dot).toBe('bg-rose-600');
    });
    it('buckets active / cooling / dormant for healthy customers', () => {
        expect(recencyStatus(daysAgo(2), 'excellent').dot).toBe('bg-lime-500');
        expect(recencyStatus(daysAgo(20), 'good').dot).toBe('bg-amber-500');
        expect(recencyStatus(daysAgo(60), 'good').dot).toBe('bg-zinc-400');
    });
    it('handles missing date', () => {
        expect(recencyStatus(null, 'good').label).toBe('No orders yet');
    });
});

describe('firstDeliveryPending', () => {
    it('true when ordered but no delivered outcome yet', () => {
        expect(firstDeliveryPending({ total_orders: 1, delivery_success_rate: 0, last_order_status: 'in_transit' })).toBe(true);
        expect(firstDeliveryPending({ total_orders: 1, delivery_success_rate: 0, last_order_status: 'confirmed' })).toBe(true);
    });
    it('false once there is any delivery success', () => {
        expect(firstDeliveryPending({ total_orders: 5, delivery_success_rate: 80, last_order_status: 'delivered' })).toBe(false);
    });
    it('false for a string of failures (resolved, just unsuccessful)', () => {
        expect(firstDeliveryPending({ total_orders: 3, delivery_success_rate: 0, last_order_status: 'rejected' })).toBe(false);
    });
    it('false with no orders', () => {
        expect(firstDeliveryPending({ total_orders: 0, delivery_success_rate: 0 })).toBe(false);
    });
});

describe('copy helpers', () => {
    it('codVerdict differentiates risk', () => {
        expect(codVerdict('excellent')).toMatch(/Low COD risk/);
        expect(codVerdict('risky')).toMatch(/High COD risk/);
    });
    it('reliabilityBand summarises an average', () => {
        expect(reliabilityBand(90)).toBe('Excellent overall');
        expect(reliabilityBand(75)).toBe('Good overall');
        expect(reliabilityBand(55)).toBe('Mixed overall');
        expect(reliabilityBand(30)).toBe('Needs attention');
    });
    it('every reliability level has visual meta', () => {
        (['excellent', 'good', 'watch', 'risky', 'new', 'blocked'] as const).forEach((r) => {
            expect(RELIABILITY_META[r].label.length).toBeGreaterThan(0);
        });
    });
});

describe('reliabilityForCustomer (value by completed orders)', () => {
    const c = (o: Partial<Parameters<typeof reliabilityForCustomer>[0]>) => ({
        trust_tier: 'new' as const, completed_count: 0, cancelled_count: 0, rejected_count: 0,
        returned_count: 0, refund_count: 0, no_response_count: 0, ...o,
    });
    it('ranks clean customers by COMPLETED orders: VIP 3+ / Good 2 / Newcomer 0–1', () => {
        expect(reliabilityForCustomer(c({ completed_count: 5 }))).toBe('excellent'); // VIP
        expect(reliabilityForCustomer(c({ completed_count: 3 }))).toBe('excellent');
        expect(reliabilityForCustomer(c({ completed_count: 2 }))).toBe('good');
        expect(reliabilityForCustomer(c({ completed_count: 1 }))).toBe('new'); // Newcomer
        expect(reliabilityForCustomer(c({ completed_count: 0 }))).toBe('new');
    });
    it('many orders but few completed is NOT VIP (only completions count)', () => {
        // 5 orders, 1 delivered → Newcomer, not VIP.
        expect(reliabilityForCustomer(c({ completed_count: 1 }))).toBe('new');
    });
    it('risk overrides value (a problem customer is never VIP)', () => {
        expect(reliabilityForCustomer(c({ completed_count: 5, rejected_count: 1 }))).toBe('risky');
        expect(reliabilityForCustomer(c({ completed_count: 5, no_response_count: 1 }))).toBe('risky');
        expect(reliabilityForCustomer(c({ completed_count: 5, cancelled_count: 1 }))).toBe('watch');
        expect(reliabilityForCustomer(c({ completed_count: 5, refund_count: 1 }))).toBe('watch');
    });
    it('blocked always wins', () => {
        expect(reliabilityForCustomer(c({ trust_tier: 'blocked', completed_count: 5 }))).toBe('blocked');
    });
    it('hasRatedScore is false only for the engine "new" tier', () => {
        expect(hasRatedScore('new')).toBe(false);
        expect(hasRatedScore('silver')).toBe(true);
    });
});

describe('statusFlags', () => {
    it('surfaces a chip for any non-zero outcome, most-severe first', () => {
        const f = statusFlags({ rejected_count: 0, cancelled_count: 1, no_response_count: 2, returned_count: 0, refund_count: 1 });
        expect(f.map((x) => x.key)).toEqual(['cancelled', 'no_response', 'refund']);
        expect(f.find((x) => x.key === 'no_response')?.count).toBe(2);
    });
    it('orders rejected before cancelled', () => {
        const f = statusFlags({ rejected_count: 1, cancelled_count: 1, no_response_count: 0, returned_count: 0, refund_count: 0 });
        expect(f.map((x) => x.key)).toEqual(['rejected', 'cancelled']);
    });
    it('returns empty when the customer has no flagged outcomes', () => {
        expect(statusFlags({ rejected_count: 0, cancelled_count: 0, no_response_count: 0, returned_count: 0, refund_count: 0 })).toEqual([]);
    });
});
