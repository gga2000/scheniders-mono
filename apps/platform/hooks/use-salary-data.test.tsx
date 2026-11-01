// Payroll reads are scoped to the current store, a failed read never shows a smaller
// salary, and a write refreshes the period (or reports its error).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

type Result = { data: unknown; error: { message: string } | null };
type Call = { table: string; op: string; filters: Array<[string, unknown]> };

const TENANT = "tenant-a";
let tables: Record<string, Result>;
let calls: Call[];

/** A Supabase query builder stand-in: records filters and resolves to the table's canned result. */
function builder(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const chain = {
        select: () => chain,
        insert: () => { call.op = "insert"; return chain; },
        delete: () => { call.op = "delete"; return chain; },
        eq: (col: string, val: unknown) => { call.filters.push([col, val]); return chain; },
        in: (col: string, val: unknown) => { call.filters.push([col, val]); return chain; },
        gte: () => chain,
        lte: () => chain,
        order: () => chain,
        range: () => chain,
        then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(call.op === "select" ? (tables[table] ?? { data: [], error: null }) : (tables[`${table}:${call.op}`] ?? { data: null, error: null })).then(resolve, reject),
    };
    return chain;
}

vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => builder(table) } }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: TENANT }) }));

import { useSalaries } from "./use-salaries";
import { useSalaryDeductions } from "./use-salary-deductions";

function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    calls = [];
    tables = {
        tenant_members: { data: [{ user_id: "u1", role: "employee" }], error: null },
        user_profiles: { data: [{ id: "u1", email: "a@x.iq", display_name: "Ahmed", role: "admin", avatar_url: null, is_active: true }], error: null },
    };
});
afterEach(cleanup);

describe("useSalaries", () => {
    it("filters every payroll read by the current store and uses the member's role in that store", async () => {
        const { result } = renderHook(() => useSalaries("2026-10-01", "2026-10-31"), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.failed).toBe(false);
        expect(result.current.employeePayrollData.map((d) => d.employee.role)).toEqual(["employee"]);
        const unscoped = calls.filter((c) => c.table !== "user_profiles" && !c.filters.some(([col, v]) => col === "tenant_id" && v === TENANT));
        expect(unscoped).toEqual([]);
        // Profiles are read for this store's members only.
        expect(calls.find((c) => c.table === "user_profiles")?.filters).toContainEqual(["id", ["u1"]]);
    });

    it("fails the load instead of under-counting when an order page fails", async () => {
        tables.orders = { data: null, error: { message: "timeout" } };
        const { result } = renderHook(() => useSalaries("2026-10-01", "2026-10-31"), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.failed).toBe(true));
        expect(result.current.employeePayrollData).toEqual([]);
    });
});

describe("useSalaryDeductions", () => {
    it("returns the database error from a failed write", async () => {
        tables["salary_advances:insert"] = { data: null, error: { message: "denied" } };
        const { result } = renderHook(() => useSalaryDeductions(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        let outcome: { error: string | null } = { error: null };
        await act(async () => { outcome = await result.current.addAdvance("u1", 5000); });
        expect(outcome.error).toBe("denied");
    });

    it("refetches after a saved write", async () => {
        const { result } = renderHook(() => useSalaryDeductions(), { wrapper: wrapper() });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        const readsBefore = calls.filter((c) => c.table === "salary_advances" && c.op === "select").length;
        await act(async () => { await result.current.addAdvance("u1", 5000); });
        const readsAfter = calls.filter((c) => c.table === "salary_advances" && c.op === "select").length;
        expect(readsAfter).toBe(readsBefore + 1);
        const insert = calls.find((c) => c.table === "salary_advances" && c.op === "insert");
        expect(insert).toBeTruthy();
    });
});
