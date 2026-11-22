// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/*
 * Fermi B12 item 2, team copy: on each shop on trial, staff copy its trial
 * report as one WhatsApp message, the words the merchant reads on Home.
 */

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: (input: string, init?: RequestInit) => fetch(input, init) }));

const { CopyTrialReport } = await import("./copy-trial-report");

const SHOP = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const TEXT = "تقرير تجربتك من 12 تشرين الثاني لليوم (5 أيام)\nبهالأسبوع: طلباتك 23";
const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  toast.success.mockClear();
  toast.error.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const press = async () => {
  render(<CopyTrialReport shopId={SHOP} shopName="Najaf Gifts" />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy report for WhatsApp" }));
  });
};

describe("Copy report for WhatsApp", () => {
  it("copies the shop's report message and says so", async () => {
    fetchMock.mockReturnValue(answer(200, { text: TEXT, lines: [] }));
    await press();
    expect(fetchMock).toHaveBeenCalledWith(`/api/merchants/${SHOP}/trial-report`, undefined);
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(toast.success).toHaveBeenCalledWith("Najaf Gifts's report copied. Paste it in WhatsApp.");
  });

  it("copies nothing when the report does not load, and says why", async () => {
    fetchMock.mockReturnValue(answer(404, { error: "Merchant not found" }));
    await press();
    expect(writeText).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Merchant not found");
  });

  it("says so when no answer comes back, and stops the spinner", async () => {
    fetchMock.mockReturnValue(Promise.reject(new TypeError("Failed to fetch")));
    await press();
    expect(writeText).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("The report did not load: no answer came back. Try again.");
    expect((screen.getByRole("button", { name: "Copy report for WhatsApp" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says so when the browser refuses the copy", async () => {
    fetchMock.mockReturnValue(answer(200, { text: TEXT }));
    writeText.mockReturnValue(Promise.reject(new Error("denied")));
    await press();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("The browser did not let the report be copied. Try again.");
  });
});
