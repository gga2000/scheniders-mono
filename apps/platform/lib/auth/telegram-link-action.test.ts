import { describe, it, expect, vi, beforeEach } from "vitest";

// F-087 on the app path: generateTelegramLinkCodeAction mints codes with the
// service role, so the caller check (requireTenantAdminFor) and the target
// check must both refuse deactivated profiles. A code is a way to act as its
// user through the bot. Lives under lib/ because vitest collects app/api and
// lib, not app/actions.

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
    verifyAccessToken: vi.fn(),
}));

import { generateTelegramLinkCodeAction } from "@/app/actions/telegram-link";
import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";

type Row = Record<string, unknown>;

const TENANT = "tenant-a";

function fakeClient(tables: Record<string, Row[]>, inserted: Row[]) {
    return {
        from(table: string) {
            const filters: ((row: Row) => boolean)[] = [];
            let pendingInsert: Row | null = null;
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            const chain = {
                select: () => chain,
                update: () => chain,
                insert: (row: Row) => {
                    pendingInsert = row;
                    return chain;
                },
                eq: (col: string, val: unknown) => {
                    filters.push((r) => r[col] === val);
                    return chain;
                },
                is: () => chain,
                maybeSingle: () => {
                    if (pendingInsert) {
                        inserted.push({ table, ...pendingInsert });
                        return Promise.resolve({
                            data: { code: pendingInsert.code, expires_at: "2026-10-22T00:00:00Z" },
                            error: null,
                        });
                    }
                    return Promise.resolve({ data: rows()[0] ?? null, error: null });
                },
                then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
                    Promise.resolve({ data: rows(), error: null }).then(resolve),
            };
            return chain;
        },
    };
}

const tables: Record<string, Row[]> = {
    user_profiles: [
        { id: "admin-a", role: "admin", is_active: true },
        { id: "deactivated-admin-a", role: "admin", is_active: false },
        { id: "staff-a", role: "employee", is_active: true },
        { id: "deactivated-staff-a", role: "employee", is_active: false },
    ],
    tenant_members: [
        { user_id: "admin-a", tenant_id: TENANT, role: "admin", status: "active" },
        { user_id: "deactivated-admin-a", tenant_id: TENANT, role: "admin", status: "active" },
        { user_id: "staff-a", tenant_id: TENANT, role: "employee", status: "active" },
        { user_id: "deactivated-staff-a", tenant_id: TENANT, role: "employee", status: "active" },
    ],
};

let inserted: Row[] = [];

function callAs(userId: string) {
    vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: userId }, error: null } as never);
    return "token";
}

beforeEach(() => {
    inserted = [];
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fakeClient(tables, inserted) as never);
});

describe("generateTelegramLinkCodeAction (F-087)", () => {
    it("refuses a deactivated admin minting a code for an active employee", async () => {
        const result = await generateTelegramLinkCodeAction("staff-a", TENANT, undefined, callAs("deactivated-admin-a"));
        expect(result.success).toBe(false);
        expect(inserted).toEqual([]);
    });

    it("refuses an active admin minting a code for a deactivated user", async () => {
        const result = await generateTelegramLinkCodeAction("deactivated-staff-a", TENANT, undefined, callAs("admin-a"));
        expect(result.success).toBe(false);
        expect(inserted).toEqual([]);
    });

    it("lets an active admin mint a code for an active employee", async () => {
        const result = await generateTelegramLinkCodeAction("staff-a", TENANT, undefined, callAs("admin-a"));
        expect(result.success).toBe(true);
        expect(inserted).toHaveLength(1);
        expect(inserted[0]).toMatchObject({ table: "telegram_link_codes", user_profile_id: "staff-a", tenant_id: TENANT });
    });
});
