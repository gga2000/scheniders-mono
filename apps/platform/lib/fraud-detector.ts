import { supabase } from "@/lib/supabase";
import type { TrustTier } from "@/types/customer";
import { TRUST_TIER_CONFIG } from "@/types/customer";

export interface TrustAssessment {
    score: number; // uncapped — base 100, can go above or below 0
    tier: TrustTier;
    deliverySuccessRate: number;
    historicalData: {
        totalOrders: number;
        deliveredCount: number;
        cancelledCustomerCount: number;
        cancelledMerchantCount: number;
        rejectedCustomerFaultCount: number;
        rejectedMerchantFaultCount: number;
        rejectedAmbiguousCount: number;
        noResponseCount: number;
        refundCount: number;
    };
    communityAvgRating: number;
    communityRatingCount: number;
    isBlacklisted: boolean;
    isReturningCustomer: boolean;
    lastOrderDate: string | null;
    totalSpent: number;
    avgBasket: number;
    scoreBreakdown: { label: string; value: number; type: string }[];
    // Backward-compat fields (mapped from trust → old risk shape)
    level?: RiskLevel;
    reasons?: string[];
    recommendation?: string;
}

function tierToRiskLevel(tier: TrustTier): RiskLevel {
    switch (tier) {
        case 'blocked': return 'blocked';
        case 'risky': return 'high';
        case 'watch': return 'medium';
        default: return 'low';
    }
}

class TrustEngine {
    async assessCustomerTrust(phone: string): Promise<TrustAssessment> {
        try {
            const normalizedPhone = this.normalizePhone(phone);

            const { data, error } = await supabase
                .from("customer_trust")
                .select("*")
                .eq("phone", normalizedPhone)
                .maybeSingle();

            if (error) {
                console.error("[TrustEngine] DB Lookup Error:", error);
                return this.getDefaultAssessment();
            }

            if (data) {
                const tier = data.trust_tier as TrustTier;
                return {
                    score: data.trust_score,
                    tier,
                    level: tierToRiskLevel(tier),
                    deliverySuccessRate: Number(data.delivery_success_rate) || 0,
                    historicalData: {
                        totalOrders: data.total_orders || 0,
                        deliveredCount: data.delivered_count || 0,
                        cancelledCustomerCount: data.cancelled_customer_count || 0,
                        cancelledMerchantCount: data.cancelled_merchant_count || 0,
                        rejectedCustomerFaultCount: data.rejected_customer_fault_count || 0,
                        rejectedMerchantFaultCount: data.rejected_merchant_fault_count || 0,
                        rejectedAmbiguousCount: data.rejected_ambiguous_count || 0,
                        noResponseCount: data.no_response_count || 0,
                        refundCount: data.refund_count || 0,
                    },
                    communityAvgRating: Number(data.community_avg_rating) || 0,
                    communityRatingCount: data.community_rating_count || 0,
                    isBlacklisted: data.trust_tier === 'blocked',
                    isReturningCustomer: (data.total_orders || 0) > 0,
                    lastOrderDate: data.last_order_date,
                    totalSpent: Number(data.total_spent) || 0,
                    avgBasket: Number(data.avg_basket) || 0,
                    scoreBreakdown: data.score_breakdown || [],
                };
            }

            return this.getDefaultAssessment();
        } catch (err) {
            console.error("[TrustEngine] Exception:", err);
            return this.getDefaultAssessment();
        }
    }

    async batchAssess(phones: string[]): Promise<Map<string, TrustAssessment>> {
        const results = new Map<string, TrustAssessment>();
        const uniqueNormalized = new Set<string>();

        phones.forEach(p => {
            const norm = this.normalizePhone(p);
            if (norm.length >= 5) uniqueNormalized.add(norm);
        });

        const targets = Array.from(uniqueNormalized);
        if (targets.length === 0) return results;

        try {
            const { data, error } = await supabase
                .from("customer_trust")
                .select("*")
                .in("phone", targets);

            if (error) {
                console.error("[TrustEngine] Batch Error:", error);
                return results;
            }

            if (data) {
                data.forEach((row: any) => {
                    const rowTier = row.trust_tier as TrustTier;
                    results.set(row.phone, {
                        score: row.trust_score,
                        tier: rowTier,
                        level: tierToRiskLevel(rowTier),
                        deliverySuccessRate: Number(row.delivery_success_rate) || 0,
                        historicalData: {
                            totalOrders: row.total_orders || 0,
                            deliveredCount: row.delivered_count || 0,
                            cancelledCustomerCount: row.cancelled_customer_count || 0,
                            cancelledMerchantCount: row.cancelled_merchant_count || 0,
                            rejectedCustomerFaultCount: row.rejected_customer_fault_count || 0,
                            rejectedMerchantFaultCount: row.rejected_merchant_fault_count || 0,
                            rejectedAmbiguousCount: row.rejected_ambiguous_count || 0,
                            noResponseCount: row.no_response_count || 0,
                            refundCount: row.refund_count || 0,
                        },
                        communityAvgRating: Number(row.community_avg_rating) || 0,
                        communityRatingCount: row.community_rating_count || 0,
                        isBlacklisted: row.trust_tier === 'blocked',
                        isReturningCustomer: (row.total_orders || 0) > 0,
                        lastOrderDate: row.last_order_date,
                        totalSpent: Number(row.total_spent) || 0,
                        avgBasket: Number(row.avg_basket) || 0,
                        scoreBreakdown: row.score_breakdown || [],
                    });
                });
            }

            return results;
        } catch (err) {
            console.error("[TrustEngine] Batch exception:", err);
            return results;
        }
    }

    getTierBadgeClass(tier: TrustTier): string {
        const config = TRUST_TIER_CONFIG[tier];
        return `${config.bgClass} ${config.textClass} ${config.borderClass}`;
    }

    getTierGlowClass(tier: TrustTier): string {
        return TRUST_TIER_CONFIG[tier].glowClass;
    }

    getTierRingColor(tier: TrustTier): string {
        return TRUST_TIER_CONFIG[tier].ringColor;
    }

    async isHighTrust(phone: string): Promise<boolean> {
        const assessment = await this.assessCustomerTrust(phone);
        return assessment.tier === 'platinum' || assessment.tier === 'gold';
    }

    public normalizePhone(phone: string): string {
        if (!phone) return "";
        const arabicNumbers = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
        const persianNumbers = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
        let normalized = phone;
        for (let i = 0; i < 10; i++) {
            normalized = normalized.replace(arabicNumbers[i], i.toString()).replace(persianNumbers[i], i.toString());
        }
        normalized = normalized.replace(/\D/g, "");
        if (normalized.startsWith("964")) normalized = normalized.slice(3);
        if (normalized.startsWith("0")) normalized = normalized.slice(1);
        return normalized;
    }

    // Backward-compat helper methods
    getRiskBadgeColor(level: RiskLevel): string {
        const map: Record<RiskLevel, string> = {
            low: 'bg-green-100 text-green-700 border-green-200',
            medium: 'bg-amber-100 text-amber-700 border-amber-200',
            high: 'bg-red-100 text-red-700 border-red-200',
            blocked: 'bg-red-200 text-red-900 border-red-300',
        };
        return map[level] || map.low;
    }

    getRiskLevelLabel(level: RiskLevel): string {
        const map: Record<RiskLevel, string> = {
            low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk', blocked: 'Blocked',
        };
        return map[level] || 'Unknown';
    }

    getRiskLevelIcon(level: RiskLevel): string {
        const map: Record<RiskLevel, string> = {
            low: '✅', medium: '⚠️', high: '🚨', blocked: '🚫',
        };
        return map[level] || '❓';
    }

    private getDefaultAssessment(): TrustAssessment {
        return {
            score: 100,
            tier: 'new',
            level: 'low',
            deliverySuccessRate: 0,
            historicalData: {
                totalOrders: 0, deliveredCount: 0,
                cancelledCustomerCount: 0, cancelledMerchantCount: 0,
                rejectedCustomerFaultCount: 0, rejectedMerchantFaultCount: 0,
                rejectedAmbiguousCount: 0, noResponseCount: 0, refundCount: 0,
            },
            communityAvgRating: 0,
            communityRatingCount: 0,
            isBlacklisted: false,
            isReturningCustomer: false,
            lastOrderDate: null,
            totalSpent: 0,
            avgBasket: 0,
            scoreBreakdown: [],
        };
    }
}

// Backward-compatible type aliases
export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';
export type RiskAssessment = TrustAssessment;

// Keep backward-compatible export name AND new name
export const trustEngine = new TrustEngine();
export const fraudDetector = trustEngine; // backward compat
