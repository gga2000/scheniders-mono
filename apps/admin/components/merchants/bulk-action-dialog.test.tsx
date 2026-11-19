// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Round 19 (UX new 2): bulk Change Plan moved every picked shop at the press,
 * with no reason and no word on what would happen. A plan decides what each
 * shop pays each month, so it now says what will happen before the press and
 * asks why, as the shop page's plan form does.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));

const { BulkActionDialog } = await import("./bulk-action-dialog");

const IDS = ["5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f", "6c1d0b63-8f4f-4d2b-8e3f-2b3c4d5e6f70"];

function dialog(ids = IDS) {
  return render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(BulkActionDialog, {
        action: "change-plan",
        selectedCount: ids.length,
        selectedIds: ids,
        onClose: () => {},
        onSuccess: () => {},
      }),
    ),
  );
}

const sentBody = () => JSON.parse(String((send.mock.calls[0][1] as RequestInit).body));

afterEach(() => {
  cleanup();
  send.mockReset();
});

describe("bulk Change Plan", () => {
  it("says what will happen before the press, in the merchant's plan words", () => {
    dialog();
    fireEvent.click(screen.getByRole("button", { name: "Internal (no billing)" }));

    expect(screen.getByText(/2 shops move to Internal \(no billing\) now\. Nothing is charged and nothing is refunded\./)).toBeTruthy();
  });

  it("says one shop moves when one is picked", () => {
    dialog(IDS.slice(0, 1));

    expect(screen.getByText(/1 shop moves to Start now\./)).toBeTruthy();
  });

  it("asks why before it sends anything", () => {
    dialog();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.getByText("Write a reason with at least 3 letters.")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the plan with the reason", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    dialog();
    fireEvent.click(screen.getByRole("button", { name: "Internal (no billing)" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: " Our own test shops " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(sentBody()).toEqual({
      action: "change_plan",
      tenant_ids: IDS,
      params: { plan: "internal", reason: "Our own test shops" },
    });
  });
});
