// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * "Mark contacted" on Trials saves a call in the support call log. When no
 * answer comes back, the call may be saved, so staff are told to look at Last
 * call before saving it again (console audit round 22).
 */

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: (input: string, init?: RequestInit) => fetch(input, init) }));

const { MarkContacted } = await import("./mark-contacted");

const SHOP = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  toast.success.mockClear();
  toast.error.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const saveDone = async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MarkContacted shopId={SHOP} shopName="Najaf Gifts" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Mark contacted" }));
  fireEvent.change(screen.getByLabelText("What Najaf Gifts said"), { target: { value: "Will add products tonight" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
  });
};

describe("Mark contacted", () => {
  it("saves the call with its note and says so", async () => {
    fetchMock.mockReturnValue(answer(200, { success: true }));
    await saveDone();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/support/calls");
    expect(JSON.parse(String(init.body))).toEqual({ tenantId: SHOP, outcome: "done", note: "Will add products tonight" });
    expect(toast.success).toHaveBeenCalledWith("Call on Najaf Gifts saved");
    expect(screen.getByRole("button", { name: "Mark contacted" })).toBeTruthy();
  });

  it("gives the route's own words when it refuses", async () => {
    fetchMock.mockReturnValue(answer(403, { error: "Only support staff can log calls" }));
    await saveDone();
    expect(toast.error).toHaveBeenCalledWith("Only support staff can log calls");
  });

  it.each([
    ["the connection drops", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a gateway answers with no words", () => Promise.resolve(new Response("<html>502</html>", { status: 502 }))],
  ])("never says the call was not saved when %s, and keeps the note", async (_case, reply) => {
    fetchMock.mockImplementation(reply);
    await saveDone();
    expect(toast.error).toHaveBeenCalledWith(
      "No answer came back, so the call on Najaf Gifts may be saved. Check Last call on its line before saving it again.",
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect((screen.getByLabelText("What Najaf Gifts said") as HTMLInputElement).value).toBe("Will add products tonight");
  });
});
