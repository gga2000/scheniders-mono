import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * The feed hook records the reader's language for push copy. Every mounted
 * notifications dropdown ran it, and it wrote on every mount: two writes per
 * page load for a value that almost never changes.
 */

const H = vi.hoisted(() => ({
    upsert: vi.fn(),
    language: "ar" as "ar" | "en",
}));

vi.mock("@/lib/supabase", () => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "order", "limit", "in", "is"]) chain[op] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    const channel = { on: () => channel, subscribe: () => channel };
    return {
        supabase: {
            from: (table: string) => (table === "notification_settings" ? { upsert: H.upsert } : { ...chain, upsert: async () => ({ error: null }) }),
            rpc: async () => ({ data: [], error: null }),
            channel: () => channel,
            removeChannel: async () => {},
        },
    };
});
vi.mock("@/hooks/use-auth", () => ({
    useAuth: () => ({ user: { id: "u1" }, profile: { full_name: "Ali" }, tenantId: "t1" }),
}));
vi.mock("@/components/providers/language-provider", () => ({
    useLanguage: () => ({ t: (k: string) => k, language: H.language }),
}));
vi.mock("@/hooks/use-notification-chime", () => ({ useNotificationChime: () => () => {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { resetLocaleSyncForTests, useNotificationFeed } from "./use-notification-feed";

function wrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
    H.upsert.mockReset();
    H.upsert.mockResolvedValue({ error: null });
    H.language = "ar";
    localStorage.clear();
    resetLocaleSyncForTests();
});
afterEach(cleanup);

const tick = () => new Promise((r) => setTimeout(r, 30));

describe("notification locale sync", () => {
    it("writes once for two mounted dropdowns", async () => {
        const w = wrapper();
        renderHook(() => useNotificationFeed(), { wrapper: w });
        renderHook(() => useNotificationFeed(), { wrapper: w });
        await waitFor(() => expect(H.upsert).toHaveBeenCalledTimes(1));
        await tick();
        expect(H.upsert).toHaveBeenCalledTimes(1);
        expect(H.upsert.mock.calls[0][0]).toEqual({ user_id: "u1", tenant_id: "t1", locale: "ar" });
    });

    it("does not write on a later page load when this device already wrote that locale", async () => {
        renderHook(() => useNotificationFeed(), { wrapper: wrapper() });
        await waitFor(() => expect(H.upsert).toHaveBeenCalledTimes(1));
        cleanup();
        resetLocaleSyncForTests(); // a new page load: only localStorage remains
        renderHook(() => useNotificationFeed(), { wrapper: wrapper() });
        await tick();
        expect(H.upsert).toHaveBeenCalledTimes(1);
    });

    it("writes again when the language changes", async () => {
        const { rerender } = renderHook(() => useNotificationFeed(), { wrapper: wrapper() });
        await waitFor(() => expect(H.upsert).toHaveBeenCalledTimes(1));
        H.language = "en";
        rerender();
        await waitFor(() => expect(H.upsert).toHaveBeenCalledTimes(2));
        expect(H.upsert.mock.calls[1][0]).toMatchObject({ locale: "en" });
    });

    it("retries on a later mount after a failed write, and remembers nothing", async () => {
        H.upsert.mockResolvedValueOnce({ error: { message: "boom" } });
        renderHook(() => useNotificationFeed(), { wrapper: wrapper() });
        await waitFor(() => expect(H.upsert).toHaveBeenCalledTimes(1));
        await tick();
        expect(localStorage.length).toBe(0);
        cleanup();
        renderHook(() => useNotificationFeed(), { wrapper: wrapper() });
        await waitFor(() => expect(H.upsert).toHaveBeenCalledTimes(2));
    });
});
