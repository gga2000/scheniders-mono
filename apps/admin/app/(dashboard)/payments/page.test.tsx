// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Round 21 (UX new 7): Refuse's box said "Write a reason with at least 3
 * letters." and its button was ready at "Qi 12", three characters with two
 * letters. The shop would read that as why its receipt was refused.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role: "super_admin" }) }));

const { default: PaymentsPage } = await import("./page");
const { ANSWER_LOST } = await import("@/components/merchants/detail/action-ui");

const REQUEST = {
  id: "7a1c2d3e-0000-4000-8000-000000000001",
  tenant_id: "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  display_id: 100095,
  business_name: "Kut Perfumes",
  tenant_status: "active",
  amount_iqd: 9000,
  method: "qi_card",
  created_at: "2026-11-22T10:00:00Z",
  balance_iqd: 3000,
  billing: { locked: false, reason: null, plan: "starter", price_iqd: 9000, renewal_off: false },
  same_file: [],
  same_amount_recent: 0,
  receipt_url: null,
  receipt_kind: "image",
};

afterEach(() => {
  cleanup();
  send.mockReset();
});

describe("Refuse a receipt", () => {
  it("waits for a reason with 3 letters, as its rule line says", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ requests: [REQUEST] }), { status: 200 }));
    render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(PaymentsPage)));
    fireEvent.click(await screen.findByRole("button", { name: "Refuse" }));
    const box = screen.getByPlaceholderText("Why? The shop will read this");
    const refuse = () => screen.getByRole("button", { name: "Refuse" }).matches(":disabled");

    fireEvent.change(box, { target: { value: "Qi 12" } });
    expect(refuse()).toBe(true);
    fireEvent.change(box, { target: { value: "Wrong account" } });
    expect(refuse()).toBe(false);
    // Any script: three Arabic letters are a reason.
    fireEvent.change(box, { target: { value: "خطأ" } });
    expect(refuse()).toBe(false);
  });
});

/*
 * Round 22: Approve read its own answer. A gateway's 504 said "Decision
 * failed: 504" and a dropped connection said the browser's "Failed to fetch",
 * though the money may have been added; every other money screen says so.
 */
describe("Approve when no answer comes back", () => {
  const approveWith = async (post: () => Promise<Response>) => {
    send.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "POST" ? post() : Promise.resolve(new Response(JSON.stringify({ requests: [REQUEST] }), { status: 200 })),
    );
    render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(PaymentsPage)));
    fireEvent.click(await screen.findByRole("button", { name: "Add 9,000 IQD" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, add it" }));
  };

  it("says the money may have been added when the gateway answers 504", async () => {
    await approveWith(() => Promise.resolve(new Response("upstream timed out", { status: 504 })));
    expect(await screen.findByText(ANSWER_LOST)).toBeTruthy();
    expect(screen.queryByText(/Decision failed/)).toBeNull();
  });

  it("says the same when the connection drops", async () => {
    await approveWith(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await screen.findByText(ANSWER_LOST)).toBeTruthy();
    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });

  it("still gives the server's own words for a refusal", async () => {
    await approveWith(() => Promise.resolve(new Response(JSON.stringify({ error: "Amount is above what the shop sent" }), { status: 400 })));
    expect(await screen.findByText("Amount is above what the shop sent")).toBeTruthy();
  });

  it("says a receipt decided first changed nothing", async () => {
    await approveWith(() => Promise.resolve(new Response(JSON.stringify({ outcome: "approved" }), { status: 409 })));
    await waitFor(() => expect(send.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));
    expect(screen.queryByText(ANSWER_LOST)).toBeNull();
  });
});
