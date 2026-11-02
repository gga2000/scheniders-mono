import { beforeEach, describe, expect, it, vi } from "vitest";
import { respond, resetRecording, queriesOn, hasEq } from "@/lib/__fixtures__/recording-supabase";

vi.mock("@/lib/supabase", async () => (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "tenant-1" }) }));

import { AGGREGATE_PAGE_SIZE, fetchCustomerAggregates } from "./use-finance-customer-aggregates";

const row = (i: number) => ({ customer_phone: `p${i}` });

beforeEach(() => resetRecording());

describe("fetchCustomerAggregates", () => {
    it("scopes to the tenant and keeps paging past the row cap", async () => {
        respond((q) => {
            const range = q.ops.find((o) => o.op === "range")?.args as [number, number];
            const total = AGGREGATE_PAGE_SIZE + 250;
            const rows = Array.from({ length: Math.max(0, Math.min(range[1] + 1, total) - range[0]) }, (_, i) => row(range[0] + i));
            return { data: rows, error: null };
        });
        const rows = await fetchCustomerAggregates("tenant-1");
        expect(rows).toHaveLength(AGGREGATE_PAGE_SIZE + 250);
        const queries = queriesOn("customer_aggregates");
        expect(queries).toHaveLength(2);
        for (const q of queries) expect(hasEq(q, "tenant_id", "tenant-1")).toBe(true);
    });

    it("throws the database error instead of returning a partial list", async () => {
        respond(() => ({ data: null, error: new Error("boom") }));
        await expect(fetchCustomerAggregates("tenant-1")).rejects.toThrow("boom");
    });
});
