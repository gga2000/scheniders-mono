"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fraudDetector, type RiskAssessment, type RiskLevel } from "@/lib/fraud-detector";

// =============================================
// HOOK: Use Risk Assessment for a single phone
// =============================================

export function useRiskAssessment(phone: string | undefined | null) {
    const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!phone) {
            setAssessment(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        fraudDetector
            .assessCustomerTrust(phone)
            .then((result) => {
                if (!cancelled) {
                    setAssessment(result);
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || "Failed to assess risk");
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [phone]);

    const refresh = useCallback(async () => {
        if (!phone) return;

        setLoading(true);
        try {
            const result = await fraudDetector.assessCustomerTrust(phone);
            setAssessment(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to assess risk");
        } finally {
            setLoading(false);
        }
    }, [phone]);

    return {
        assessment,
        loading,
        error,
        refresh,
        // Convenience helpers
        isHighRisk: assessment?.level === "high" || assessment?.level === "blocked",
        isMediumRisk: assessment?.level === "medium",
        isBlacklisted: assessment?.isBlacklisted || false,
        isReturningCustomer: assessment?.isReturningCustomer || false,
        riskLevel: assessment?.level || "low",
        riskScore: assessment?.score || 0,
        riskReasons: assessment?.reasons || [],
        riskAssessment: assessment,
    };
}

// =============================================
// HOOK: Batch Risk Assessment for multiple orders
// =============================================

interface OrderWithPhone {
    id: string;
    phone: string;
}

export function useBatchRiskAssessment(orders: OrderWithPhone[]) {
    const [assessments, setAssessments] = useState<Map<string, RiskAssessment>>(new Map());
    const [loading, setLoading] = useState(false);
    const [lastFetchedPhones, setLastFetchedPhones] = useState<string[]>([]);

    // Generate a primitive string key of unique phones to use as the dependency.
    // This prevents the effect from running again if the array reference changes but the phones don't.
    const phonesStrKey = useMemo(() => {
        const uniquePhones = [...new Set(orders.map(o => o.phone).filter(Boolean))];
        return uniquePhones.sort().join(',');
    }, [orders]);

    // Only fetch if the unique string of phones has changed
    useEffect(() => {
        if (!phonesStrKey) return;
        const phonesToFetch = phonesStrKey.split(',');

        let cancelled = false;

        const fetchTimer = setTimeout(() => {
            setLoading(true);


            fraudDetector
                .batchAssess(phonesToFetch)
                .then((results) => {
                    if (!cancelled) {

                        setAssessments(results);
                        setLastFetchedPhones(phonesToFetch);
                        setLoading(false);
                    }
                })
                .catch((err) => {
                    console.error("[useBatchRiskAssessment] Error:", err);
                    if (!cancelled) {
                        setLoading(false);
                    }
                });
        }, 500); // 500ms debounce prevents rapid RPC fire when orders change from realtime/mutations

        return () => {
            cancelled = true;
            clearTimeout(fetchTimer);
        };
    }, [phonesStrKey]); // Depend on primitive stable string instead of array reference

    // =============================================
    // CLIENT-SIDE PRE-FLIGHT (Instant Feedback)
    // =============================================

    // Calculate provisional risk based ONLY on loaded orders
    // This gives 0ms feedback while the RPC runs
    const localRiskMap = useMemo(() => {

        const map = new Map<string, RiskAssessment>();

        // Group orders by phone (normalized)
        const ordersByPhone = new Map<string, any[]>();

        orders.forEach(o => {
            if (!o.phone) return;
            const norm = fraudDetector.normalizePhone(o.phone);
            if (!ordersByPhone.has(norm)) ordersByPhone.set(norm, []);
            ordersByPhone.get(norm)?.push(o);
        });

        // Generate quick assessments
        ordersByPhone.forEach((customerOrders, phone) => {
            // Check for obvious red flags
            const rejected = customerOrders.filter(o => ['rejected', 'refund_delivered', 'refund_failed'].includes(o.status)).length;
            const cancelled = customerOrders.filter(o => o.status === 'cancelled').length;
            const delivered = customerOrders.filter(o => ['delivered', 'completed'].includes(o.status)).length;

            // If we see risk locally, flag it immediately
            if (rejected > 0 || cancelled >= 2) {
                // Construct a simplified assessment
                map.set(phone, {
                    score: rejected > 0 ? 20 : 40,
                    tier: rejected > 0 ? 'risky' : 'watch',
                    level: rejected > 0 ? 'high' : 'medium',
                    reasons: [
                        ...(rejected > 0 ? ['⚠️ Local: Found rejected order'] : []),
                        ...(cancelled >= 2 ? ['⚠️ Local: Found multiple cancellations'] : [])
                    ],
                    deliverySuccessRate: customerOrders.length > 0 ? (delivered / customerOrders.length) * 100 : 0,
                    historicalData: {
                        totalOrders: customerOrders.length,
                        deliveredCount: delivered,
                        cancelledCustomerCount: cancelled,
                        cancelledMerchantCount: 0,
                        rejectedCustomerFaultCount: rejected,
                        rejectedMerchantFaultCount: 0,
                        rejectedAmbiguousCount: 0,
                        noResponseCount: 0,
                        refundCount: 0,
                    },
                    communityAvgRating: 0,
                    communityRatingCount: 0,
                    isBlacklisted: false,
                    isReturningCustomer: customerOrders.length > 1,
                    lastOrderDate: null,
                    totalSpent: 0,
                    avgBasket: 0,
                    scoreBreakdown: [],
                    recommendation: rejected > 0 ? 'caution' : 'review'
                } as RiskAssessment);
            }
        });


        return map;
    }, [orders]);

    // Combined getter: Server > Local
    // If server data exists, use it (more accurate/complete)
    // If not, fall back to local (immediate)
    const getAssessment = useCallback((phone: string): RiskAssessment | undefined => {
        if (!phone) return undefined;
        // Normalize phone for lookup
        const normalized = fraudDetector.normalizePhone(phone);

        return assessments.get(normalized) || localRiskMap.get(normalized);
    }, [assessments, localRiskMap]);

    // Check if a phone is high risk
    const isHighRisk = useCallback((phone: string): boolean => {
        const assessment = getAssessment(phone);
        return assessment?.level === "high" || assessment?.level === "blocked";
    }, [getAssessment]);

    // Get counts of risk levels
    // We need to merge assessments and localRiskMap for accurate counts
    const riskCounts = useMemo(() => {
        const counts = { low: 0, medium: 0, high: 0, blocked: 0 };

        // Use a set of all known phones to avoid double counting
        const allPhones = new Set([...assessments.keys(), ...localRiskMap.keys()]);

        allPhones.forEach(phone => {
            // Assessment takes precedence over local
            const assessment = assessments.get(phone) || localRiskMap.get(phone);
            if (assessment?.level) {
                counts[assessment.level]++;
            }
        });

        return counts;
    }, [assessments, localRiskMap]);

    return {
        assessments,
        loading,
        getAssessment,
        // Helper to check if we are relying on local data (for UI indication if needed)
        isLocalData: (phone: string) => {
            const norm = phone ? fraudDetector.normalizePhone(phone) : "";
            return !assessments.has(norm) && localRiskMap.has(norm);
        },
        getRiskLevel: useCallback((phone: string) => getAssessment(phone)?.level || "low", [getAssessment]),
        isHighRisk,
        riskCounts,
    };
}

// =============================================
// COMPONENT HELPERS
// =============================================

export function getRiskBadgeStyles(level: RiskLevel) {
    return fraudDetector.getRiskBadgeColor(level);
}

export function getRiskLabel(level: RiskLevel) {
    return fraudDetector.getRiskLevelLabel(level);
}

export function getRiskIcon(level: RiskLevel) {
    return fraudDetector.getRiskLevelIcon(level);
}
