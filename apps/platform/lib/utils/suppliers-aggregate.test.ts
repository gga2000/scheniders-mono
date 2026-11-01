import { describe, it, expect } from "vitest";
import type { Product } from "@/lib/supabase";
import { aggregateSuppliers } from "./suppliers-aggregate";

const supply = (id: string, suppliers: unknown[]) => ({ id, name: id, suppliers }) as unknown as Product;

const po = (over: Partial<Parameters<typeof aggregateSuppliers>[0]["pos"][number]>) => ({
    id: "po",
    po_number: "PO-2026-001",
    status: "sent",
    expected_date: null,
    received_at: null,
    total_cost: 1000,
    created_at: "2026-03-01T00:00:00Z",
    supplier_name: "Acme",
    ...over,
});

describe("aggregateSuppliers", () => {
    it("groups a supplier case-insensitively and averages lead time over primary links", () => {
        const result = aggregateSuppliers({
            supplies: [
                supply("a", [{ supplier_name: "Acme", lead_time_days: 4, is_primary: true }]),
                supply("b", [{ supplier_name: "ACME ", lead_time_days: 8, is_primary: true }]),
                supply("c", [{ supplier_name: "acme", lead_time_days: 30, is_primary: false }]),
            ],
            pos: [],
        });
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Acme");
        expect(result[0].supplies).toHaveLength(3);
        expect(result[0].avgLeadTimeDays).toBe(6);
    });

    it("counts draft, sent, confirmed and partial POs as open", () => {
        const [acme] = aggregateSuppliers({
            supplies: [],
            pos: ["draft", "sent", "confirmed", "partial", "received", "cancelled"].map((status, i) =>
                po({ id: `po${i}`, status })
            ),
        });
        expect(acme.openPoCount).toBe(4);
    });

    it("counts this year's spend on ordered POs only: not drafts, not cancelled", () => {
        const [acme] = aggregateSuppliers({
            supplies: [],
            currentYear: 2026,
            pos: [
                po({ id: "1", status: "received", total_cost: 5000 }),
                po({ id: "2", status: "sent", total_cost: 2000 }),
                po({ id: "3", status: "draft", total_cost: 9000 }),
                po({ id: "4", status: "cancelled", total_cost: 7000 }),
                po({ id: "5", status: "received", total_cost: 4000, created_at: "2025-12-31T00:00:00Z" }),
            ],
        });
        expect(acme.ytdSpend).toBe(7000);
    });
});
