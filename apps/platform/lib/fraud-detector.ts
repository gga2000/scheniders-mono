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
    async assessCustomerRisk(phone: string): Promise<RiskAssessment> {
        try {
            // Normalize phone for lookup
            const normalizedPhone = this.normalizePhone(phone);

            // Check blacklist first
            const { data: blacklistData } = await supabase
                .from("blacklist")
                .select("*")
                .eq("phone", normalizedPhone)
                .maybeSingle();

            const isBlacklisted = !!blacklistData;

            // Fetch all orders for this phone
            const { data: orders, error } = await supabase
                .from("orders")
                .select("id, status, created_at, order_id")
                .or(`phone.eq.${normalizedPhone},secondary_phone.eq.${normalizedPhone}`)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("[FraudDetector] Error fetching orders:", error);
                return this.getDefaultAssessment();
            }

            // Calculate metrics
            const historicalData = {
                totalOrders: orders?.length || 0,
                deliveredCount: 0,
                cancelledCount: 0,
                rejectedCount: 0,
                noResponseCount: 0,
                pendingCount: 0,
            };

            if (orders) {
                orders.forEach((order) => {
                    switch (order.status) {
                        case "delivered":
                        case "completed":
                            historicalData.deliveredCount++;
                            break;
                        case "cancelled":
                            historicalData.cancelledCount++;
                            break;
                        case "rejected":
                            historicalData.rejectedCount++;
                            break;
                        case "no_response":
                            historicalData.noResponseCount++;
                            break;
                        case "new":
                        case "contacted":
                        case "confirmed":
                        case "in_transit":
                            historicalData.pendingCount++;
                            break;
                    }
                });
            }

            // Calculate risk score
            let score = 0;
            const reasons: string[] = [];

            // Blacklist check
            if (isBlacklisted) {
                score = 100;
                reasons.push("📛 رقم محظور في القائمة السوداء");
            } else {
                // Cancellation score
                score += historicalData.cancelledCount * THRESHOLDS.WEIGHT_CANCELLED;
                if (historicalData.cancelledCount >= THRESHOLDS.MEDIUM_RISK_CANCELLATIONS) {
                    reasons.push(`⚠️ ${historicalData.cancelledCount} طلبات ملغية سابقة`);
                }

                // Rejection score
                score += historicalData.rejectedCount * THRESHOLDS.WEIGHT_REJECTED;
                if (historicalData.rejectedCount >= THRESHOLDS.HIGH_RISK_REJECTIONS) {
                    reasons.push(`🚫 ${historicalData.rejectedCount} طلبات مرفوضة عند التوصيل`);
                }

                // No response score
                score += historicalData.noResponseCount * THRESHOLDS.WEIGHT_NO_RESPONSE;
                if (historicalData.noResponseCount >= THRESHOLDS.MEDIUM_RISK_NO_RESPONSE) {
                    reasons.push(`📵 ${historicalData.noResponseCount} طلبات بدون رد`);
                }

                // Delivered orders reduce risk
                score += historicalData.deliveredCount * THRESHOLDS.WEIGHT_DELIVERED;
            }

            // Clamp score between 0 and 100
            score = Math.max(0, Math.min(100, score));

            // Determine risk level
            let level: RiskLevel = "low";
            if (isBlacklisted) {
                level = "blocked";
            } else if (score >= 50 || historicalData.rejectedCount >= THRESHOLDS.HIGH_RISK_REJECTIONS) {
                level = "high";
            } else if (
                score >= 25 ||
                historicalData.cancelledCount >= THRESHOLDS.MEDIUM_RISK_CANCELLATIONS ||
                historicalData.noResponseCount >= THRESHOLDS.MEDIUM_RISK_NO_RESPONSE
            ) {
                level = "medium";
            }

            // Add positive reasons
            if (historicalData.deliveredCount > 0 && reasons.length === 0) {
                reasons.push(`✅ ${historicalData.deliveredCount} طلبات ناجحة سابقة`);
            }

            // Determine recommendation
            let recommendation: RiskAssessment["recommendation"] = "proceed";
            if (level === "blocked") {
                recommendation = "block";
            } else if (level === "high") {
                recommendation = "caution";
            } else if (level === "medium") {
                recommendation = "review";
            }

            return {
                score,
                level,
                reasons,
                historicalData,
                isBlacklisted,
                isReturningCustomer: historicalData.totalOrders > 0,
                lastOrderDate: orders?.[0]?.created_at || null,
                recommendation,
            };
        } catch (err) {
            console.error("[FraudDetector] Exception:", err);
            return this.getDefaultAssessment();
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
     * Batch assess multiple phones (for order list display)
     */
    async batchAssess(phones: string[]): Promise<Map<string, RiskAssessment>> {
        const results = new Map<string, RiskAssessment>();

        // Deduplicate phones
        const uniquePhones = [...new Set(phones.map(p => this.normalizePhone(p)))];

        // Process in parallel (max 10 at a time to avoid rate limits)
        const batchSize = 10;
        for (let i = 0; i < uniquePhones.length; i += batchSize) {
            const batch = uniquePhones.slice(i, i + batchSize);
            const promises = batch.map(phone =>
                this.assessCustomerRisk(phone).then(result => ({ phone, result }))
            );

            const batchResults = await Promise.all(promises);
            batchResults.forEach(({ phone, result }) => {
                results.set(phone, result);
            });
        }

        return results;
    }

    /**
     * Normalize phone number for consistent lookups
     */
    private normalizePhone(phone: string): string {
        // Remove all non-digit characters
        let normalized = phone.replace(/\D/g, "");

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
                noResponseCount: 0,
                pendingCount: 0,
            },
            isBlacklisted: false,
            isReturningCustomer: false,
            lastOrderDate: null,
            recommendation: "proceed",
        };
    }
}

// Singleton instance
export const fraudDetector = new FraudDetector();
