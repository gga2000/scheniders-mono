import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkTargetAllowed } from "./link-target";

const HERE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

type Membership = { tenant_id: string; role: string; status: string };

function fakeAdmin(memberships: Membership[] | null, profile: { role: string } | null, fail = false): SupabaseClient {
    const from = (table: string) => ({
        select: () => ({
            eq: () =>
                table === "tenant_members"
                    ? Promise.resolve({ data: memberships, error: fail ? { message: "boom" } : null })
                    : { maybeSingle: () => Promise.resolve({ data: profile, error: null }) },
        }),
    });
    return { from } as unknown as SupabaseClient;
}

describe("linkTargetAllowed", () => {
    it("allows an active employee of this store only", async () => {
        const admin = fakeAdmin([{ tenant_id: HERE, role: "employee", status: "active" }], { role: "employee" });
        expect(await linkTargetAllowed(admin, "u", HERE)).toBe(true);
    });

    it("refuses someone who is also in another store, even suspended there", async () => {
        const admin = fakeAdmin(
            [
                { tenant_id: HERE, role: "employee", status: "active" },
                { tenant_id: OTHER, role: "admin", status: "suspended" },
            ],
            { role: "employee" },
        );
        expect(await linkTargetAllowed(admin, "u", HERE)).toBe(false);
    });

    it("refuses a store admin, a platform admin, a suspended member and a failed read", async () => {
        expect(await linkTargetAllowed(fakeAdmin([{ tenant_id: HERE, role: "admin", status: "active" }], { role: "admin" }), "u", HERE)).toBe(false);
        expect(await linkTargetAllowed(fakeAdmin([{ tenant_id: HERE, role: "employee", status: "active" }], { role: "super_admin" }), "u", HERE)).toBe(false);
        expect(await linkTargetAllowed(fakeAdmin([{ tenant_id: HERE, role: "employee", status: "suspended" }], { role: "employee" }), "u", HERE)).toBe(false);
        expect(await linkTargetAllowed(fakeAdmin(null, { role: "employee" }, true), "u", HERE)).toBe(false);
        expect(await linkTargetAllowed(fakeAdmin([], { role: "employee" }), "u", HERE)).toBe(false);
    });
});
