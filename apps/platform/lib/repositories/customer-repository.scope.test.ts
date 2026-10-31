// Tag removal and deletion must carry the store id in the query itself, not rely
// on RLS alone; a client that forgets the filter would still pass in one store.

import { describe, expect, it, vi, beforeEach } from "vitest";

const eqCalls: Array<[string, unknown]> = [];
const result = { error: null as null | Error };
const chain = {
    delete: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
        eqCalls.push([column, value]);
        return Object.assign(Promise.resolve(result), chain);
    }),
};

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(() => chain) } }));
vi.mock("./with-retry", () => ({
    withRetry: <T,>(_name: string, fn: () => Promise<T>) => fn(),
}));

import { customerRepository } from "./customer-repository";

describe("customerRepository tenant scoping", () => {
    beforeEach(() => {
        eqCalls.length = 0;
        result.error = null;
    });

    it("deleteTag filters by tenant and id", async () => {
        await customerRepository.deleteTag("tag-1", "tenant-1");
        expect(eqCalls).toEqual([
            ["tenant_id", "tenant-1"],
            ["id", "tag-1"],
        ]);
    });

    it("removeTag filters by tenant, phone and tag", async () => {
        await customerRepository.removeTag("07701234567", "tag-1", "tenant-1");
        const columns = eqCalls.map(([column]) => column);
        expect(columns).toEqual(["tenant_id", "customer_phone", "tag_id"]);
        expect(eqCalls[0]).toEqual(["tenant_id", "tenant-1"]);
    });

    it("surfaces a database error", async () => {
        result.error = new Error("denied");
        await expect(customerRepository.deleteTag("tag-1", "tenant-1")).rejects.toThrow("denied");
    });
});
