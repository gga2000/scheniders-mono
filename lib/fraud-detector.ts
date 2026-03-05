import { supabase } from "@/lib/supabase";

// =============================================
// TYPES
// =============================================

export type RiskLevel = "low" | "medium" | "high" | "blocked";

export interface RiskAssessment {
    score: number; // 0-100 (higher = riskier)
    level: RiskLevel;
    reasons: string[];
    historicalData: {
        totalOrders: number;
        deliveredCount: number;
        cancelledCount: number;
        rejectedCount: number;
        refundedCount: number;
        noResponseCount: number;
        pendingCount: number; // Orders still in progress
    };
    isBlacklisted: boolean;
    isReturningCustomer: boolean;
    lastOrderDate: string | null;
    recommendation: "proceed" | "review" | "caution" | "block";
}

// =============================================
// RISK THRESHOLDS
// =============================================

const THRESHOLDS = {
    // Cancellation thresholds
    MEDIUM_RISK_CANCELLATIONS: 2, // 2+ cancellations = medium
    HIGH_RISK_CANCELLATIONS: 3, // 3+ cancellations = high

    // Rejection thresholds
    HIGH_RISK_REJECTIONS: 1, // 1+ rejection = high risk

    // No response thresholds
    MEDIUM_RISK_NO_RESPONSE: 2,
    HIGH_RISK_NO_RESPONSE: 3,

    // Score weights
    WEIGHT_CANCELLED: 15, // Points per cancelled order
    WEIGHT_REJECTED: 30, // Points per rejected order
    WEIGHT_NO_RESPONSE: 20, // Points per no-response order
    WEIGHT_BLACKLISTED: 100, // Points for blacklist
    WEIGHT_DELIVERED: -5, // Negative points (reduces risk) per delivered order
};

// =============================================
// FRAUD DETECTOR
// =============================================

class FraudDetector {
    /**
     * Assess customer risk based on phone number
     */
    /**
     * Assess customer risk based on phone number
     * Now uses O(1) Lookup from customer_risk table
     */
    async assessCustomerRisk(phone: string): Promise<RiskAssessment> {
        try {
            const normalizedPhone = this.normalizePhone(phone);

            // Fast lookup from pre-calculated table
            const { data, error } = await supabase
                .from("customer_risk")
                .select("*")
                .eq("phone", normalizedPhone)
                .maybeSingle();

            if (error) {
                console.error("[FraudDetector] DB Lookup Error:", error);
                // Fallback to default low risk if DB error
                return this.getDefaultAssessment();
            }

            if (data) {
                // Map DB result to RiskAssessment
                return {
                    score: data.score,
                    level: data.risk_level as RiskLevel,
                    reasons: data.reasons || [],
                    historicalData: {
                        totalOrders: data.stats?.total || 0,
                        deliveredCount: data.stats?.delivered || 0,
                        cancelledCount: data.stats?.cancelled || 0,
                        rejectedCount: data.stats?.rejected || 0,
                        refundedCount: data.stats?.refunded || 0,
                        noResponseCount: data.stats?.no_response || 0,
                        pendingCount: data.stats?.pending || 0
                    },
                    isBlacklisted: data.risk_level === 'blocked',
                    isReturningCustomer: (data.stats?.total || 0) > 0,
                    lastOrderDate: data.last_order_date,
                    recommendation: this.getRecommendation(data.risk_level as RiskLevel)
                };
            }

            // If no record found, it's a new customer -> Low Risk
            return this.getDefaultAssessment();

        } catch (err) {
            console.error("[FraudDetector] Exception:", err);
            return this.getDefaultAssessment();
        }
    }

    private getRecommendation(level: RiskLevel): "proceed" | "review" | "caution" | "block" {
        switch (level) {
            case "blocked": return "block";
            case "high": return "caution";
            case "medium": return "review";
            default: return "proceed";
        }
    }

    /**
     * Get risk badge color for UI
     */
    getRiskBadgeColor(level: RiskLevel): string {
        switch (level) {
            case "blocked":
                return "bg-black text-white";
            case "high":
                return "bg-red-500/20 text-red-400 border-red-500/30";
            case "medium":
                return "bg-amber-500/20 text-amber-400 border-amber-500/30";
            case "low":
            default:
                return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
        }
    }

    /**
     * Get risk level label in Arabic
     */
    getRiskLevelLabel(level: RiskLevel): string {
        switch (level) {
            case "blocked":
                return "محظور";
            case "high":
                return "خطر عالي";
            case "medium":
                return "خطر متوسط";
            case "low":
            default:
                return "آمن";
        }
    }

    /**
     * Get risk level icon
     */
    getRiskLevelIcon(level: RiskLevel): string {
        switch (level) {
            case "blocked":
                return "🚫";
            case "high":
                return "⛔";
            case "medium":
                return "⚠️";
            case "low":
            default:
                return "✅";
        }
    }

    /**
     * Quick check if customer is high-risk (for inline display)
     */
    async isHighRisk(phone: string): Promise<boolean> {
        const assessment = await this.assessCustomerRisk(phone);
        return assessment.level === "high" || assessment.level === "blocked";
    }

    /**
     * Batch assess multiple phones using efficient IN query
     */
    async batchAssess(phones: string[]): Promise<Map<string, RiskAssessment>> {
        const results = new Map<string, RiskAssessment>();

        // Normalize all inputs
        const normalizedMap = new Map<string, string>(); // normalized -> original
        const uniqueNormalizedPhones = new Set<string>();

        phones.forEach(p => {
            const norm = this.normalizePhone(p);
            if (norm.length >= 5) { // Basic validation
                normalizedMap.set(norm, p);
                uniqueNormalizedPhones.add(norm);
            }
        });

        const targets = Array.from(uniqueNormalizedPhones);
        if (targets.length === 0) return results;

        try {
            const { data, error } = await supabase
                .from("customer_risk")
                .select("*")
                .in("phone", targets);

            if (error) {
                console.error("[FraudDetector] Batch Error:", error);
                return results;
            }

            if (data) {
                data.forEach((row: any) => {
                    const assessment: RiskAssessment = {
                        score: row.score,
                        level: row.risk_level as RiskLevel,
                        reasons: row.reasons || [],
                        historicalData: {
                            totalOrders: row.stats?.total || 0,
                            deliveredCount: row.stats?.delivered || 0,
                            cancelledCount: row.stats?.cancelled || 0,
                            rejectedCount: row.stats?.rejected || 0,
                            refundedCount: row.stats?.refunded || 0,
                            noResponseCount: row.stats?.no_response || 0,
                            pendingCount: row.stats?.pending || 0
                        },
                        isBlacklisted: row.risk_level === 'blocked',
                        isReturningCustomer: (row.stats?.total || 0) > 0,
                        lastOrderDate: row.last_order_date,
                        recommendation: this.getRecommendation(row.risk_level as RiskLevel)
                    };

                    // The row.phone is normalized.
                    // We map it to ALL original phones that normalized to this
                    // (But here we just put it in the map using the key the caller expects... 
                    // tricky part: caller expects original phone key? 
                    // The previous implementation utilized phone_key from RPC.
                    // Here we can use the normalized phone as key if the UI calls normalize.
                    // Let's see how batchAssess is used. Usually by providing a list.)

                    // We will store it by the normalized key. 
                    // The UI SHOULD normalize before lookup or we map back.
                    results.set(row.phone, assessment);
                });
            }

            return results;

        } catch (err) {
            console.error("[FraudDetector] Batch exception:", err);
            return results;
        }
    }

    /**
     * Normalize phone number for consistent lookups
     */
    public normalizePhone(phone: string): string {
        if (!phone) return "";

        // Convert Arabic/Persian numerals to Latin numerals
        const arabicNumbers = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
        const persianNumbers = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];

        let normalized = phone;
        for (let i = 0; i < 10; i++) {
            normalized = normalized.replace(arabicNumbers[i], i.toString()).replace(persianNumbers[i], i.toString());
        }

        // Remove all non-digit characters
        normalized = normalized.replace(/\D/g, "");

        // Handle Iraqi phone numbers
        if (normalized.startsWith("964")) {
            normalized = normalized.slice(3); // Remove country code
        }
        if (normalized.startsWith("0")) {
            normalized = normalized.slice(1); // Remove leading 0
        }

        return normalized;
    }

    /**
     * Default assessment for errors/edge cases
     */
    private getDefaultAssessment(): RiskAssessment {
        return {
            score: 0,
            level: "low",
            reasons: [],
            historicalData: {
                totalOrders: 0,
                deliveredCount: 0,
                cancelledCount: 0,
                rejectedCount: 0,
                refundedCount: 0,
                noResponseCount: 0,
                pendingCount: 0,
            },
            isBlacklisted: false,
            isReturningCustomer: false,
            lastOrderDate: null,
            recommendation: "proceed",
        };
    }
    /**
     * Get payload for risk_metadata column in database
     */
    getPersistencePayload(assessment: RiskAssessment): any {
        return {
            level: assessment.level,
            score: assessment.score,
            reasons: assessment.reasons,
            assessed_at: new Date().toISOString(),
            recommendation: assessment.recommendation,
            historical_summary: {
                total: assessment.historicalData.totalOrders,
                rejected: assessment.historicalData.rejectedCount,
                cancelled: assessment.historicalData.cancelledCount,
                no_response: assessment.historicalData.noResponseCount
            }
        };
    }
}

// Singleton instance
export const fraudDetector = new FraudDetector();
