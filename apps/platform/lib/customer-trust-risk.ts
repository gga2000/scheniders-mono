/**
 * Customer-trust risk for order LIST rows, built in the client.
 *
 * The order list used to read `v_orders_with_risk`, which LEFT JOINs
 * `customer_trust` on `normalize_phone(...)`. That plpgsql call cannot use an
 * index, so every 1,000-row page re-sorted the tenant's whole book on it and
 * spilled to disk. The list now reads `orders` directly and attaches
 * `risk_data` here, from a lookup keyed on `customer_trust`'s primary key
 * `(tenant_id, phone)`.
 *
 * Everything below mirrors the view definition exactly, so cards, risk badges
 * and the risk filter see byte-for-byte the object they saw before.
 */
import type { RiskLevel } from "@/types/order";

/** `customer_trust` columns the view's `risk_data` reads, plus its key. */
export const TRUST_RISK_COLUMNS = [
    "tenant_id",
    "phone",
    "trust_score",
    "trust_tier",
    "delivery_success_rate",
    "community_avg_rating",
    "community_rating_count",
    "total_orders",
    "delivered_count",
    "cancelled_customer_count",
    "cancelled_merchant_count",
    "rejected_customer_fault_count",
    "rejected_merchant_fault_count",
    "rejected_ambiguous_count",
    "no_response_count",
    "refund_count",
].join(",");

export interface TrustRow {
    tenant_id: string;
    phone: string;
    trust_score: number | null;
    trust_tier: string | null;
    delivery_success_rate: number | null;
    community_avg_rating: number | null;
    community_rating_count: number | null;
    total_orders: number | null;
    delivered_count: number | null;
    cancelled_customer_count: number | null;
    cancelled_merchant_count: number | null;
    rejected_customer_fault_count: number | null;
    rejected_merchant_fault_count: number | null;
    rejected_ambiguous_count: number | null;
    no_response_count: number | null;
    refund_count: number | null;
}

/** The exact `risk_data` object `v_orders_with_risk` builds. */
export interface OrderRiskData {
    /** The view only ever yields low/medium/high; typed as the wider
     *  RiskLevel because consumers also handle risk_metadata's levels. */
    level: RiskLevel;
    score: number | null;
    tier: string | null;
    reasons: string[];
    isBlacklisted: boolean;
    deliverySuccessRate: number | null;
    communityAvgRating: number | null;
    communityRatingCount: number | null;
    historicalData: {
        totalOrders: number | null;
        deliveredCount: number | null;
        cancelledCustomerCount: number | null;
        cancelledMerchantCount: number | null;
        rejectedCustomerFaultCount: number | null;
        rejectedMerchantFaultCount: number | null;
        rejectedAmbiguousCount: number | null;
        rejectedCount: number | null;
        cancelledCount: number | null;
        noResponseCount: number | null;
        refundCount: number | null;
    };
}

/**
 * Exact port of SQL `public.normalize_phone(text)` (applied to
 * `COALESCE(phone, '')`): Arabic-Indic and Persian digits to ASCII, strip
 * non-digits, drop one leading `964`, then one leading `0`.
 *
 * Deliberately not `normalizePhoneForSearch` — that one also strips `00` and
 * skips Persian digits, so it would key some phones differently from the DB.
 */
export function normalizePhoneLikeDb(phone: string | null | undefined): string {
    let clean = (phone ?? "")
        .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
        .replace(/\D/g, "");
    if (clean.startsWith("964")) clean = clean.substring(3);
    if (clean.startsWith("0")) clean = clean.substring(1);
    return clean;
}

export function trustKey(tenantId: string, normalizedPhone: string): string {
    return `${tenantId}|${normalizedPhone}`;
}

function tierToLevel(tier: string | null): RiskLevel {
    if (tier === "risky") return "high";
    if (tier === "watch") return "medium";
    return "low";
}

/**
 * Mirrors the view's `jsonb_build_object(...)`. With no matching trust row the
 * LEFT JOIN yields NULL columns and `jsonb_build_object` still returns an
 * object (its COALESCE fallback never fires), so an unknown customer gets
 * level "low" with null stats — reproduced here, not "fixed", so nothing that
 * reads `risk_data` changes behaviour.
 */
export function buildRiskData(ct: TrustRow | undefined): OrderRiskData {
    const t = ct ?? null;
    return {
        level: tierToLevel(t?.trust_tier ?? null),
        score: t?.trust_score ?? null,
        tier: t?.trust_tier ?? null,
        reasons: [],
        isBlacklisted: false,
        deliverySuccessRate: t?.delivery_success_rate ?? null,
        communityAvgRating: t?.community_avg_rating ?? null,
        communityRatingCount: t?.community_rating_count ?? null,
        historicalData: {
            totalOrders: t?.total_orders ?? null,
            deliveredCount: t?.delivered_count ?? null,
            cancelledCustomerCount: t?.cancelled_customer_count ?? null,
            cancelledMerchantCount: t?.cancelled_merchant_count ?? null,
            rejectedCustomerFaultCount: t?.rejected_customer_fault_count ?? null,
            rejectedMerchantFaultCount: t?.rejected_merchant_fault_count ?? null,
            rejectedAmbiguousCount: t?.rejected_ambiguous_count ?? null,
            rejectedCount: t?.rejected_customer_fault_count ?? null,
            cancelledCount: t?.cancelled_customer_count ?? null,
            noResponseCount: t?.no_response_count ?? null,
            refundCount: t?.refund_count ?? null,
        },
    };
}
