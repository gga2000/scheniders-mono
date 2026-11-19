// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Round 19 (UX new 1): the shop page's panels closed on Escape or a click
 * outside while their write ran. Closing threw the form away, so a refusal
 * that came back was said nowhere, and Add money opened again made a new
 * request id: a top-up whose answer was lost could be credited twice. A panel
 * now stays open while its write runs, and the page keeps the request ids.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role: "super_admin" }) }));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { ShopActions } = await import("./shop-actions");
const { toast } = await import("sonner");

const SHOP = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const refused = () => new Response(JSON.stringify({ error: "Made-up refusal." }), { status: 409 });

function page() {
  return render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(ShopActions, {
        shopId: SHOP,
        shopName: "Kut Perfumes",
        facts: { status: "trial", locked: false, subscriptionRunning: false, demo: false, prospect: false },
        plan: "starter",
        balance: 0,
        freeDaysFrom: null,
        comeback: "trial",
        trialEndsAt: null,
        onGiveOrders: () => {},
        onAddNote: () => {},
      }),
    ),
  );
}

/** Opens Add money and presses "Add 5,000 IQD" with a reason. */
function addFiveThousand(how = "Cash at the office") {
  fireEvent.click(screen.getByRole("button", { name: "Add money" }));
  fireEvent.click(screen.getByRole("button", { name: "5,000" }));
  fireEvent.change(screen.getByPlaceholderText("How did it come? Cash at the office, transfer..."), {
    target: { value: how },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add 5,000 IQD" }));
}

/** Opens Give free days and gives the trial its preset days with a reason. */
function giveFreeDays(why: string) {
  fireEvent.click(screen.getByRole("button", { name: "Give free days" }));
  fireEvent.change(screen.getByPlaceholderText("Why? (saved in the log)"), { target: { value: why } });
  fireEvent.click(screen.getByRole("button", { name: /^Give \d+ free days$/ }));
}

/** Opens More, then "Start free time, no charge", and starts 30 days with a reason. */
function startFreeTime(why: string) {
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("button", { name: "Start free time, no charge" }));
  fireEvent.change(screen.getByPlaceholderText("Why? Paid in cash for a year..."), { target: { value: why } });
  fireEvent.click(screen.getByRole("button", { name: "Start 30 days free" }));
}

/**
 * Sends a panel's ask, which is refused, closes the panel, opens it again and
 * sends the same ask with the reason typed anew in other words.
 */
async function askTwice(first: () => void, again: () => void) {
  send.mockImplementation(async () => refused());
  page();
  first();
  await screen.findByRole("alert");
  tryToClose();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  again();
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  return sentIds();
}

/** Escape and a click outside: both closed the panel before. */
function tryToClose() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.pointerDown(document.body);
}

const sentIds = () => send.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).request_id);

afterEach(() => {
  cleanup();
  send.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
});

describe("the shop page's panels", () => {
  it("stay open while a top-up runs, so a slow refusal is still said", async () => {
    let answer: (res: Response) => void = () => {};
    send.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    page();
    addFiveThousand();
    await screen.findByRole("button", { name: "Adding..." });

    tryToClose();
    expect(screen.queryByRole("dialog")).not.toBeNull();

    answer(refused());
    expect((await screen.findByRole("alert")).textContent).toBe("Made-up refusal.");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("send the same top-up with the same request id from a reopened panel", async () => {
    send.mockImplementation(async () => refused());
    page();
    addFiveThousand();
    await screen.findByRole("alert");

    // The answer is in: now the panel closes, and its form goes with it.
    tryToClose();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    addFiveThousand();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const [first, second] = sentIds();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  it("keep the top-up's request id when the reason is typed anew in other words", async () => {
    // Round 20: the id was keyed by the reason's words, and a reopened panel
    // starts empty, so a retry typed differently credited the wallet twice.
    const [first, second] = await askTwice(
      () => addFiveThousand("Cash at office, Ahmed"),
      () => addFiveThousand("Cash at the office (Ahmed)"),
    );
    expect(second).toBe(first);
  });

  it("keep the free days' request id across a reopened panel and new words", async () => {
    const [first, second] = await askTwice(
      () => giveFreeDays("Slow start, week one"),
      () => giveFreeDays("Slow first week"),
    );
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  it("keep the free time's request id across a reopened panel and new words", async () => {
    const [first, second] = await askTwice(
      () => startFreeTime("Paid cash for a year"),
      () => startFreeTime("Cash, one year"),
    );
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  it("say so when the top-up was already added, so a retry is not read as a second one", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ success: true, new_balance: 5_000, duplicate: true }), { status: 200 }));
    page();
    addFiveThousand();

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("5,000 IQD was already added to Kut Perfumes, so it was not added again."),
    );
  });

  it("let Back wait in More while a step runs", async () => {
    send.mockReturnValue(new Promise<Response>(() => {}));
    page();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause for some days" }));
    fireEvent.change(screen.getByPlaceholderText("Why? (the shop page shows it)"), { target: { value: "Late payments" } });
    fireEvent.click(screen.getByRole("button", { name: /^Pause/ }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
    tryToClose();
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("say a refusal in a toast, naming the shop, when it lands after the page is gone", async () => {
    let answer: (res: Response) => void = () => {};
    send.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const view = page();
    addFiveThousand();
    await screen.findByRole("button", { name: "Adding..." });

    view.unmount();
    answer(refused());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No money was added to Kut Perfumes. Made-up refusal."));
  });
});
