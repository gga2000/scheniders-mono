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
            .assessCustomerRisk(phone)
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
            const result = await fraudDetector.assessCustomerRisk(phone);
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

    // Extract unique phones
    const phones = useMemo(() => {
        return [...new Set(orders.map(o => o.phone).filter(Boolean))];
    }, [orders]);

    // Only fetch if phones have changed
    useEffect(() => {
        const phonesChanged =
            phones.length !== lastFetchedPhones.length ||
            phones.some((p, i) => p !== lastFetchedPhones[i]);

        if (!phonesChanged || phones.length === 0) return;

        let cancelled = false;
        setLoading(true);

        fraudDetector
            .batchAssess(phones)
            .then((results) => {
                if (!cancelled) {
                    setAssessments(results);
                    setLastFetchedPhones(phones);
                    setLoading(false);
                }
            })
            .catch((err) => {
                console.error("[useBatchRiskAssessment] Error:", err);
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [phones, lastFetchedPhones]);

    // Get assessment for a specific phone
    const getAssessment = useCallback((phone: string): RiskAssessment | undefined => {
        // Normalize phone for lookup
        const normalized = phone.replace(/\D/g, "").replace(/^964/, "").replace(/^0/, "");
        return assessments.get(normalized);
    }, [assessments]);

    // Get risk level for a specific phone
    const getRiskLevel = useCallback((phone: string): RiskLevel => {
        return getAssessment(phone)?.level || "low";
    }, [getAssessment]);

    // Check if a phone is high risk
    const isHighRisk = useCallback((phone: string): boolean => {
        const level = getRiskLevel(phone);
        return level === "high" || level === "blocked";
    }, [getRiskLevel]);

    // Get counts of risk levels
    const riskCounts = useMemo(() => {
        const counts = { low: 0, medium: 0, high: 0, blocked: 0 };
        assessments.forEach((a) => {
            counts[a.level]++;
        });
        return counts;
    }, [assessments]);

    return {
        assessments,
        loading,
        getAssessment,
        getRiskLevel,
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
