// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { fetchLoyaltyBalance, useLoyaltyBalance } from "./loyalty-balance";

const TENANT = "44444444-4444-4444-8444-444444444444";

let fetchMock: ReturnType<typeof vi.fn>;

function respondWith(status: number, body: unknown) {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchLoyaltyBalance", () => {
  it("POSTs tenant, phone and the proving order number — never a query string", async () => {
    respondWith(200, { balance: 40 });
    await expect(fetchLoyaltyBalance({ tenantId: TENANT, phone: "07701234567", orderNumber: "4260910007" })).resolves.toBe(40);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/loyalty/balance");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      tenant_id: TENANT,
      phone: "07701234567",
      order_number: "4260910007",
    });
  });

  it.each([404, 429, 503])("is null when the route answers %s", async (status) => {
    respondWith(status, { error: "x" });
    await expect(fetchLoyaltyBalance({ tenantId: TENANT, phone: "07701234567", orderNumber: "1" })).resolves.toBeNull();
  });

  it("is null for a body without a numeric balance", async () => {
    respondWith(200, { balance: "40" });
    await expect(fetchLoyaltyBalance({ tenantId: TENANT, phone: "07701234567", orderNumber: "1" })).resolves.toBeNull();
  });
});

describe("useLoyaltyBalance", () => {
  it("asks nothing until there is a valid phone AND an order number", async () => {
    vi.useFakeTimers();
    respondWith(200, { balance: 40 });
    const { result, rerender } = renderHook((p: { phone: string; orderNumber: string }) =>
      useLoyaltyBalance({ enabled: true, tenantId: TENANT, ...p }), { initialProps: { phone: "07701234567", orderNumber: "" } });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toBeNull();

    rerender({ phone: "0770", orderNumber: "4260910007" });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ phone: "07701234567", orderNumber: "4260910007" });
    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(40);
  });

  it("drops the balance as soon as the phone changes", async () => {
    vi.useFakeTimers();
    respondWith(200, { balance: 40 });
    const { result, rerender } = renderHook((p: { phone: string }) =>
      useLoyaltyBalance({ enabled: true, tenantId: TENANT, orderNumber: "4260910007", ...p }), { initialProps: { phone: "07701234567" } });
    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toBe(40);
    rerender({ phone: "07709999999" });
    expect(result.current).toBeNull();
  });

  it("does nothing while loyalty is off", async () => {
    vi.useFakeTimers();
    respondWith(200, { balance: 40 });
    renderHook(() => useLoyaltyBalance({ enabled: false, tenantId: TENANT, phone: "07701234567", orderNumber: "1" }));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
