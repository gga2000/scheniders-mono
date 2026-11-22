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

const { BulkActionDialog, bulkDoneWords, planMoveWords } = await import("./bulk-action-dialog");
const { toast } = await import("sonner");

const IDS = ["5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f", "6c1d0b63-8f4f-4d2b-8e3f-2b3c4d5e6f70"];

const client = new QueryClient();

function tree(action: string | null, ids = IDS, planOf?: ReadonlyMap<string, string>) {
  return createElement(
    QueryClientProvider,
    { client },
    createElement(BulkActionDialog, {
      action,
      selectedCount: ids.length,
      selectedIds: ids,
      planOf,
      onClose: () => {},
      onSuccess: () => {},
    }),
  );
}

function dialog(ids = IDS, action = "change-plan", planOf?: ReadonlyMap<string, string>) {
  return render(tree(action, ids, planOf));
}

const sentBody = (call = 0) => JSON.parse(String((send.mock.calls[call][1] as RequestInit).body));

/** Types a top-up note and presses Confirm on the preset 10,000 IQD. */
function topUp(note: string) {
  fireEvent.change(screen.getByPlaceholderText("e.g. Monthly credit bonus"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
}

const confirmWaits = () => screen.getByRole("button", { name: "Confirm" }).matches(":disabled");

afterEach(() => {
  cleanup();
  localStorage.clear();
  send.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
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

/*
 * Round 21 (structure new 1, UX new 1): a bulk top-up whose answer was lost
 * (a dropped connection, a gateway's 502 with no words) said "Failed to fetch"
 * in the dialog and "Top Up Wallets was not done." once staff had left. The
 * wallets may have been credited, and the natural retry credited them again.
 */
describe("a bulk write whose answer is lost", () => {
  const ANSWER_LOST_SHOPS = "No answer came back, so this may have been done. Check the shops before trying again.";

  it("says it may have been done when the connection drops", async () => {
    send.mockRejectedValue(new TypeError("Failed to fetch"));
    dialog(IDS, "top-up");
    topUp("Cash at the office");
    expect((await screen.findByText(ANSWER_LOST_SHOPS)).textContent).toBe(ANSWER_LOST_SHOPS);
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it("says it may have been done when a gateway answers 502 with no words", async () => {
    send.mockResolvedValue(new Response("An error occurred with your deployment", { status: 502 }));
    dialog(IDS, "top-up");
    topUp("Cash at the office");
    expect(await screen.findByText(ANSWER_LOST_SHOPS)).toBeTruthy();
    expect(screen.queryByText("Failed to execute bulk action")).toBeNull();
  });

  it("never says not done in the toast after staff left the page", async () => {
    let answer: (res: Response) => void = () => {};
    send.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const view = dialog(IDS, "top-up");
    topUp("Cash at the office");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    view.unmount();
    answer(new Response("upstream timed out", { status: 504 }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(`Top Up Wallets: ${ANSWER_LOST_SHOPS}`));
    expect(vi.mocked(toast.error).mock.calls.flat().join(" ")).not.toMatch(/not done/);
  });

  it("sends the same top-up with the same id after Merchants was left and opened again", async () => {
    send.mockRejectedValue(new TypeError("Failed to fetch"));
    const first = dialog(IDS, "top-up");
    topUp("Cash at the office");
    await screen.findByText(ANSWER_LOST_SHOPS);
    first.unmount();

    dialog(IDS, "top-up");
    topUp("Cash, office");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(sentBody(1).params.request_id).toBe(sentBody(0).params.request_id);
  });

  it("still says the server's own refusal as not done", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ error: "Made-up refusal." }), { status: 500 }));
    dialog(IDS, "top-up");
    topUp("Cash at the office");
    expect(await screen.findByText("Made-up refusal.")).toBeTruthy();
  });
});

/*
 * Round 20 (UX new 4 and new 6): bulk Top Up's reason was a plain box that
 * said the rule only after Confirm, Confirm stayed dark with a short reason
 * and did nothing, a step that went through closed in silence, and Change
 * Plan counted shops already on the plan as moving.
 */
describe("bulk reasons and outcomes", () => {
  it("keep Confirm grey until the reason has 3 letters, and Top Up's box says the rule", () => {
    dialog(IDS, "top-up");
    expect(confirmWaits()).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("e.g. Monthly credit bonus"), { target: { value: "Qi 12" } });
    expect(screen.getByText("Write a reason with at least 3 letters.")).toBeTruthy();
    expect(confirmWaits()).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("e.g. Monthly credit bonus"), { target: { value: "Qi transfer 12" } });
    expect(confirmWaits()).toBe(false);
  });

  it("keep Confirm grey for Change Plan and Extend Trial with no reason", () => {
    const view = dialog();
    expect(confirmWaits()).toBe(true);
    view.rerender(tree("extend-trial"));
    expect(confirmWaits()).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Slow first week" } });
    expect(confirmWaits()).toBe(false);
  });

  it("say what a top-up did when it went through", async () => {
    send.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          succeeded: [
            { tenant_id: IDS[0], new_balance: 10_000, duplicate: false },
            { tenant_id: IDS[1], new_balance: 10_000, duplicate: true },
          ],
        }),
        { status: 200 },
      ),
    );
    dialog(IDS, "top-up");
    topUp("Cash at the office");

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("10,000 IQD added to 1 wallet. 1 had it already and was not credited again."),
    );
  });

  it("say a plan move that went through", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ success: true, succeeded: IDS.map((id) => ({ tenant_id: id })) }), { status: 200 }));
    dialog();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Our own test shops" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 shops are on Start now."));
  });

  it("say which picked shops are on the plan already", () => {
    dialog(IDS, "change-plan", new Map([[IDS[0], "starter"], [IDS[1], "growth"]]));

    expect(screen.getByText("1 shop moves to Start now. 1 is on Start already and stays as it is. Nothing is charged and nothing is refunded.")).toBeTruthy();
  });

  it("word every outcome", () => {
    const all = { done: 3, failed: [], repeats: 0 };
    expect(bulkDoneWords("extend-trial", all, { days: 7 })).toBe("3 trials got 7 more days.");
    expect(bulkDoneWords("suspend", { ...all, done: 1 }, undefined)).toBe("1 shop suspended.");
    expect(bulkDoneWords("reactivate", all, undefined)).toBe("3 shops reactivated.");
    expect(bulkDoneWords("top-up", { ...all, repeats: 3 }, { amount_iqd: 5_000 })).toBe(
      "Every wallet had 5,000 IQD already, so nothing was added again.",
    );
    expect(planMoveWords(2, 2, "Start")).toBe("Every picked shop is on Start already, so nothing changes.");
    expect(planMoveWords(5, 2, "Pro")).toBe(
      "3 shops move to Pro now. 2 are on Pro already and stay as they are. Nothing is charged and nothing is refunded.",
    );
  });
});

/*
 * Round 21 (UX new 4 and 8): during a held write a click on Start changed the
 * sentence while Internal was written; Confirm was ready at 500 IQD and then
 * refused it; and with the picked shops emptied under the dialog, Confirm sent
 * an empty list.
 */
describe("the bulk dialog waits for what it sends", () => {
  it("holds the choices while the step is written", async () => {
    send.mockReturnValue(new Promise<never>(() => {}));
    dialog();
    fireEvent.click(screen.getByRole("button", { name: "Internal (no billing)" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Our own test shops" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start" }).matches(":disabled")).toBe(true));
    expect(screen.getByLabelText("Reason").matches(":disabled")).toBe(true);
    expect(screen.getByText(/2 shops move to Internal \(no billing\) now\./)).toBeTruthy();
  });

  it("keeps Confirm grey for an amount the server refuses, and says the rule", async () => {
    send.mockReturnValue(new Promise<never>(() => {}));
    dialog(IDS, "top-up");
    fireEvent.change(screen.getByPlaceholderText("e.g. Monthly credit bonus"), { target: { value: "Cash at the office" } });
    expect(confirmWaits()).toBe(false);
    const custom = screen.getByPlaceholderText("e.g. 100,000");
    for (const refused of ["500", "1500.5", "10000001"]) {
      fireEvent.change(custom, { target: { value: refused } });
      expect(confirmWaits()).toBe(true);
      expect(screen.getByText("A whole number from 1,000 IQD to 10,000,000 IQD.")).toBeTruthy();
    }
    fireEvent.change(custom, { target: { value: "1000" } });
    expect(confirmWaits()).toBe(false);
    expect(screen.queryByText(/A whole number from/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(sentBody().params.amount_iqd).toBe(1000);
  });

  it("keeps Confirm grey with no shops picked", () => {
    dialog([], "suspend");
    expect(confirmWaits()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(send).not.toHaveBeenCalled();
  });
});
