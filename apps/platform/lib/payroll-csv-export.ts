import type { EmployeePayrollData } from "@/types/salary";
import type { PayrollRecord } from "@/types/salary";

function escape(v: string | number | null | undefined): string {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function row(...cells: (string | number | null | undefined)[]): string {
    return cells.map(escape).join(",");
}

/** Export current-period employee payroll data to CSV and trigger download */
export function exportCurrentPeriodCSV(data: EmployeePayrollData[], periodStart: string, periodEnd: string) {
    const headers = row(
        "Employee", "Role", "Period Start", "Period End",
        "Base Salary", "Order Bonus",
        "Completed Orders", "Payable Orders", "Replacements", "Refunds", "Quality %",
        "Performance Bonuses", "Absence Days", "Absence Deduction",
        "Advances", "Penalties", "Gross Salary", "Net Salary"
    );

    const rows = data.map(d => {
        const b = d.calculation.orderBreakdown;
        return row(
            d.employee.displayName || d.employee.email.split("@")[0],
            d.employee.role,
            d.calculation.periodStart,
            d.calculation.periodEnd,
            d.calculation.baseSalary,
            d.calculation.orderBonus,
            b.completedTotal,
            b.genuine,
            b.replacements,
            b.refunds,
            b.completedTotal > 0 ? Math.round(b.qualityScore * 100) : "",
            d.calculation.performanceBonusesTotal,
            d.calculation.absenceDays,
            d.calculation.absenceDeduction,
            d.calculation.advancesTotal,
            d.calculation.penaltiesTotal,
            d.calculation.grossSalary,
            d.calculation.netSalary,
        );
    });

    const csv = [headers, ...rows].join("\n");
    download(csv, `Payroll_${periodStart}_${periodEnd}.csv`);
}

/** Export payroll history records to CSV and trigger download */
export function exportHistoryCSV(
    records: PayrollRecord[],
    employeeNames: Map<string, string>
) {
    const headers = row(
        "Employee", "Period Start", "Period End", "Status",
        "Base Salary", "Order Bonus", "Orders Completed",
        "Performance Bonuses", "Absence Days", "Absence Deduction",
        "Advances Deducted", "Penalties Deducted", "Gross Salary", "Net Salary",
        "Payment Method", "Paid At", "Notes"
    );

    const rows = records.map(r => row(
        employeeNames.get(r.employee_id) ?? r.employee_id,
        r.period_start,
        r.period_end,
        r.status,
        r.base_salary,
        r.order_bonus,
        r.completed_orders_count,
        r.performance_bonuses_total,
        r.absence_days,
        r.absence_deduction,
        r.advances_deducted,
        r.penalties_deducted,
        r.gross_salary,
        r.net_salary,
        r.payment_method ?? "cash",
        r.paid_at ?? "",
        r.notes ?? "",
    ));

    const csv = [headers, ...rows].join("\n");
    download(csv, `Payroll_History_${new Date().toISOString().split("T")[0]}.csv`);
}

function download(csv: string, filename: string) {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
    } finally {
        URL.revokeObjectURL(url);
    }
}
