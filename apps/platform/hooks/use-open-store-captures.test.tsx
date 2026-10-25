import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const H = vi.hoisted(() => ({
  calls: [] as unknown[][],
  result: { data: [] as unknown[] | null, error: null as { message: string } | null },
  tenantId: "tenant-1" as string | null,
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

import { useOpenStoreCaptures, OPEN_CAPTURES_LIMIT } from "./use-open-store-captures";

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
