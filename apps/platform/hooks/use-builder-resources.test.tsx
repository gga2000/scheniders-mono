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
    useAuth: () => {
        if (!auth.value) throw new Error("useAuth outside a provider");
        return auth.value;
    },
}));

import {
    useBuilderAttributes,
    useBuilderCategories,
    useBuilderProducts,
} from "./use-builder-resources";
import { useAttributeDefsQuery } from "./use-product-attributes-query";

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

    it("scope products, categories and attributes to the tenant being edited", async () => {
        auth.value = { session: {}, clientReady: true, tenantId: "tenant-a" };
        const products = renderHook(() => useBuilderProducts(), { wrapper });
        const categories = renderHook(() => useBuilderCategories(), { wrapper });
        const attributes = renderHook(() => useBuilderAttributes(), { wrapper });
        await waitFor(() => expect(products.result.current.isSuccess).toBe(true));
        await waitFor(() => expect(categories.result.current.isSuccess).toBe(true));
        await waitFor(() => expect(attributes.result.current.isSuccess).toBe(true));

        for (const table of ["products", "categories", "product_attribute_defs"]) {
            const call = calls.find((c) => c.table === table);
            expect(call?.filters, table).toContainEqual(["tenant_id", "tenant-a"]);
        }
    });

    it("the attributes screen reads the same tenant-scoped definitions", async () => {
        auth.value = { session: {}, clientReady: true, tenantId: "tenant-b" };
        const defs = renderHook(() => useAttributeDefsQuery(), { wrapper });
        await waitFor(() => expect(defs.result.current.isSuccess).toBe(true));
        const call = calls.find((c) => c.table === "product_attribute_defs");
        expect(call?.filters).toContainEqual(["tenant_id", "tenant-b"]);
    });

    it("do not query without a tenant, or without an auth provider", () => {
        auth.value = { session: {}, clientReady: true, tenantId: null };
        const withoutTenant = renderHook(() => useBuilderProducts(), { wrapper });
        expect(withoutTenant.result.current.fetchStatus).toBe("idle");

        auth.value = undefined;
        const withoutProvider = renderHook(() => useBuilderCategories(), { wrapper });
        expect(withoutProvider.result.current.fetchStatus).toBe("idle");
        const attributesWithoutProvider = renderHook(() => useBuilderAttributes(), { wrapper });
        expect(attributesWithoutProvider.result.current.fetchStatus).toBe("idle");

        expect(calls).toHaveLength(0);
    });
});
