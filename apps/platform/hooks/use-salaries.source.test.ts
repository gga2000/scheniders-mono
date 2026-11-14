import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: null }) }));

import { queriesOn, recorded, resetRecording, hasEq } from "@/lib/__fixtures__/recording-supabase";
import { fetchPayrollSource } from "./use-salaries";

const TENANT = "33333333-3333-4333-8333-333333333333";

describe("fetchPayrollSource: which completed orders earn a bonus", () => {
    beforeEach(() => resetRecording());

    it("reads only real orders: not trashed, not test (audit R2 N10)", async () => {
        await fetchPayrollSource(TENANT, "2026-11-01", "2026-11-14", "custom");

        const completed = queriesOn("orders").filter((q) => hasEq(q, "status", "completed"));
        expect(completed.length).toBeGreaterThan(0);
        for (const q of completed) {
            expect(hasEq(q, "tenant_id", TENANT)).toBe(true);
            expect(q.ops).toContainEqual({ op: "is", args: ["deleted_at", null] });
            expect(q.ops).toContainEqual({ op: "or", args: ["is_test.is.null,is_test.eq.false"] });
        }
        expect(recorded.length).toBeGreaterThan(0);
    });
});
