// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

interface Call {
    table: string;
    filters: Array<[string, unknown]>;
}

const calls: Call[] = [];

/** A chainable stand-in for the PostgREST builder that records every filter. */
function builder(table: string) {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
            call.filters.push([column, value]);
            return chain;
        },
        not: () => chain,
        order: () => chain,
        then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: [], error: null }),
    };
    return chain;
}

vi.mock("@/lib/supabase", () => ({
    supabase: { from: (table: string) => builder(table) },
}));

const auth = vi.hoisted(() => ({
    value: undefined as
        | { session: object | null; clientReady: boolean; tenantId: string | null }
        | undefined,
}));

vi.mock("@/components/auth/auth-provider", () => ({
    useOptionalAuth: () => auth.value,
}));

import { useBuilderCategories, useBuilderProducts } from "./use-builder-resources";

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("builder resource hooks", () => {
    beforeEach(() => {
        calls.length = 0;
    });
    afterEach(() => {
        cleanup();
        auth.value = undefined;
    });

    it("scope products and categories to the tenant being edited", async () => {
        auth.value = { session: {}, clientReady: true, tenantId: "tenant-a" };
        const products = renderHook(() => useBuilderProducts(), { wrapper });
        const categories = renderHook(() => useBuilderCategories(), { wrapper });
        await waitFor(() => expect(products.result.current.isSuccess).toBe(true));
        await waitFor(() => expect(categories.result.current.isSuccess).toBe(true));

        const productCall = calls.find((c) => c.table === "products");
        const categoryCall = calls.find((c) => c.table === "categories");
        expect(productCall?.filters).toContainEqual(["tenant_id", "tenant-a"]);
        expect(categoryCall?.filters).toContainEqual(["tenant_id", "tenant-a"]);
    });

    it("do not query without a tenant, or without an auth provider", () => {
        auth.value = { session: {}, clientReady: true, tenantId: null };
        const withoutTenant = renderHook(() => useBuilderProducts(), { wrapper });
        expect(withoutTenant.result.current.fetchStatus).toBe("idle");

        auth.value = undefined;
        const withoutProvider = renderHook(() => useBuilderCategories(), { wrapper });
        expect(withoutProvider.result.current.fetchStatus).toBe("idle");

        expect(calls).toHaveLength(0);
    });
});
