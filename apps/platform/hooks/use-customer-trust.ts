"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { TrustScoreBreakdownItem, TrustAuditEvent } from "@/types/customer";
import type { Database } from "@scheniders/supabase/database.types";

type AuditRow = Database["public"]["Functions"]["get_customer_score_audit_log"]["Returns"][number];

export function useTrustScoreHistory(phone: string | undefined) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["customer-trust-history", tenantId, phone],
        queryFn: async () => {
            if (!phone) return [];
            const { data, error } = await supabase.rpc("get_customer_trust_history", {
                target_phone: phone,
                months: 12,
            });
            if (error) throw error;
            return (data || []) as { month: string; avg_score: number; event_count: number }[];
        },
        enabled: !!phone,
        staleTime: 5 * 60 * 1000,
    });
}

export function useTrustAuditLog(phone: string | undefined, limit = 20, offset = 0) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["customer-trust-audit", tenantId, phone, limit, offset],
        queryFn: async () => {
            if (!phone) return { events: [], totalCount: 0 };
            const { data, error } = await supabase.rpc("get_customer_score_audit_log", {
                target_phone: phone,
                log_limit: limit,
                log_offset: offset,
            });
            if (error) throw error;
            const raw = (data ?? []) as AuditRow[];
            const totalCount = raw.length > 0 ? Number(raw[0].total_count) : 0;
            const events: TrustAuditEvent[] = raw.map(r => ({
                id: r.id,
                event_date: r.event_date,
                event_type: r.event_type,
                reason: r.reason,
                score_change: r.score_change,
                score_before: r.score_before,
                score_after: r.score_after,
                source: r.source,
                order_id: r.order_id,
                edited_at: r.edited_at,
                edited_by: r.edited_by,
                edited_reason: r.edited_reason,
                original_reason: r.original_reason,
            }));
            return { events, totalCount };
        },
        enabled: !!phone,
        staleTime: 5 * 60 * 1000,
    });
}

export function useTrustScoreBreakdown(phone: string | undefined) {
    // customer_trust is keyed (tenant_id, phone): without the tenant filter a
    // phone known to two of the caller's tenants makes maybeSingle() fail.
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["customer-trust-breakdown", tenantId, phone],
        queryFn: async (): Promise<{ items: TrustScoreBreakdownItem[]; tier: string | null }> => {
            if (!phone || !tenantId) return { items: [], tier: null };
            const { data, error } = await supabase
                .from("customer_trust")
                .select("score_breakdown, trust_tier")
                .eq("tenant_id", tenantId)
                .eq("phone", phone)
                .maybeSingle();
            if (error) throw error;
            // The tier says whether the score is shown at all (not for new or blocked customers).
            return {
                items: (data?.score_breakdown || []) as TrustScoreBreakdownItem[],
                tier: data?.trust_tier ?? null,
            };
        },
        enabled: !!phone && !!tenantId,
        staleTime: 5 * 60 * 1000,
    });
}

export function useCustomerPercentile(phone: string | undefined) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["customer-percentile", tenantId, phone],
        queryFn: async () => {
            if (!phone) return { percentile: 0, city_name: '', total_in_group: 0 };
            const { data, error } = await supabase.rpc("get_customer_percentile", {
                target_phone: phone,
            });
            if (error) throw error;
            const row = (data || [])[0];
            return {
                percentile: Number(row?.percentile ?? 0),
                city_name: row?.city_name || '',
                total_in_group: Number(row?.total_in_group || 0),
            };
        },
        enabled: !!phone,
        staleTime: 10 * 60 * 1000,
    });
}
