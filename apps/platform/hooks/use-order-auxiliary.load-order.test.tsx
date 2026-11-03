// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queriesOn, resetRecording, respond } from "@/lib/__fixtures__/recording-supabase";

const H = vi.hoisted(() => ({ listSettled: false }));

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ user: { id: "u1" }, profile: null, tenantId: "tenant-1", session: { access_token: "t" }, clientReady: true }),
}));
vi.mock("@/hooks/orders-list-coverage", () => ({
    useOrdersListSettledOnce: () => H.listSettled,
}));
vi.mock("@/hooks/use-customer-order-counts", () => ({ useCustomerOrderCounts: () => undefined }));

import { useOrderAuxiliary } from "./use-order-auxiliary";

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => {
    resetRecording();
    respond(() => ({ data: [], error: null }));
});

describe("useOrderAuxiliary load order", () => {
    it("reads the blacklist with the tenant, and reasons and templates only once the list is in", async () => {
        H.listSettled = false;
        const hook = renderHook(() => useOrderAuxiliary({ orders: [], archivedOrders: [], searchOrders: null }), { wrapper });

        await waitFor(() => expect(queriesOn("blacklist")).toHaveLength(1));
        expect(queriesOn("order_reasons")).toEqual([]);
        expect(queriesOn("message_templates")).toEqual([]);

        H.listSettled = true;
        hook.rerender();
        await waitFor(() => expect(queriesOn("message_templates")).toHaveLength(1));
        expect(queriesOn("order_reasons")).toHaveLength(1);
        expect(queriesOn("blacklist")).toHaveLength(1);
    });
});
