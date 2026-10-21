import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_SUBMIT_TIMEOUT_MS, postOrderWithResubmit } from "./submit-order";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const ENDPOINT = "/api/checkout/orders";
const BODY = JSON.stringify({ idempotency_key: "key-0001-abcdef" });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A request that never answers — until its signal aborts it. */
function hanging(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });
}

function stubFetch(...impls: FetchFn[]) {
  const fn = vi.fn<FetchFn>();
  for (const impl of impls) fn.mockImplementationOnce(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postOrderWithResubmit", () => {
  it("returns the first answer and never resends", async () => {
    const fetchFn = stubFetch(async () => json(200, { success: true, orderNumber: "SH-1" }));
    const onResubmit = vi.fn();
    const out = await postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    expect(out).toEqual({ kind: "answered", ok: true, status: 200, data: { success: true, orderNumber: "SH-1" } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onResubmit).not.toHaveBeenCalled();
  });

  it("passes a 4xx through as the answer — a refused order is not resent", async () => {
    const fetchFn = stubFetch(async () => json(422, { success: false, error: "x" }));
    const onResubmit = vi.fn();
    const out = await postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    expect(out).toMatchObject({ kind: "answered", ok: false, status: 422 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onResubmit).not.toHaveBeenCalled();
  });

  it("does not give up on an attempt before the deadline", async () => {
    vi.useFakeTimers();
    const fetchFn = stubFetch(hanging);
    const onResubmit = vi.fn();
    void postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    await vi.advanceTimersByTimeAsync(ORDER_SUBMIT_TIMEOUT_MS - 1);
    expect(onResubmit).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("after a timeout, resends the identical body once and returns that answer", async () => {
    vi.useFakeTimers();
    const fetchFn = stubFetch(hanging, async () => json(200, { success: true, replayed: true }));
    const onResubmit = vi.fn();
    const pending = postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    await vi.advanceTimersByTimeAsync(ORDER_SUBMIT_TIMEOUT_MS);
    const out = await pending;
    expect(out).toMatchObject({ kind: "answered", ok: true, data: { replayed: true } });
    expect(onResubmit).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0]?.[1]?.body).toBe(BODY);
    expect(fetchFn.mock.calls[1]?.[1]?.body).toBe(BODY);
    expect(fetchFn.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a 5xx as no answer and resends once", async () => {
    const fetchFn = stubFetch(
      async () => json(503, { success: false, retryable: true }),
      async () => json(200, { success: true }),
    );
    const onResubmit = vi.fn();
    const out = await postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    expect(out).toMatchObject({ kind: "answered", ok: true, status: 200 });
    expect(onResubmit).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("is unconfirmed when the resend gets no answer either", async () => {
    const fetchFn = stubFetch(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => {
        throw new TypeError("Failed to fetch");
      },
    );
    const out = await postOrderWithResubmit(ENDPOINT, BODY, { onResubmit: vi.fn() });
    expect(out).toEqual({ kind: "unconfirmed" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
