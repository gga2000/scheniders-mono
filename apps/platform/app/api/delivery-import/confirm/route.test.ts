import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    recordingSupabase,
    respond,
    resetRecording,
    queriesOn,
    recorded,
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
const state = vi.hoisted(() => ({
    importError: null as null | { code: string; message: string },
    auditError: null as null | { message: string },
    readStatus: "in_transit",
    readDeliveredAt: null as string | null,
}));

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
    state.auditError = null;
    state.readStatus = "in_transit";
    state.readDeliveredAt = null;
    respond((q) => {
        if (q.target === "delivery_import_items" && q.ops.some((o) => o.op === "insert")) {
            return { data: null, error: state.auditError };
        }
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
                    id, status: state.readStatus, price: 30000, delivered_at: state.readDeliveredAt,
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
        // Undo data goes in first for every order; the one whose update failed
        // is then marked failed, inside the caller's tenant.
        expect(items.map((i) => i.action).sort()).toEqual(["confirmed", "confirmed", "skipped"]);
        for (const item of items) expect(item.tenant_id).toBe(TENANT);
        const marked = queriesOn("delivery_import_items").filter((q) => q.ops.some((o) => o.op === "update"));
        expect(marked).toHaveLength(1);
        expect(marked[0].ops.find((o) => o.op === "update")?.args[0]).toMatchObject({ action: "failed" });
        expect(marked[0].ops.some((o) => o.op === "eq" && o.args[0] === "tenant_id" && o.args[1] === TENANT)).toBe(true);
        expect(marked[0].ops.some((o) => o.op === "eq" && o.args[0] === "pdf_row_number" && o.args[1] === 2)).toBe(true);
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

    it("leaves a completed order completed and keeps its delivery day (audit R3-1)", async () => {
        state.readStatus = "completed";
        state.readDeliveredAt = "2026-10-28T09:00:00Z";
        const res = await post([{ pdfRowNumber: 1, orderId: ORDER_1, matchCategory: "already_delivered", matchDetails: "already completed" }]);
        expect(res.status).toBe(200);
        const update = queriesOn("orders").find((q) => q.ops.some((o) => o.op === "update"));
        const values = update?.ops.find((o) => o.op === "update")?.args[0] as Record<string, unknown>;
        expect(values.status).toBe("completed");
        expect(values).not.toHaveProperty("delivered_at");
        expect(auditRows()[0]).toMatchObject({ previous_status: "completed", new_status: "completed" });
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

    it("writes the undo data before any order, and changes nothing when it cannot", async () => {
        await post([{ pdfRowNumber: 1, orderId: ORDER_1, matchCategory: "clean", matchDetails: "" }]);
        const firstAudit = recorded.findIndex((q) => q.target === "delivery_import_items");
        const firstOrderWrite = recorded.findIndex((q) => q.target === "orders" && q.ops.some((o) => o.op === "update"));
        expect(firstAudit).toBeGreaterThanOrEqual(0);
        expect(firstAudit).toBeLessThan(firstOrderWrite);

        recorded.length = 0;
        state.auditError = { message: "statement timeout" };
        const res = await post([{ pdfRowNumber: 1, orderId: ORDER_1, matchCategory: "clean", matchDetails: "" }]);
        expect(res.status).toBe(500);
        expect(queriesOn("orders").some((q) => q.ops.some((o) => o.op === "update"))).toBe(false);
        // The empty import is withdrawn so the receipt can be confirmed again.
        expect(queriesOn("delivery_imports").some((q) => q.ops.some((o) => o.op === "delete"))).toBe(true);
    });

    it("refuses a malformed body", async () => {
        const res = await post([{ pdfRowNumber: 1, orderId: "not-a-uuid", matchCategory: "clean", matchDetails: "" }]);
        expect(res.status).toBe(400);
    });
});
