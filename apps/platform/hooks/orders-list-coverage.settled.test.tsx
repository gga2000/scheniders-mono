// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ensureCoverage, markListLoaded, useOrdersListSettledOnce } from "./orders-list-coverage";

describe("useOrdersListSettledOnce", () => {
    it("is false until the list first settles, then stays true when the cache is dropped", async () => {
        const LIST = ["orders", "list"] as const;
        const client = new QueryClient();
        ensureCoverage(client, { listKey: LIST, onMainKeyFlush: vi.fn() });
        client.setQueryData(LIST, []);
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );
        const { result } = renderHook(() => useOrdersListSettledOnce(), { wrapper });
        expect(result.current).toBe(false);

        // Coverage changes reach React through React Query's scheduler.
        act(() => markListLoaded(client, "all", null));
        await waitFor(() => expect(result.current).toBe(true));

        // A removed list cache resets coverage; side reads already started stay on.
        await act(async () => {
            client.removeQueries();
            await new Promise((r) => setTimeout(r, 10));
        });
        expect(result.current).toBe(true);
    });
});
