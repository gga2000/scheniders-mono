import { z } from "zod";
import type { PayslipData } from "@/lib/payslip-html";

const money = z.number().finite();
const count = z.number().finite().min(0);

const orderBreakdownSchema = z.object({
    completedTotal: count,
    genuine: count,
    replacements: count,
    refunds: count,
    qualityScore: z.number().min(0).max(1),
});

const orderStatusBreakdownSchema = z.object({
    total: count,
    completed: count,
    inTransit: count,
    cancelled: count,
    rejected: count,
    noResponse: count,
    pending: count,
    returns: count,
});

const recordSchema = z.object({
    id: z.string().min(1),
    employee_id: z.string().uuid(),
    period_start: z.string(),
    period_end: z.string(),
    base_salary: money,
    completed_orders_count: count,
    order_bonus: money,
    performance_bonuses_total: money,
    advances_deducted: money,
    penalties_deducted: money,
    absence_days: count,
    absence_deduction: money,
    gross_salary: money,
    carried_in: money.optional(),
    net_salary: money,
    amount_paid: money.nullable().optional(),
    status: z.enum(["pending", "paid", "voided"]),
    paid_at: z.string().optional(),
    paid_by: z.string().optional(),
    notes: z.string().max(2000).optional(),
    pdf_url: z.string().optional(),
    payment_method: z.enum(["cash", "zain_cash", "qi_card"]).optional(),
    created_at: z.string(),
});

/** Body of POST /api/payslip-pdf. Everything printed on the payslip, typed and bounded. */
export const payslipRequestSchema = z.object({
    record: recordSchema,
    employeeName: z.string().min(1).max(200),
    employeeEmail: z.string().max(320),
    employeeRole: z.string().max(50),
    employeeAvatarUrl: z.string().nullable().optional(),
    perOrderBonus: money,
    companyName: z.string().max(200).optional(),
    orderBreakdown: orderBreakdownSchema.optional(),
    orderStatusBreakdown: orderStatusBreakdownSchema.optional(),
}) satisfies z.ZodType<PayslipData>;
