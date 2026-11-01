/**
 * TanStack Query keys for payroll. Every key starts with "payroll", so a write
 * to pay config, advances, penalties or bonuses invalidates `payrollKeys.all`
 * and the period calculation on /salaries refetches with it.
 */
export const payrollKeys = {
    all: ["payroll"] as const,
    config: (tenantId: string | null) => ["payroll", "config", tenantId] as const,
    deductions: (tenantId: string | null) => ["payroll", "deductions", tenantId] as const,
    period: (tenantId: string | null, start: string, end: string, mode: string) =>
        ["payroll", "period", tenantId, start, end, mode] as const,
};

/** Result of a payroll write: the database error message, or null when it saved. */
export interface PayrollWriteResult {
    error: string | null;
}
