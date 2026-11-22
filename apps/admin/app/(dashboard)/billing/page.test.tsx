// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Round 17 (Workflow new 4): Quick Top-Up kept the last press's answer under
 * the form. A refusal for one shop sat under the next shop's sentence, and a
 * change made while a top-up ran was named on the button, then wiped by the
 * answer. A change to the form now clears the last answer, and the form is
 * held while a top-up runs.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));
vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true, useAdminAuth: () => ({ isLoading: false }) }));
vi.mock("@/components/shared/export-button", () => ({ ExportButton: () => null }));

const { default: BillingPage } = await import("./page");

const wallet = (tenant_id: string, business_name: string, balance_iqd: number) => ({
  tenant_id,
  business_name,
  plan: "starter",
  status: "active",
  balance_iqd,
  threshold_iqd: 5000,
  total_charged_iqd: 0,
  total_topped_up_iqd: 0,
});
const BILLING = {
  wallets: [wallet("t-kut", "Kut Perfumes", 43800), wallet("t-demo", "Demo Shop", 0)],
  recentTransactions: [],
  summary: { totalBalance: 43800, totalCharged: 0, totalToppedUp: 0, lowBalanceCount: 1 },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Answers the page's read, and hands each top-up to `topUp`. */
function serve(topUp: () => Promise<Response>) {
  send.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "POST" ? topUp() : Promise.resolve(json(BILLING)),
  );
}

async function fill(shop: string, amount: string) {
  render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(BillingPage)));
  await screen.findByRole("option", { name: /Kut Perfumes/ });
  const select = screen.getByDisplayValue("Select merchant...") as HTMLSelectElement;
  fireEvent.change(select, { target: { value: shop } });
  fireEvent.change(screen.getByPlaceholderText("Custom amount"), { target: { value: amount } });
  fireEvent.change(screen.getByPlaceholderText("e.g. Qi transfer, receipt 12"), { target: { value: "Qi transfer, receipt 12" } });
  return select;
}

afterEach(() => {
  cleanup();
  send.mockReset();
});

describe("Quick Top-Up after a press", () => {
  it("drops a refusal once the shop is changed, so it is not read as about the next shop", async () => {
    serve(() => Promise.resolve(json({ error: "This shop has no wallet yet." }, 404)));
    const select = await fill("t-demo", "25000");
    fireEvent.click(screen.getByRole("button", { name: "Add 25,000 IQD" }));
    expect(await screen.findByText("This shop has no wallet yet.")).toBeTruthy();
    fireEvent.change(select, { target: { value: "t-kut" } });
    expect(screen.getByText("Adds 25,000 IQD to Kut Perfumes. Its wallet holds 43,800 IQD now.")).toBeTruthy();
    expect(screen.queryByText("This shop has no wallet yet.")).toBeNull();
  });

  it("drops the last success once a new top-up is started", async () => {
    serve(() => Promise.resolve(json({ newBalance: 93800 })));
    await fill("t-kut", "50000");
    fireEvent.click(screen.getByRole("button", { name: "Add 50,000 IQD" }));
    expect(await screen.findByText(/Added 50,000 IQD to Kut Perfumes\. Wallet now 93,800 IQD\./)).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("Select merchant..."), { target: { value: "t-demo" } });
    expect(screen.queryByText(/Added 50,000 IQD/)).toBeNull();
  });

  it("holds the form while a top-up runs, so nothing typed then is lost", async () => {
    let answer: (res: Response) => void = () => {};
    serve(() => new Promise<Response>((resolve) => (answer = resolve)));
    const select = await fill("t-kut", "50000");
    fireEvent.click(screen.getByRole("button", { name: "Add 50,000 IQD" }));
    await waitFor(() => expect(select.disabled).toBe(true));
    expect((screen.getByPlaceholderText("Custom amount") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByPlaceholderText("e.g. Qi transfer, receipt 12") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "250,000" }) as HTMLButtonElement).disabled).toBe(true);
    answer(json({ newBalance: 93800 }));
    await waitFor(() => expect(select.disabled).toBe(false));
    expect(send.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});

/*
 * Round 21 (structure new 2, UX new 9): a gateway's 504 with a text body made
 * Quick Top-Up show the JSON parser's words, and a retry the server had done
 * already read "Added 50,000 IQD", so a second cash receipt got written down.
 */
describe("Quick Top-Up when the answer is lost or repeated", () => {
  const ANSWER_LOST = "No answer came back, so this may have been done. Check the shop before trying again.";

  it("says the answer was lost, not a parser's words, on a 504 with a text body", async () => {
    serve(() => Promise.resolve(new Response("An error occurred with your deployment", { status: 504 })));
    await fill("t-kut", "50000");
    fireEvent.click(screen.getByRole("button", { name: "Add 50,000 IQD" }));
    expect(await screen.findByText(ANSWER_LOST)).toBeTruthy();
    expect(screen.queryByText(/JSON/)).toBeNull();
  });

  it("says the answer was lost when the connection drops", async () => {
    serve(() => Promise.reject(new TypeError("Failed to fetch")));
    await fill("t-kut", "50000");
    fireEvent.click(screen.getByRole("button", { name: "Add 50,000 IQD" }));
    expect(await screen.findByText(ANSWER_LOST)).toBeTruthy();
  });

  it("says a repeat was not added again", async () => {
    serve(() => Promise.resolve(json({ success: true, newBalance: 93800, duplicate: true })));
    await fill("t-kut", "50000");
    fireEvent.click(screen.getByRole("button", { name: "Add 50,000 IQD" }));
    expect(
      await screen.findByText(
        /50,000 IQD was already added to Kut Perfumes, so it was not added again\. Wallet now 93,800 IQD\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/^Added 50,000 IQD/)).toBeNull();
  });
});
