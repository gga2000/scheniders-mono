"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { payrollKeys, type PayrollWriteResult } from "@/hooks/payroll-query-keys";
import type { RoleSalaryDefault, EmployeeSalaryConfig, EffectiveSalaryRate } from "@/types/salary";

export interface SalaryConfigHistoryRow {
    id: string;
    employee_id: string;
    changed_by: string | null;
    old_base_salary: number | null;
    new_base_salary: number | null;
    old_per_order: number | null;
    new_per_order: number | null;
    note: string | null;
    created_at: string;
}

interface SalaryConfigData {
    roleSalaryDefaults: RoleSalaryDefault[];
    employeeSalaryConfigs: EmployeeSalaryConfig[];
}

const EMPTY: SalaryConfigData = { roleSalaryDefaults: [], employeeSalaryConfigs: [] };

/** Pay rates for the current store: role defaults and per-member overrides. */
export function useSalaryConfig() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery<SalaryConfigData>({
        queryKey: payrollKeys.config(tenantId),
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return EMPTY;
            // RLS lets a member of several stores read all of them; pay rates are per store.
            const [roleRes, empRes] = await Promise.all([
                supabase.from("role_salary_defaults").select("*").eq("tenant_id", tenantId).order("role"),
                supabase.from("employee_salary_configs").select("*").eq("tenant_id", tenantId),
            ]);
            if (roleRes.error) throw roleRes.error;
            if (empRes.error) throw empRes.error;
            return { roleSalaryDefaults: roleRes.data ?? [], employeeSalaryConfigs: empRes.data ?? [] };
        },
    });

    const { roleSalaryDefaults, employeeSalaryConfigs } = query.data ?? EMPTY;

    const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: payrollKeys.all }), [queryClient]);

    /** Returns the effective salary rates for a given employee + role */
    const getEffectiveRate = useCallback(
        (employeeId: string, role: string): EffectiveSalaryRate => {
            const empConfig = employeeSalaryConfigs.find(c => c.employee_id === employeeId);
            if (empConfig && !empConfig.use_role_defaults) {
                return {
                    baseMonthlySalary: empConfig.base_monthly_salary,
                    perOrderBonus: empConfig.per_order_bonus,
                    source: "employee_config",
                };
            }
            const roleDefault = roleSalaryDefaults.find(r => r.role === role);
            if (roleDefault) {
                return {
                    baseMonthlySalary: roleDefault.base_monthly_salary,
                    perOrderBonus: roleDefault.per_order_bonus,
                    source: "role_default",
                };
            }
            return { baseMonthlySalary: 0, perOrderBonus: 0, source: "none" };
        },
        [employeeSalaryConfigs, roleSalaryDefaults]
    );

    const upsertEmployeeConfig = useCallback(
        async (
            employeeId: string,
            config: { base_monthly_salary: number; per_order_bonus: number; use_role_defaults: boolean },
            changedBy?: string
        ): Promise<PayrollWriteResult> => {
            if (!tenantId) return { error: "No store selected" };
            const existing = employeeSalaryConfigs.find(c => c.employee_id === employeeId);

            // Log the change if values differ from existing
            if (!config.use_role_defaults) {
                const oldBase = existing?.use_role_defaults ? null : (existing?.base_monthly_salary ?? null);
                const oldOrder = existing?.use_role_defaults ? null : (existing?.per_order_bonus ?? null);
                if (oldBase !== config.base_monthly_salary || oldOrder !== config.per_order_bonus) {
                    const { error } = await supabase.from("salary_config_history").insert({
                        employee_id: employeeId,
                        changed_by: changedBy ?? null,
                        old_base_salary: oldBase,
                        new_base_salary: config.base_monthly_salary,
                        old_per_order: oldOrder,
                        new_per_order: config.per_order_bonus,
                        tenant_id: tenantId,
                    });
                    if (error) return { error: error.message };
                }
            }

            const { error } = existing
                ? await supabase
                    .from("employee_salary_configs")
                    .update({ ...config, updated_at: new Date().toISOString() })
                    .eq("tenant_id", tenantId)
                    .eq("employee_id", employeeId)
                : await supabase
                    .from("employee_salary_configs")
                    .insert({ employee_id: employeeId, ...config, tenant_id: tenantId });
            if (error) return { error: error.message };
            await invalidate();
            return { error: null };
        },
        [employeeSalaryConfigs, invalidate, tenantId]
    );

    const fetchConfigHistory = useCallback(async (employeeId: string): Promise<SalaryConfigHistoryRow[]> => {
        if (!tenantId) return [];
        const { data, error } = await supabase
            .from("salary_config_history")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("employee_id", employeeId)
            .order("created_at", { ascending: false })
            .limit(10);
        if (error) throw error;
        return (data ?? []) as SalaryConfigHistoryRow[];
    }, [tenantId]);

    const upsertRoleDefault = useCallback(
        async (role: string, config: { base_monthly_salary: number; per_order_bonus: number }): Promise<PayrollWriteResult> => {
            if (!tenantId) return { error: "No store selected" };
            const { error } = await supabase
                .from("role_salary_defaults")
                .upsert(
                    { tenant_id: tenantId, role, ...config, updated_at: new Date().toISOString() },
                    { onConflict: "tenant_id,role" }
                );
            if (error) return { error: error.message };
            await invalidate();
            return { error: null };
        },
        [invalidate, tenantId]
    );

    return {
        roleSalaryDefaults,
        employeeSalaryConfigs,
        isLoading: query.isPending,
        failed: query.isError,
        getEffectiveRate,
        upsertEmployeeConfig,
        upsertRoleDefault,
        fetchConfigHistory,
        refresh: query.refetch,
    };
}
