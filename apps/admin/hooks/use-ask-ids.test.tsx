// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";

/*
 * N8 (staff console audit): a lead's follow-up, a note on a lead and a note
 * on a shop carried no id, so Save pressed again after a lost answer saved a
 * second one. Each save now sends one id per ask, kept until it goes through.
 */
const adminFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch, timedOut: () => false }));

const { useSaveOnce } = await import("./use-ask-ids");
const { SAVED_ONCE_UNSURE } = await import("@/lib/answer-lost");

const URL = "/api/merchants/11111111-1111-4111-8111-111111111111/notes";

/** The request ids sent so far, in order. */
const sentIds = () =>
  adminFetch.mock.calls.map(([, init]) => (JSON.parse(String((init as RequestInit).body)) as { request_id: string }).request_id);

const saved = () => new Response(JSON.stringify({ note: { id: "n1" } }), { status: 201 });

beforeEach(() => adminFetch.mockReset());
afterEach(cleanup);

describe("useSaveOnce", () => {
  it("sends the same id after a lost answer, in words that say pressing again is safe", async () => {
    const { result } = renderHook(() => useSaveOnce());
    adminFetch.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(saved());

    await expect(result.current(URL, { content: "Called" }, SAVED_ONCE_UNSURE)).rejects.toThrow(SAVED_ONCE_UNSURE);
    await result.current(URL, { content: "Called" }, SAVED_ONCE_UNSURE);

    const [first, second] = sentIds();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  it("sends the same id after a gateway's wordless 504", async () => {
    const { result } = renderHook(() => useSaveOnce());
    adminFetch.mockResolvedValueOnce(new Response("<html>504</html>", { status: 504 })).mockResolvedValueOnce(saved());

    await expect(result.current(URL, { content: "Called" }, SAVED_ONCE_UNSURE)).rejects.toThrow(SAVED_ONCE_UNSURE);
    await result.current(URL, { content: "Called" }, SAVED_ONCE_UNSURE);

    expect(new Set(sentIds()).size).toBe(1);
  });

  it("makes a new ask of the same words once one went through, and of other words", async () => {
    const { result } = renderHook(() => useSaveOnce());
    adminFetch.mockImplementation(async () => saved());

    await result.current(URL, { content: "Called" }, SAVED_ONCE_UNSURE);
    await result.current(URL, { content: "Called" }, SAVED_ONCE_UNSURE);
    await result.current(URL, { content: "Called back" }, SAVED_ONCE_UNSURE);

    expect(new Set(sentIds()).size).toBe(3);
  });

  it("keeps the id of a refused ask, and shows the server's words", async () => {
    const { result } = renderHook(() => useSaveOnce());
    adminFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Merchant not found" }), { status: 404 }))
      .mockResolvedValueOnce(saved());

    await expect(result.current(URL, { content: "Called" }, SAVED_ONCE_UNSURE)).rejects.toThrow("Merchant not found");
    await result.current(URL, { content: "Called" }, SAVED_ONCE_UNSURE);

    expect(new Set(sentIds()).size).toBe(1);
  });
});
