// =============================================
// SALARY MANAGEMENT TYPES
// =============================================

export interface RoleSalaryDefault {
    id: string;
    role: string;
    base_monthly_salary: number;
    per_order_bonus: number;
    created_at: string;
    updated_at: string;
}

export interface EmployeeSalaryConfig {
    id: string;
    employee_id: string;
    base_monthly_salary: number;
    per_order_bonus: number;
    use_role_defaults: boolean;
    created_at: string;
    updated_at: string;
}

export interface SalaryAdvance {
    id: string;
    employee_id: string;
    amount: number;
    reason?: string;
    created_by?: string;
    created_at: string;
    payroll_id?: string;
    is_deducted: boolean;
}

export interface SalaryPenalty {
    id: string;
    employee_id: string;
    amount: number;
    reason: string;
    created_by?: string;
    created_at: string;
    payroll_id?: string;
    is_applied: boolean;
}

export interface PerformanceBonus {
    id: string;
    employee_id: string;
    amount: number;
    reason?: string;
    created_by?: string;
    created_at: string;
    payroll_id?: string;
    is_applied: boolean;
}

export interface PayrollRecord {
    id: string;
    employee_id: string;
    period_start: string;
    period_end: string;
    base_salary: number;
    completed_orders_count: number;
    order_bonus: number;
    performance_bonuses_total: number;
    advances_deducted: number;
    penalties_deducted: number;
    absence_days: number;
    absence_deduction: number;
    gross_salary: number;
    net_salary: number;
    status: "pending" | "paid" | "voided";
    paid_at?: string;
    paid_by?: string;
    notes?: string;
    pdf_url?: string;
    payment_method?: "cash" | "zain_cash" | "qi_card";
    created_at: string;
}

/**
 * Breakdown of completed orders by quality bucket within a period.
 * Only `genuine` orders count toward the per-order bonus — replacements and
 * refunds/returns are excluded (they aren't net-new delivered revenue).
 */
export interface OrderBreakdown {
    /** All orders in `completed` status during the period (gross). */
    completedTotal: number;
    /** Net-new deliveries — drives the bonus. */
    genuine: number;
    /** Replacement orders (RPL-…) — excluded from bonus. */
    replacements: number;
    /** Refund / return orders — excluded from bonus. */
    refunds: number;
    /** genuine ÷ completedTotal (0 when no completed orders). */
    qualityScore: number;
}

/**
 * Counts of every order CREATED in the period, bucketed by fulfillment status.
 * Unlike `OrderBreakdown` (which only looks at delivered/`completed` orders), this
 * captures the whole pipeline so the payslip can show context: how many orders
 * came in, how many were cancelled, went unanswered, were rejected, etc.
 */
export interface OrderStatusBreakdown {
    /** All orders created in the period (any status). */
    total: number;
    /** status = completed (delivered + closed). */
    completed: number;
    /** status = in_transit (shipped, not yet closed). */
    inTransit: number;
    /** status = cancelled. */
    cancelled: number;
    /** status = rejected (refused at the door). */
    rejected: number;
    /** status = no_response (customer never answered). */
    noResponse: number;
    /** Active pipeline: new / contacted / confirmed / pending_checkout / suspended. */
    pending: number;
    /** Return/refund flow: return_pending / refund_delivered / refund_failed. */
    returns: number;
}

export type OrderBucket = "genuine" | "replacement" | "refund";

/** A single completed order, classified for the drill-down view. */
export interface CountedOrderDetail {
    id: string;
    orderId: string;
    customerName: string;
    status: string;
    bucket: OrderBucket;
    createdAt: string;
    amount: number;
}

/** A return/refund order dated inside an already-paid period (advisory flag). */
export interface ReturnedAfterPayment {
    id: string;
    orderId: string;
    customerName: string;
    createdAt: string;
    status: string;
}

/** Computed (not stored) — live calculation before payroll is run */
export interface PayrollCalculation {
    employeeId: string;
    periodStart: string;
    periodEnd: string;
    baseSalary: number;
    /** Payable (genuine) order count — drives the bonus. */
    completedOrdersCount: number;
    /** Full completed-order breakdown for display. */
    orderBreakdown: OrderBreakdown;
    /** Whole-pipeline status breakdown of orders created in the period. */
    orderStatusBreakdown: OrderStatusBreakdown;
    orderBonus: number;
    pendingBonuses: PerformanceBonus[];
    performanceBonusesTotal: number;
    pendingAdvances: SalaryAdvance[];
    advancesTotal: number;
    pendingPenalties: SalaryPenalty[];
    penaltiesTotal: number;
    absenceDays: number;
    absenceDeduction: number;
    grossSalary: number;
    netSalary: number;
}

/** Effective rate for an employee (resolved from config or role defaults) */
export interface EffectiveSalaryRate {
    baseMonthlySalary: number;
    perOrderBonus: number;
    source: "employee_config" | "role_default" | "none";
}

/** A paid payroll record that overlaps the current period — used for duplicate guard */
export interface OverlappingPayroll {
    id: string;
    period_start: string;
    period_end: string;
    net_salary: number;
    paid_at: string;
    /** true = fully covers the employee's current period (scenario A) */
    fullyCovered: boolean;
}

/** Employee payroll data for the salaries tab */
export interface EmployeePayrollData {
    employee: {
        id: string;
        displayName: string | null;
        email: string;
        role: string;
        avatarUrl: string | null;
        isActive: boolean;
    };
    effectiveRate: EffectiveSalaryRate;
    calculation: PayrollCalculation;
    lastPayrollDate: string | null;
    overlappingPayroll: OverlappingPayroll | null;
    /** Per-order detail for the drill-down modal. */
    orderDetails: CountedOrderDetail[];
    /** Returns/refunds dated inside an already-paid period (advisory). */
    returnedAfterPayment: ReturnedAfterPayment[];
}
