"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { payrollKeys, type PayrollWriteResult } from "@/hooks/payroll-query-keys";
import type { SalaryAdvance, SalaryPenalty, PerformanceBonus } from "@/types/salary";

interface DeductionsData {
    advances: SalaryAdvance[];
    penalties: SalaryPenalty[];
    bonuses: PerformanceBonus[];
}

const EMPTY: DeductionsData = { advances: [], penalties: [], bonuses: [] };

type AdjustmentTable = "salary_advances" | "salary_penalties" | "performance_bonuses";

/** Advances, penalties and bonuses for the current store, with add/delete writes. */
export function useSalaryDeductions() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery<DeductionsData>({
        queryKey: payrollKeys.deductions(tenantId),
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return EMPTY;
            const [advRes, penRes, bonRes] = await Promise.all([
                supabase.from("salary_advances").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
                supabase.from("salary_penalties").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
                supabase.from("performance_bonuses").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
            ]);
            if (advRes.error) throw advRes.error;
            if (penRes.error) throw penRes.error;
            if (bonRes.error) throw bonRes.error;
            return { advances: advRes.data ?? [], penalties: penRes.data ?? [], bonuses: bonRes.data ?? [] };
        },
    });

    const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: payrollKeys.all }), [queryClient]);

    const settle = useCallback(
        async (error: { message: string } | null): Promise<PayrollWriteResult> => {
            if (error) return { error: error.message };
            await invalidate();
            return { error: null };
        },
        [invalidate]
    );

    // ── Advances ──

    const addAdvance = useCallback(
        async (employeeId: string, amount: number, reason?: string, createdBy?: string) => {
            if (!tenantId) return { error: "No store selected" };
            const { error } = await supabase.from("salary_advances").insert({
                employee_id: employeeId,
                amount,
                reason: reason || null,
                created_by: createdBy || null,
                is_deducted: false,
                tenant_id: tenantId,
            });
            return settle(error);
        },
        [settle, tenantId]
    );

    // ── Penalties ──

    const addPenalty = useCallback(
        async (employeeId: string, amount: number, reason: string, createdBy?: string) => {
            if (!tenantId) return { error: "No store selected" };
            const { error } = await supabase.from("salary_penalties").insert({
                employee_id: employeeId,
                amount,
                reason,
                created_by: createdBy || null,
                is_applied: false,
                tenant_id: tenantId,
            });
            return settle(error);
        },
        [settle, tenantId]
    );

    // ── Performance Bonuses ──

    const addBonus = useCallback(
        async (employeeId: string, amount: number, reason?: string, createdBy?: string) => {
            if (!tenantId) return { error: "No store selected" };
            const { error } = await supabase.from("performance_bonuses").insert({
                employee_id: employeeId,
                amount,
                reason: reason || null,
                created_by: createdBy || null,
                is_applied: false,
                tenant_id: tenantId,
            });
            return settle(error);
        },
        [settle, tenantId]
    );

    /** Deletes a still-pending item; one already taken into a payroll is left alone. */
    const deletePending = useCallback(
        async (table: AdjustmentTable, id: string) => {
            const lockColumn = table === "salary_advances" ? "is_deducted" : "is_applied";
            const { error } = await supabase.from(table).delete().eq("id", id).eq(lockColumn, false);
            return settle(error);
        },
        [settle]
    );

    const deleteAdvance = useCallback((id: string) => deletePending("salary_advances", id), [deletePending]);
    const deletePenalty = useCallback((id: string) => deletePending("salary_penalties", id), [deletePending]);
    const deleteBonus = useCallback((id: string) => deletePending("performance_bonuses", id), [deletePending]);

    const { advances, penalties, bonuses } = query.data ?? EMPTY;

    return {
        advances,
        penalties,
        bonuses,
        isLoading: query.isPending,
        failed: query.isError,
        addAdvance,
        deleteAdvance,
        addPenalty,
        deletePenalty,
        addBonus,
        deleteBonus,
        refresh: query.refetch,
    };
}
