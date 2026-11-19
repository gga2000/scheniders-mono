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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { BulkActionDialog } = await import("./bulk-action-dialog");
const { toast } = await import("sonner");

const IDS = ["5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f", "6c1d0b63-8f4f-4d2b-8e3f-2b3c4d5e6f70"];

const client = new QueryClient();

function tree(action: string | null, ids = IDS) {
  return createElement(
    QueryClientProvider,
    { client },
    createElement(BulkActionDialog, {
      action,
      selectedCount: ids.length,
      selectedIds: ids,
      onClose: () => {},
      onSuccess: () => {},
    }),
  );
}

function dialog(ids = IDS, action = "change-plan") {
  return render(tree(action, ids));
}

const sentBody = (call = 0) => JSON.parse(String((send.mock.calls[call][1] as RequestInit).body));

/** Types a top-up note and presses Confirm on the preset 10,000 IQD. */
function topUp(note: string) {
  fireEvent.change(screen.getByPlaceholderText("e.g. Monthly credit bonus"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
}

afterEach(() => {
  cleanup();
  send.mockReset();
  vi.mocked(toast.error).mockReset();
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

/*
 * Round 20 (structure new 1 and 2): Cancel and the X closed the dialog while a
 * bulk write ran, so its outcome landed in a hidden dialog and was said
 * nowhere. And a top-up typed again with other words made a new request id,
 * so wallets already credited could be credited twice.
 */
describe("a bulk write", () => {
  it("keeps Cancel and the X waiting while it runs", async () => {
    send.mockReturnValue(new Promise<Response>(() => {}));
    dialog();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Our own test shops" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says a part-done outcome in a toast, naming the shops, when staff left the page", async () => {
    let answer: (res: Response) => void = () => {};
    send.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const view = dialog(IDS, "top-up");
    topUp("Cash at the office");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    view.unmount();
    answer(
      new Response(
        JSON.stringify({
          error: "Some shops were not done",
          succeeded: [IDS[0]],
          failed: [{ tenant_id: IDS[1], name: "Basra Shoes", error: "Wallet not found" }],
        }),
        { status: 500 },
      ),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Top Up Wallets: done for 1 of 2 merchants.", {
        description: "Not done for Basra Shoes: Wallet not found",
      }),
    );
  });

  it("says a refusal in a toast when staff left the page", async () => {
    let answer: (res: Response) => void = () => {};
    send.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const view = dialog();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Our own test shops" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    view.unmount();
    answer(new Response(JSON.stringify({ error: "Made-up refusal." }), { status: 409 }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Change Plan was not done. Made-up refusal."));
  });

  it("sends a top-up typed again with other words with the same request id", async () => {
    send.mockImplementation(async () => new Response(JSON.stringify({ error: "Made-up refusal." }), { status: 409 }));
    const view = dialog(IDS, "top-up");
    topUp("Cash at the office");
    await screen.findByText("Made-up refusal.");

    // Closed and opened again: the form starts empty, the words come out different.
    view.rerender(tree(null));
    view.rerender(tree("top-up"));
    topUp("cash, office");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));

    expect(sentBody(0).params.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sentBody(1).params.request_id).toBe(sentBody(0).params.request_id);
  });
});
