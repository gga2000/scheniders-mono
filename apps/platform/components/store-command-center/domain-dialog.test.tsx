/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({
    rows: [] as unknown[],
    insertError: null as { code: string } | null,
    inserted: [] as unknown[],
    toasts: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ session: { access_token: "tok-1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: state.toasts }));
vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: () => ({
            select: () => ({
                eq: () => ({ order: () => Promise.resolve({ data: state.rows, error: null }) }),
            }),
            insert: (row: unknown) => {
                state.inserted.push(row);
                return {
                    select: () => ({
                        single: () => Promise.resolve({ data: row, error: state.insertError }),
                    }),
                };
            },
        }),
    },
}));

import { DomainDialog } from "./domain-dialog";

const fetchMock = vi.fn<typeof fetch>();

const wrap = (children: ReactNode) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {children}
    </QueryClientProvider>
);

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    state.rows = [{ id: "d1", tenant_id: "t1", domain: "shop.example.com", verified: false, verified_at: null, created_at: "2026-10-30" }];
    state.insertError = null;
    state.inserted = [];
    vi.clearAllMocks();
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("DomainDialog", () => {
    it("does not say 'verified' when the endpoint answers verified:false", async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ verified: false, error: "x" }), { status: 200 }));
        render(wrap(<DomainDialog tenantId="t1" slug="demo" locale="en" onClose={() => undefined} />));
        fireEvent.click(await screen.findByText("Verify"));
        await waitFor(() => expect(state.toasts.error).toHaveBeenCalled());
        expect(state.toasts.success).not.toHaveBeenCalled();
        const [, init] = fetchMock.mock.calls[0];
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    });

    it("says 'verified' only when the endpoint confirms", async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ verified: true }), { status: 200 }));
        render(wrap(<DomainDialog tenantId="t1" slug="demo" locale="en" onClose={() => undefined} />));
        fireEvent.click(await screen.findByText("Verify"));
        await waitFor(() => expect(state.toasts.success).toHaveBeenCalled());
    });

    it("rejects an invalid domain before touching the database", async () => {
        state.rows = [];
        render(wrap(<DomainDialog tenantId="t1" slug="demo" locale="en" onClose={() => undefined} />));
        fireEvent.click(await screen.findByText("Connect Custom Domain"));
        fireEvent.change(screen.getByLabelText("Domain Name"), { target: { value: "not a domain" } });
        fireEvent.click(screen.getByText("Connect"));
        await waitFor(() => expect(state.toasts.error).toHaveBeenCalled());
        expect(state.inserted).toEqual([]);
    });

    it("adds a cleaned domain and reports a duplicate as taken", async () => {
        state.rows = [];
        state.insertError = { code: "23505" };
        render(wrap(<DomainDialog tenantId="t1" slug="demo" locale="en" onClose={() => undefined} />));
        fireEvent.click(await screen.findByText("Connect Custom Domain"));
        fireEvent.change(screen.getByLabelText("Domain Name"), { target: { value: "https://Shop.Example.com/x" } });
        fireEvent.click(screen.getByText("Connect"));
        await waitFor(() => expect(state.toasts.error).toHaveBeenCalledWith("This domain is already connected to a store."));
        expect(state.inserted).toEqual([{ tenant_id: "t1", domain: "shop.example.com" }]);
    });
});
