import { describe, expect, it } from "vitest";
import { payslipRequestSchema } from "./payslip-schema";

const valid = {
    record: {
        id: "preview", employee_id: "5f0c6f5e-8c1a-4a57-9d8e-0d6a3f1b2c3d", period_start: "2026-10-01", period_end: "2026-10-31",
        base_salary: 600000, completed_orders_count: 212, order_bonus: 212000, performance_bonuses_total: 0,
        advances_deducted: 0, penalties_deducted: 0, absence_days: 0, absence_deduction: 0,
        gross_salary: 812000, net_salary: 812000, status: "pending", created_at: "2026-10-31T00:00:00Z",
    },
    employeeName: "محمد كريم",
    employeeEmail: "moh@perfumes.com",
    employeeRole: "employee",
    perOrderBonus: 1000,
};

describe("payslipRequestSchema", () => {
    it("accepts a real payslip", () => {
        expect(payslipRequestSchema.safeParse(valid).success).toBe(true);
    });
    it("needs the employee id, which the role check uses", () => {
        const { employee_id: _omit, ...record } = valid.record;
        expect(payslipRequestSchema.safeParse({ ...valid, record }).success).toBe(false);
    });
    it("rejects text where money goes (it is printed into the HTML)", () => {
        expect(payslipRequestSchema.safeParse({ ...valid, record: { ...valid.record, net_salary: "<img src=x>" } }).success).toBe(false);
    });
});
