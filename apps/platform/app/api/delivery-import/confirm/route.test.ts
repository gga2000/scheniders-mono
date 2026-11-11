import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    recordingSupabase,
    respond,
    resetRecording,
    queriesOn,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * NEW-P1-13: after the confirm route was tenant-hardened it still inserted
 * every delivery_import_items audit row without tenant_id (1,201 of 2,648 live
 * rows, all 342 October rows). The table is tenant-scoped by RLS, so the
 * merchant could not see their own import audit. Confirmed, failed and skipped
 * rows must all carry the caller's tenant.
 */

const TENANT = "99999999-9999-4999-8999-999999999999";
const ORDER_1 = "11111111-1111-4111-8111-111111111111";
const ORDER_2 = "22222222-2222-4222-8222-222222222222";
const ORDER_GONE = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({ importError: null as null | { code: string; message: string } }));

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async () => ({ ok: true, userId: "user-1", tenantId: TENANT, role: "admin", platformAdmin: false }),
}));

import { POST } from "./route";

const row = (rowNumber: number) => ({
    rowNumber,
    shipmentNumber: `S${rowNumber}`,
    phone: "07700000000",
    shipmentAmount: 25000,
    deliveryFee: 5000,
    netToMerchant: 20000,
    status: "delivered",
    itemCount: 1,
    notes: "",
});

beforeEach(() => {
    resetRecording();
    state.importError = null;
    respond((q) => {
        if (q.target === "delivery_imports" && q.ops.some((o) => o.op === "insert")) {
            return state.importError ? { data: null, error: state.importError } : { data: { id: "import-1" }, error: null };
        }
        if (q.target === "orders" && q.ops.some((o) => o.op === "update")) {
            // Second order update fails, so a "failed" audit row is written too.
            const failing = q.ops.some((o) => o.op === "eq" && o.args[0] === "id" && o.args[1] === ORDER_2);
            return failing ? { data: null, error: { message: "boom" } } : { data: [{ id: ORDER_1 }], error: null };
        }
        if (q.target === "orders") {
            // The server's own read of the orders: what the browser claims is ignored.
            return {
                data: [ORDER_1, ORDER_2].map((id) => ({
                    id, status: "in_transit", price: 30000, delivered_at: null,
                    needs_attention: false, attention_reasons: null, delivery_note: null,
                })),
                error: null,
            };
        }
        return { data: null, error: null };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/delivery-import/confirm", () => {
    it("stamps the caller's tenant on every audit item (confirmed, failed, skipped)", async () => {
        const res = await POST(
            new NextRequest("https://app.example.com/api/delivery-import/confirm", {
                method: "POST",
                headers: { authorization: "Bearer t" },
                body: JSON.stringify({
                    filename: "receipt.pdf",
                    parsedPDF: {
                        header: { receiptNumber: "R1", paymentDate: "2026-10-19", receivingAgent: "A" },
                        rows: [row(1), row(2), row(3)],
                        footerTotal: 75000,
                    },
                    confirmedItems: [
                        { pdfRowNumber: 1, orderId: ORDER_1, matchCategory: "clean", matchDetails: "", previousStatus: "in_transit" },
                        { pdfRowNumber: 2, orderId: ORDER_2, matchCategory: "clean", matchDetails: "", previousStatus: "in_transit" },
                    ],
                    skippedItems: [{ pdfRowNumber: 3, orderId: null, matchCategory: "not_found", matchDetails: "no match" }],
                }),
            }),
        );

        expect(res.status).toBe(200);
        const items = queriesOn("delivery_import_items")
            .flatMap((q) => q.ops.filter((o) => o.op === "insert").map((o) => o.args[0]))
            .flat() as Record<string, unknown>[];
        expect(items.map((i) => i.action).sort()).toEqual(["confirmed", "failed", "skipped"]);
        for (const item of items) expect(item.tenant_id).toBe(TENANT);
    });

    const post = (confirmedItems: unknown[]) =>
        POST(
            new NextRequest("https://app.example.com/api/delivery-import/confirm", {
                method: "POST",
                headers: { authorization: "Bearer t" },
                body: JSON.stringify({
                    filename: "receipt.pdf",
                    parsedPDF: { header: { receiptNumber: "R1" }, rows: [row(1), row(2)], footerTotal: 50000 },
                    confirmedItems,
                    skippedItems: [],
                }),
            }),
        );
    const auditRows = () =>
        queriesOn("delivery_import_items")
            .flatMap((q) => q.ops.filter((o) => o.op === "insert").map((o) => o.args[0]))
            .flat() as Record<string, unknown>[];

    it("takes the price from the receipt row and the old status from the database, not the browser", async () => {
        const res = await post([
            { pdfRowNumber: 1, orderId: ORDER_1, matchCategory: "price_changed", matchDetails: "", resolutionAction: "process_with_pdf_price", pdfAmount: 1, previousStatus: "new" },
        ]);
        expect(res.status).toBe(200);
        const update = queriesOn("orders").find((q) => q.ops.some((o) => o.op === "update"));
        const values = update?.ops.find((o) => o.op === "update")?.args[0] as Record<string, unknown>;
        expect(values.price).toBe(25000);
        expect(update?.ops.some((o) => o.op === "eq" && o.args[0] === "status" && o.args[1] === "in_transit")).toBe(true);
        const [audit] = auditRows();
        expect(audit).toMatchObject({ previous_status: "in_transit", new_status: "delivered" });
        expect(audit.previous_values).toMatchObject({ status: "in_transit", price: 30000, delivered_at: null });
    });

    it("fails a row whose order is not in this store instead of writing it", async () => {
        await post([{ pdfRowNumber: 1, orderId: ORDER_GONE, matchCategory: "clean", matchDetails: "" }]);
        expect(queriesOn("orders").some((q) => q.ops.some((o) => o.op === "update"))).toBe(false);
        expect(auditRows()[0]).toMatchObject({ action: "failed", previous_values: null });
    });

    it("refuses a receipt that was already imported", async () => {
        state.importError = { code: "23505", message: "duplicate key" };
        const res = await post([{ pdfRowNumber: 1, orderId: ORDER_1, matchCategory: "clean", matchDetails: "" }]);
        expect(res.status).toBe(409);
        expect(queriesOn("orders").some((q) => q.ops.some((o) => o.op === "update"))).toBe(false);
    });

    it("refuses a malformed body", async () => {
        const res = await post([{ pdfRowNumber: 1, orderId: "not-a-uuid", matchCategory: "clean", matchDetails: "" }]);
        expect(res.status).toBe(400);
    });
});
