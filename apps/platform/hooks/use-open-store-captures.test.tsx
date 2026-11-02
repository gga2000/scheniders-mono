import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const H = vi.hoisted(() => ({
  calls: [] as unknown[][],
  result: { data: [] as unknown[] | null, error: null as { message: string } | null },
  tenantId: "tenant-1" as string | null,
  countResult: { count: 0 as number | null, error: null as { message: string } | null },
}));

vi.mock("@/lib/supabase", () => {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ["select", "eq", "is", "order"]) {
    chain[m] = (...args: unknown[]) => {
      H.calls.push([m, ...args]);
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    H.calls.push(["limit", ...args]);
    return Promise.resolve(H.result);
  };
  // The count query is awaited straight after `.is(...)`.
  chain.then = (resolve: unknown) =>
    Promise.resolve(H.countResult).then(resolve as (v: unknown) => unknown);
  return {
    supabase: {
      from: (table: string) => {
        H.calls.push(["from", table]);
        return chain;
      },
    },
  };
});
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ tenantId: H.tenantId }),
}));

import {
  useOpenStoreCaptures,
  useOpenStoreCapturesCount,
  OPEN_CAPTURES_LIMIT,
} from "./use-open-store-captures";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  H.calls = [];
  H.result = { data: [], error: null };
  H.tenantId = "tenant-1";
  H.countResult = { count: 0, error: null };
});

describe("useOpenStoreCaptures", () => {
  it("reads this tenant's open captures only, newest first", async () => {
    H.result = {
      data: [
        {
          id: "c1",
          phone: "07701234567",
          items: [{ product_id: "p1", variant_id: null, name: "عطر", quantity: 1, price: 25000 }],
          subtotal_iqd: 25000,
          governorate: "BG",
          updated_at: "2026-10-21T10:00:00.000Z",
          consent_at: "2026-10-21T10:00:00.000Z",
          reminded_at: null,
        },
        {
          id: "c2",
          phone: "07801234567",
          items: "corrupt",
          subtotal_iqd: 0,
          governorate: null,
          updated_at: "2026-10-21T09:00:00.000Z",
          consent_at: null,
          reminded_at: null,
        },
      ],
      error: null,
    };
    const { result } = renderHook(() => useOpenStoreCaptures(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(H.calls).toContainEqual(["from", "abandoned_carts"]);
    expect(H.calls).toContainEqual(["eq", "tenant_id", "tenant-1"]);
    expect(H.calls).toContainEqual(["is", "recovered_at", null]);
    expect(H.calls).toContainEqual(["order", "updated_at", { ascending: false }]);
    expect(H.calls).toContainEqual(["limit", OPEN_CAPTURES_LIMIT]);
    expect(result.current.data?.[1].items).toEqual([]);
  });

  it("does not query before the active tenant is known", async () => {
    H.tenantId = null;
    renderHook(() => useOpenStoreCaptures(), { wrapper: wrapper() });
    await new Promise((r) => setTimeout(r, 20));
    expect(H.calls).toEqual([]);
  });

  it("surfaces a read error instead of an empty list", async () => {
    H.result = { data: null, error: { message: "boom" } };
    const { result } = renderHook(() => useOpenStoreCaptures(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useOpenStoreCapturesCount", () => {
  it("counts this tenant's unrecovered captures in the database", async () => {
    H.countResult = { count: 7, error: null };
    const { result } = renderHook(() => useOpenStoreCapturesCount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(7);
    expect(H.calls).toEqual([
      ["from", "abandoned_carts"],
      ["select", "id", { count: "exact", head: true }],
      ["eq", "tenant_id", "tenant-1"],
      ["is", "recovered_at", null],
    ]);
  });

  it("surfaces a read error instead of counting zero", async () => {
    H.countResult = { count: null, error: { message: "denied" } };
    const { result } = renderHook(() => useOpenStoreCapturesCount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
