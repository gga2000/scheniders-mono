import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The undo runs in one database transaction (rollback_delivery_import): it restores
 * the fields captured on the server at import time, only on orders that still have
 * the status the import set. The route passes the caller's tenant, never one from
 * the body, and maps the function's errors to HTTP answers.
 */

const TENANT = "99999999-9999-4999-8999-999999999999";
const IMPORT_ID = "11111111-1111-4111-8111-111111111111";

const rpc = vi.fn();
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => ({ rpc }) }));
vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async () => ({ ok: true, userId: "user-1", tenantId: TENANT, role: "admin", platformAdmin: false }),
}));

import { POST } from "./route";

const call = (body: unknown) =>
    POST(
        new NextRequest("https://app.example.com/api/delivery-import/rollback", {
            method: "POST",
            headers: { authorization: "Bearer t" },
            body: JSON.stringify(body),
        }),
    );

beforeEach(() => {
    rpc.mockResolvedValue({ data: { restored: 2, changed_since: 1, skipped: 0 }, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/delivery-import/rollback", () => {
    it("undoes through the transactional function with the caller's tenant", async () => {
        const res = await call({ importId: IMPORT_ID, tenantId: "someone-else" });
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith("rollback_delivery_import", { p_tenant_id: TENANT, p_import_id: IMPORT_ID });
        expect((await res.json()).data).toEqual({ importId: IMPORT_ID, restored: 2, changedSince: 1, skipped: 0 });
    });

    it("refuses a missing or malformed import id without calling the database", async () => {
        for (const body of [{}, { importId: "imp-1" }]) {
            expect((await call(body)).status).toBe(400);
        }
        expect(rpc).not.toHaveBeenCalled();
    });

    it("answers 404 for another store's or an unknown import, 400 when it is not confirmed", async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "import not found" } });
        expect((await call({ importId: IMPORT_ID })).status).toBe(404);
        rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "only a confirmed import can be undone" } });
        expect((await call({ importId: IMPORT_ID })).status).toBe(400);
    });
});
