// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
