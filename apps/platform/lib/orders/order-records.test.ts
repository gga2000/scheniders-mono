import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order } from "@/lib/supabase";
import { queriesOn, resetRecording, respond } from "@/lib/__fixtures__/recording-supabase";

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { addOrderNote, createBatch } from "./order-records";

const TENANT = "22222222-2222-4222-8222-222222222222";

const order = (id: string, price: number, city: string | null) =>
    ({ id, price, city } as unknown as Order);

beforeEach(() => {
    resetRecording();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("order records", () => {
    it("stamps the active tenant on a new note", async () => {
        respond(() => ({ data: { id: "n1" }, error: null }));

        const result = await addOrderNote(TENANT, "o1", "called, no answer");

        expect(result).toEqual({ success: true, data: { id: "n1" } });
        const [insert] = queriesOn("order_notes");
        expect(insert.ops[0]).toEqual({
            op: "insert",
            args: [[{ order_id: "o1", note: "called, no answer", tenant_id: TENANT }]],
        });
    });

    it("reports a refused note instead of claiming it saved", async () => {
        respond(() => ({ data: null, error: new Error("new row violates row-level security policy") }));

        const result = await addOrderNote(TENANT, "o1", "x");

        expect(result).toEqual({ success: false, error: "new row violates row-level security policy" });
    });

    it("builds a print batch from the picked orders only, with each city once", async () => {
        respond(() => ({ data: { id: "b1" }, error: null }));
        const orders = [
            order("o1", 25000, "بغداد"),
            order("o2", 30000, "بغداد"),
            order("o3", 99000, "البصرة"),
            order("o4", 15000, null),
        ];

        const result = await createBatch(TENANT, orders, "Batch 1", ["o1", "o2", "o4"], "prime", "label");

        expect(result).toEqual({ success: true, batch: { id: "b1" } });
        const [insert] = queriesOn("print_batches");
        expect(insert.ops[0]).toEqual({
            op: "insert",
            args: [{
                name: "Batch 1",
                order_count: 3,
                total_value: 70000,
                cities: ["بغداد"],
                order_ids: ["o1", "o2", "o4"],
                invoice_template: "prime",
                print_type: "label",
                tenant_id: TENANT,
            }],
        });
    });
});
