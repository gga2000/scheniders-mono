import { describe, it, expect } from "vitest";
import { exportReportStats } from "./export-report-stats";

type Row = Parameters<typeof exportReportStats>[0][number];
const row = (status: Row["status"], extra: Partial<Row> = {}): Row => ({
    status, is_return: false, price: 25_000, delivery_fee: 5_000, city: "بغداد",
    governorate_code: null, payment_status: "pending", ...extra,
} as Row);

describe("exportReportStats: export revenue is money earned", () => {
    it("counts only delivered and completed orders, not refused, cancelled, new, returns or tests", () => {
        const orders = [
            ...Array.from({ length: 6 }, () => row("delivered")),
            row("completed"),
            row("rejected"), row("cancelled"), row("new"),
            row("delivered", { is_return: true }),
            row("delivered", { is_test: true }),
        ];
        const s = exportReportStats(orders);
        expect(s.total).toBe(12);
        expect(s.realizedOrders).toBe(7);
        expect(s.totalRevenue).toBe(175_000);
        expect(s.avgOrderValue).toBe(25_000);
        expect(s.byCity[0].revenue).toBe(175_000);
        expect(s.byPayment.pending.revenue).toBe(175_000);
    });

    it("takes the delivery charge once, from delivery_fee, on earned orders only", () => {
        const s = exportReportStats([
            row("delivered", { delivery_cost: 4_000 } as Partial<Row>),
            row("rejected"),
        ]);
        expect(s.totalDeliveryFees).toBe(5_000);
    });
});
