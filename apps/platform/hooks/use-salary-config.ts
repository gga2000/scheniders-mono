"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
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

export function useSalaryConfig() {
    const { tenantId } = useAuth();
    const [roleSalaryDefaults, setRoleSalaryDefaults] = useState<RoleSalaryDefault[]>([]);
    const [employeeSalaryConfigs, setEmployeeSalaryConfigs] = useState<EmployeeSalaryConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchAll = useCallback(async () => {
        await Promise.resolve();
        setIsLoading(true);
        const [roleRes, empRes] = await Promise.all([
            supabase.from("role_salary_defaults").select("*").order("role"),
            supabase.from("employee_salary_configs").select("*"),
        ]);
        if (roleRes.data) setRoleSalaryDefaults(roleRes.data);
        if (empRes.data) setEmployeeSalaryConfigs(empRes.data);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        // fetchAll() awaits Promise.resolve() before any setState.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchAll();
    }, [fetchAll]);

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
        ) => {
            const existing = employeeSalaryConfigs.find(c => c.employee_id === employeeId);

            // Log the change if values differ from existing
            if (!config.use_role_defaults) {
                const oldBase = existing?.use_role_defaults ? null : (existing?.base_monthly_salary ?? null);
                const oldOrder = existing?.use_role_defaults ? null : (existing?.per_order_bonus ?? null);
                const baseChanged = oldBase !== config.base_monthly_salary;
                const orderChanged = oldOrder !== config.per_order_bonus;
                if (baseChanged || orderChanged) {
                    await supabase.from("salary_config_history").insert({
                        employee_id: employeeId,
                        changed_by: changedBy ?? null,
                        old_base_salary: oldBase,
                        new_base_salary: config.base_monthly_salary,
                        old_per_order: oldOrder,
                        new_per_order: config.per_order_bonus,
                        tenant_id: tenantId,
                    });
                }
            }

            if (existing) {
                await supabase
                    .from("employee_salary_configs")
                    .update({ ...config, updated_at: new Date().toISOString() })
                    .eq("employee_id", employeeId);
            } else {
                await supabase
                    .from("employee_salary_configs")
                    .insert({ employee_id: employeeId, ...config, tenant_id: tenantId });
            }
            await fetchAll();
        },
        [employeeSalaryConfigs, fetchAll, tenantId]
    );

    const fetchConfigHistory = useCallback(async (employeeId: string): Promise<SalaryConfigHistoryRow[]> => {
        const { data } = await supabase
            .from("salary_config_history")
            .select("*")
            .eq("employee_id", employeeId)
            .order("created_at", { ascending: false })
            .limit(10);
        return (data ?? []) as SalaryConfigHistoryRow[];
    }, []);

    const upsertRoleDefault = useCallback(
        async (role: string, config: { base_monthly_salary: number; per_order_bonus: number }) => {
            await supabase
                .from("role_salary_defaults")
                .upsert(
                    { tenant_id: tenantId, role, ...config, updated_at: new Date().toISOString() },
                    { onConflict: "tenant_id,role" }
                );
            await fetchAll();
        },
        [fetchAll, tenantId]
    );

    return {
        roleSalaryDefaults,
        employeeSalaryConfigs,
        isLoading,
        getEffectiveRate,
        upsertEmployeeConfig,
        upsertRoleDefault,
        fetchConfigHistory,
        refresh: fetchAll,
    };
}
