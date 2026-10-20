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

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async () => ({ ok: true, userId: "user-1", tenantId: TENANT, role: "user", memberRole: "admin" }),
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
    respond((q) => {
        if (q.target === "delivery_imports" && q.ops.some((o) => o.op === "insert")) {
            return { data: { id: "import-1" }, error: null };
        }
        if (q.target === "orders" && q.ops.some((o) => o.op === "update")) {
            // Second order update fails, so a "failed" audit row is written too.
            const failing = q.ops.some((o) => o.op === "eq" && o.args[0] === "id" && o.args[1] === "order-2");
            return { data: null, error: failing ? { message: "boom" } : null };
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
                        { pdfRowNumber: 1, orderId: "order-1", matchCategory: "clean", matchDetails: "", previousStatus: "in_transit" },
                        { pdfRowNumber: 2, orderId: "order-2", matchCategory: "clean", matchDetails: "", previousStatus: "in_transit" },
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
});
