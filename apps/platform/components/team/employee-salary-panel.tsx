"use client";

import { useState } from "react";
import { useSalaryConfig } from "@/hooks/use-salary-config";
import { useSalaryDeductions } from "@/hooks/use-salary-deductions";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { SalaryConfigForm } from "@/components/salary/salary-config-form";
import { EmployeeSalarySummary, type PendingPayItem } from "./employee-salary-summary";

/** The drawer's Salary tab: reads pay config and pending items (RLS-scoped) and opens the editor. */
export function EmployeeSalaryPanel({ employeeId, employeeName, role }: { employeeId: string; employeeName: string; role: string }) {
    const { t } = useLanguage();
    const [editing, setEditing] = useState(false);
    const { getEffectiveRate, upsertEmployeeConfig, fetchConfigHistory } = useSalaryConfig();
    const { advances, penalties, bonuses } = useSalaryDeductions();
    const rate = getEffectiveRate(employeeId, role);
    const pending: PendingPayItem[] = [
        ...advances.filter((a) => a.employee_id === employeeId && !a.is_deducted).map((a) => ({ id: a.id, kind: "advance" as const, amount: a.amount, reason: a.reason ?? null })),
        ...penalties.filter((p) => p.employee_id === employeeId && !p.is_applied).map((p) => ({ id: p.id, kind: "penalty" as const, amount: p.amount, reason: p.reason })),
        ...bonuses.filter((b) => b.employee_id === employeeId && !b.is_applied).map((b) => ({ id: b.id, kind: "bonus" as const, amount: b.amount, reason: b.reason ?? null })),
    ];
    return (
        <>
            <EmployeeSalarySummary rate={rate} pending={pending} onEdit={() => setEditing(true)} />
            <SalaryConfigForm
                isOpen={editing}
                onClose={() => setEditing(false)}
                employeeName={employeeName}
                employeeId={employeeId}
                currentRate={rate}
                onSubmit={async (config) => {
                    const { error } = await upsertEmployeeConfig(employeeId, config);
                    if (error) toast({ title: t("payroll.toast.saveFailed"), description: error, variant: "error" });
                }}
                loadHistory={fetchConfigHistory}
            />
        </>
    );
}
