import { describe, expect, it } from "vitest";
import { buildPayslipHTML, type PayslipData } from "./payslip-html";

const data: PayslipData = {
    record: {
        id: "<script>x</script>", employee_id: "5f0c6f5e-8c1a-4a57-9d8e-0d6a3f1b2c3d", period_start: "2026-10-01", period_end: "2026-10-31",
        base_salary: 600000, completed_orders_count: 0, order_bonus: 0, performance_bonuses_total: 0,
        advances_deducted: 0, penalties_deducted: 0, absence_days: 0, absence_deduction: 0,
        gross_salary: 600000, net_salary: 600000, status: "pending", created_at: "2026-10-31T00:00:00Z",
    },
    employeeName: "Noor",
    employeeEmail: "n@example.com",
    employeeRole: "employee",
    perOrderBonus: 0,
};

describe("buildPayslipHTML", () => {
    it("escapes the reference printed from the record id", () => {
        const html = buildPayslipHTML(data);
        expect(html).not.toContain("<SCRIPT>");
        expect(html).toContain("&lt;SCRIPT&gt;");
    });
});
