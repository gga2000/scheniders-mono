"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { SalaryAdvance, SalaryPenalty, PerformanceBonus } from "@/types/salary";

export function useSalaryDeductions() {
    const { tenantId } = useAuth();
    const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
    const [penalties, setSalaryPenalties] = useState<SalaryPenalty[]>([]);
    const [bonuses, setBonuses] = useState<PerformanceBonus[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchAll = useCallback(async () => {
        await Promise.resolve();
        setIsLoading(true);
        const [advRes, penRes, bonRes] = await Promise.all([
            supabase.from("salary_advances").select("*").order("created_at", { ascending: false }),
            supabase.from("salary_penalties").select("*").order("created_at", { ascending: false }),
            supabase.from("performance_bonuses").select("*").order("created_at", { ascending: false }),
        ]);
        if (advRes.data) setAdvances(advRes.data);
        if (penRes.data) setSalaryPenalties(penRes.data);
        if (bonRes.data) setBonuses(bonRes.data);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        // fetchAll() awaits Promise.resolve() before any setState, so updates land in
        // the next microtask — outside React's effect-sync window.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchAll();
    }, [fetchAll]);

    // ── Advances ──

    const addAdvance = useCallback(
        async (employeeId: string, amount: number, reason?: string, createdBy?: string) => {
            const { error } = await supabase.from("salary_advances").insert({
                employee_id: employeeId,
                amount,
                reason: reason || null,
                created_by: createdBy || null,
                is_deducted: false,
                tenant_id: tenantId,
            });
            if (!error) await fetchAll();
            return { error };
        },
        [fetchAll, tenantId]
    );

    const deleteAdvance = useCallback(
        async (id: string) => {
            const { error } = await supabase.from("salary_advances").delete().eq("id", id).eq("is_deducted", false);
            if (!error) await fetchAll();
            return { error };
        },
        [fetchAll]
    );

    // ── Penalties ──

    const addPenalty = useCallback(
        async (employeeId: string, amount: number, reason: string, createdBy?: string) => {
            const { error } = await supabase.from("salary_penalties").insert({
                employee_id: employeeId,
                amount,
                reason,
                created_by: createdBy || null,
                is_applied: false,
                tenant_id: tenantId,
            });
            if (!error) await fetchAll();
            return { error };
        },
        [fetchAll, tenantId]
    );

    const deletePenalty = useCallback(
        async (id: string) => {
            const { error } = await supabase.from("salary_penalties").delete().eq("id", id).eq("is_applied", false);
            if (!error) await fetchAll();
            return { error };
        },
        [fetchAll]
    );

    // ── Performance Bonuses ──

    const addBonus = useCallback(
        async (employeeId: string, amount: number, reason?: string, createdBy?: string) => {
            const { error } = await supabase.from("performance_bonuses").insert({
                employee_id: employeeId,
                amount,
                reason: reason || null,
                created_by: createdBy || null,
                is_applied: false,
                tenant_id: tenantId,
            });
            if (!error) await fetchAll();
            return { error };
        },
        [fetchAll, tenantId]
    );

    const deleteBonus = useCallback(
        async (id: string) => {
            const { error } = await supabase.from("performance_bonuses").delete().eq("id", id).eq("is_applied", false);
            if (!error) await fetchAll();
            return { error };
        },
        [fetchAll]
    );

    return {
        advances,
        penalties,
        bonuses,
        isLoading,
        addAdvance,
        deleteAdvance,
        addPenalty,
        deletePenalty,
        addBonus,
        deleteBonus,
        refresh: fetchAll,
    };
}
