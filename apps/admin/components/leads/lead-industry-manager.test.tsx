// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Moving an industry was two saves that traded sort_order with the
 * neighbour. Two industries added from the console both have 0, so the trade
 * changed nothing; a refused second save left two sharing a number. Now one
 * request moves it, and the server renumbers the list.
 */

const list = [
  { id: "a0000000-0000-4000-8000-000000000001", name: "Perfume", sort_order: 0 },
  { id: "a0000000-0000-4000-8000-000000000002", name: "Tools", sort_order: 0 },
  { id: "a0000000-0000-4000-8000-000000000003", name: "Fashion", sort_order: 1 },
].map((i) => ({ ...i, name_ar: null, icon: "Building2", color: "#6B7280", avg_order_value_iqd: 25000, is_active: true, created_at: "2026-11-17T00:00:00Z" }));

let requests: string[] = [];
let answer: () => Response = () => new Response(JSON.stringify({ place: 2, of: 3 }));
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return new Response(JSON.stringify({ industries: list }));
    requests.push(`${method} ${url} ${init?.body ?? ""}`);
    return answer();
  },
}));
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) } }));

const { LeadIndustryManager } = await import("./lead-industry-manager");
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LeadIndustryManager isOpen onClose={() => {}} />
    </QueryClientProvider>,
  );
  await settle();
}

beforeEach(() => {
  requests = [];
  answer = () => new Response(JSON.stringify({ place: 2, of: 3 }));
  toastError.mockReset();
  toastSuccess.mockReset();
});
afterEach(cleanup);

describe("LeadIndustryManager moves", () => {
  it("moves an industry past a neighbour with the same number in one request", async () => {
    await open();

    fireEvent.click(await screen.findByRole("button", { name: "Move Perfume down" }));
    await settle();

    expect(requests).toEqual([`POST /api/industries/${list[0].id}/move {"direction":"down"}`]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says so when the server refuses the move", async () => {
    await open();
    answer = () => new Response(JSON.stringify({ error: "This industry no longer exists." }), { status: 404 });

    fireEvent.click(await screen.findByRole("button", { name: "Move Fashion up" }));
    await settle();

    expect(requests).toEqual([`POST /api/industries/${list[2].id}/move {"direction":"up"}`]);
    expect(toastError).toHaveBeenCalledWith('Could not move "Fashion": This industry no longer exists.');
  });
});

/*
 * Delete asked "This industry will be permanently removed" every time (the
 * lead count was a placeholder, always 0), while the server switched off an
 * industry leads use. Now the dialog says both cases and staff are told which
 * one happened.
 */
describe("LeadIndustryManager delete", () => {
  async function pressDelete(name: string) {
    await open();
    fireEvent.click(await screen.findByRole("button", { name: `Delete ${name}` }));
    expect(screen.getByText(/If leads use it, it is switched off instead and those leads keep it\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await settle();
  }

  it("says an industry leads use was switched off, not removed", async () => {
    answer = () => new Response(JSON.stringify({ result: "switched_off", leads_using_it: 3 }));

    await pressDelete("Fashion");

    expect(requests).toEqual([`DELETE /api/industries/${list[2].id} `]);
    expect(toastSuccess).toHaveBeenCalledWith('"Fashion" switched off. 3 leads still use it, so it was not removed.');
  });

  it("says an industry no lead uses was removed", async () => {
    answer = () => new Response(JSON.stringify({ result: "removed" }));

    await pressDelete("Tools");

    expect(toastSuccess).toHaveBeenCalledWith('"Tools" removed.');
  });

  it("says why when the server refuses", async () => {
    answer = () => new Response(JSON.stringify({ error: "This industry no longer exists." }), { status: 404 });

    await pressDelete("Perfume");

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("This industry no longer exists.");
  });
});
