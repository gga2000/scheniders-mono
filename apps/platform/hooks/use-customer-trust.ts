"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { TrustScoreBreakdownItem, TrustAuditEvent } from "@/types/customer";

export function useTrustScoreHistory(phone: string | undefined) {
    return useQuery({
        queryKey: ["customer-trust-history", phone],
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
    return useQuery({
        queryKey: ["customer-trust-audit", phone, limit, offset],
        queryFn: async () => {
            if (!phone) return { events: [], totalCount: 0 };
            const { data, error } = await supabase.rpc("get_customer_score_audit_log", {
                target_phone: phone,
                log_limit: limit,
                log_offset: offset,
            });
            if (error) throw error;
            const raw = (data || []) as any[];
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
        queryFn: async () => {
            if (!phone || !tenantId) return [];
            const { data, error } = await supabase
                .from("customer_trust")
                .select("score_breakdown")
                .eq("tenant_id", tenantId)
                .eq("phone", phone)
                .maybeSingle();
            if (error) throw error;
            return (data?.score_breakdown || []) as TrustScoreBreakdownItem[];
        },
        enabled: !!phone && !!tenantId,
        staleTime: 5 * 60 * 1000,
    });
}

export function useCustomerPercentile(phone: string | undefined) {
    return useQuery({
        queryKey: ["customer-percentile", phone],
        queryFn: async () => {
            if (!phone) return { percentile: 50, city_name: '', total_in_group: 0 };
            const { data, error } = await supabase.rpc("get_customer_percentile", {
                target_phone: phone,
            });
            if (error) throw error;
            const row = (data || [])[0];
            return {
                percentile: Number(row?.percentile || 50),
                city_name: row?.city_name || '',
                total_in_group: Number(row?.total_in_group || 0),
            };
        },
        enabled: !!phone,
        staleTime: 10 * 60 * 1000,
    });
}

export function useUpdateRejectionReason() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orderId, newReason, editedBy, justification }: {
            orderId: string;
            newReason: string;
            editedBy: string;
            justification: string;
        }) => {
            // Get current order
            const { data: order, error: fetchErr } = await supabase
                .from("orders")
                .select("rejection_reason, phone")
                .eq("id", orderId)
                .single();
            if (fetchErr) throw fetchErr;

            const originalReason = order.rejection_reason;

            // Update rejection reason
            const { error: updateErr } = await supabase
                .from("orders")
                .update({ rejection_reason: newReason })
                .eq("id", orderId);
            if (updateErr) throw updateErr;

            // Insert audit log entry
            const { error: auditErr } = await supabase
                .from("customer_trust_audit_log")
                .insert({
                    phone: order.phone,
                    event_type: 'rejection_edit',
                    reason: newReason,
                    source: 'admin',
                    order_id: orderId,
                    edited_by: editedBy,
                    edited_reason: justification,
                    original_reason: originalReason,
                    edited_at: new Date().toISOString(),
                });
            if (auditErr) throw auditErr;

            return { phone: order.phone };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["customer-trust-audit", data.phone] });
            queryClient.invalidateQueries({ queryKey: ["customer-trust-breakdown", data.phone] });
            queryClient.invalidateQueries({ queryKey: ["customers"] });
        },
    });
}
