import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordingSupabase, respond, resetRecording, queriesOn } from "@/lib/__fixtures__/recording-supabase";

/*
 * The rollback selected previous_price, previous_delivered_source, previous_delivered_at and
 * previous_delivery_order_id from delivery_import_items. Only previous_status exists, so the
 * select errored and no import could ever be rolled back. Those other columns were never
 * captured, so restoring them would also have written NULL prices over real ones.
 * The rollback restores the one thing that was captured: the status.
 */

const TENANT = "99999999-9999-4999-8999-999999999999";

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async () => ({ ok: true, userId: "user-1", tenantId: TENANT, role: "admin", platformAdmin: false }),
}));

import { POST } from "./route";

const LIVE_COLUMNS = new Set(["order_id", "previous_status", "action", "import_id"]);

beforeEach(() => {
    resetRecording();
    respond((q) => {
        if (q.target === "delivery_imports" && q.ops.some((o) => o.op === "select")) {
            return { data: { id: "imp-1", status: "confirmed" }, error: null };
        }
        if (q.target === "delivery_import_items") {
            const cols = String(q.ops.find((o) => o.op === "select")?.args[0] ?? "").split(",").map((c) => c.trim());
            const missing = cols.find((c) => !LIVE_COLUMNS.has(c));
            if (missing) return { data: null, error: { message: `column delivery_import_items.${missing} does not exist` } };
            return {
                data: [
                    { order_id: "o1", previous_status: "in_transit" },
                    { order_id: "o2", previous_status: "confirmed" },
                    { order_id: "o3", previous_status: null },
                ],
                error: null,
            };
        }
        return { data: null, error: null };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const call = () =>
    POST(
        new NextRequest("https://app.example.com/api/delivery-import/rollback", {
            method: "POST",
            headers: { authorization: "Bearer t" },
            body: JSON.stringify({ importId: "imp-1" }),
        }),
    );

describe("POST /api/delivery-import/rollback", () => {
    it("reads only columns that exist and restores each order's status, nothing else", async () => {
        const res = await call();
        expect(res.status).toBe(200);

        const updates = queriesOn("orders").flatMap((q) => q.ops.filter((o) => o.op === "update").map((o) => o.args[0]));
        expect(updates).toEqual([{ status: "in_transit" }, { status: "confirmed" }]);
    });

    it("reports orders with no captured status as skipped, not restored, and cancels the import", async () => {
        const body = await (await call()).json();
        expect(body.data).toMatchObject({ restored: 2, skipped: 1, failed: 0 });
        const cancelled = queriesOn("delivery_imports").some((q) =>
            q.ops.some((o) => o.op === "update" && (o.args[0] as { status?: string }).status === "cancelled"),
        );
        expect(cancelled).toBe(true);
    });
});
