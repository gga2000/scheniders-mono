import type { EmployeePayrollData, OrderBreakdown, PayrollRecord, SalaryAdvance, SalaryPenalty, PerformanceBonus } from "@/types/salary";

const START = "2026-10-01";
const END = "2026-10-31";

const breakdown = (genuine: number, replacements: number, refunds: number): OrderBreakdown => {
    const completedTotal = genuine + replacements + refunds;
    return { completedTotal, genuine, replacements, refunds, qualityScore: completedTotal ? genuine / completedTotal : 0 };
};

function employee(
    id: string, name: string | null, email: string, role: string,
    base: number, perOrder: number, b: OrderBreakdown,
    extras: { advances?: SalaryAdvance[]; penalties?: SalaryPenalty[]; bonuses?: PerformanceBonus[]; lastPaid?: string | null } = {},
): EmployeePayrollData {
    const advances = extras.advances ?? [];
    const penalties = extras.penalties ?? [];
    const bonuses = extras.bonuses ?? [];
    const orderBonus = b.genuine * perOrder;
    const advancesTotal = advances.reduce((s, a) => s + a.amount, 0);
    const penaltiesTotal = penalties.reduce((s, a) => s + a.amount, 0);
    const bonusTotal = bonuses.reduce((s, a) => s + a.amount, 0);
    const gross = base + orderBonus + bonusTotal;
    return {
        employee: { id, displayName: name, email, role, avatarUrl: null, isActive: true },
        effectiveRate: { baseMonthlySalary: base, perOrderBonus: perOrder, source: "role_default" },
        calculation: {
            employeeId: id, periodStart: START, periodEnd: END, baseSalary: base,
            completedOrdersCount: b.genuine, orderBreakdown: b,
            orderStatusBreakdown: { total: b.completedTotal + 40, completed: b.completedTotal, inTransit: 18, cancelled: 9, rejected: 5, noResponse: 6, pending: 2, returns: b.refunds },
            orderBonus, pendingBonuses: bonuses, performanceBonusesTotal: bonusTotal,
            pendingAdvances: advances, advancesTotal, pendingPenalties: penalties, penaltiesTotal,
            absenceDays: 0, absenceDeduction: 0, grossSalary: gross, netSalary: gross - advancesTotal - penaltiesTotal,
        },
        lastPayrollDate: extras.lastPaid ?? "2026-09-30",
        overlappingPayroll: null,
        orderDetails: [],
        returnedAfterPayment: [],
    };
}

export const payrollEmployees: EmployeePayrollData[] = [
    employee("u2", "محمد كريم", "moh@perfumes.com", "employee", 600000, 1000, breakdown(212, 6, 4), {
        advances: [{ id: "a1", employee_id: "u2", amount: 100000, reason: "سلفة", created_at: "2026-10-12T09:00:00Z", is_deducted: false }],
        bonuses: [{ id: "b1", employee_id: "u2", amount: 50000, reason: "Best month", created_at: "2026-10-28T09:00:00Z", is_applied: false }],
    }),
    employee("u3", "زينب حسين", "zainab@perfumes.com", "employee", 550000, 1000, breakdown(141, 3, 2), {
        penalties: [{ id: "p1", employee_id: "u3", amount: 25000, reason: "تأخير", created_at: "2026-10-20T09:00:00Z", is_applied: false }],
    }),
    employee("u4", "حسن (التغليف)", "hassan.packing@perfumes.com", "employee", 450000, 0, breakdown(0, 0, 0)),
];

export const payrollAdvances: SalaryAdvance[] = payrollEmployees.flatMap((e) => e.calculation.pendingAdvances);
export const payrollPenalties: SalaryPenalty[] = payrollEmployees.flatMap((e) => e.calculation.pendingPenalties);
export const payrollBonuses: PerformanceBonus[] = payrollEmployees.flatMap((e) => e.calculation.pendingBonuses);

export const payrollPeriod = { start: START, end: END };
export const payrollBreakdown = breakdown(353, 9, 6);

export const recentPayment: PayrollRecord = {
    id: "r1", employee_id: "u2", period_start: "2026-09-01", period_end: "2026-09-30", base_salary: 600000,
    completed_orders_count: 190, order_bonus: 190000, performance_bonuses_total: 0, advances_deducted: 0,
    penalties_deducted: 0, absence_days: 0, absence_deduction: 0, gross_salary: 790000, net_salary: 790000,
    status: "paid", paid_at: "2026-09-30T16:00:00Z", payment_method: "cash", created_at: "2026-09-30T16:00:00Z",
};

const paid = (id: string, employee_id: string, start: string, end: string, base: number, orders: number, net: number, status: PayrollRecord["status"] = "paid"): PayrollRecord => ({
    ...recentPayment, id, employee_id, period_start: start, period_end: end, base_salary: base,
    completed_orders_count: orders, order_bonus: orders * 1000, gross_salary: base + orders * 1000, net_salary: net,
    status, paid_at: `${end}T16:00:00Z`, created_at: `${end}T16:00:00Z`, pdf_url: undefined,
});

export const payrollHistory: PayrollRecord[] = [
    paid("h1", "u2", "2026-09-01", "2026-09-30", 600000, 190, 790000),
    paid("h2", "u3", "2026-09-01", "2026-09-30", 550000, 128, 653000),
    paid("h3", "u4", "2026-09-01", "2026-09-30", 450000, 0, 450000),
    paid("h4", "u2", "2026-08-01", "2026-08-31", 600000, 176, 726000),
    paid("h5", "u3", "2026-08-01", "2026-08-31", 550000, 119, 669000, "voided"),
    paid("h6", "u3", "2026-08-01", "2026-08-31", 550000, 119, 644000),
];
