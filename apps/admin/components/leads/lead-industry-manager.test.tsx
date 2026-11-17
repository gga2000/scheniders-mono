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
/** How many times the list was read. */
let reads = 0;
let answer: () => Response = () => new Response(JSON.stringify({ place: 2, of: 3 }));
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      reads += 1;
      return new Response(JSON.stringify({ industries: list }));
    }
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
  reads = 0;
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

  it("closes the confirm and reads the list again when a colleague removed it first", async () => {
    answer = () => new Response(JSON.stringify({ error: "This industry no longer exists." }), { status: 404 });

    await pressDelete("Perfume");

    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("This industry no longer exists.");
    expect(screen.queryByText(/If leads use it, it is switched off instead/)).toBeNull();
    expect(reads).toBe(2);
  });

  it("keeps the confirm open when the delete failed for another reason", async () => {
    answer = () => new Response(JSON.stringify({ error: "Failed to delete industry" }), { status: 500 });

    await pressDelete("Perfume");

    expect(toastError).toHaveBeenCalledWith("Failed to delete industry");
    expect(screen.getByText(/If leads use it, it is switched off instead/)).toBeTruthy();
  });
});

/*
 * Round 10: an edit saved after a colleague removed the industry ended in a
 * plain 500 and left the row open. It now says the industry no longer
 * exists and closes the row. A name another industry has is refused (one
 * industry per name) and the row stays open with what was typed.
 */
describe("LeadIndustryManager edit", () => {
  /** Opens the row, renames the industry (when asked) and saves. */
  async function saveEdit(name: string, rename: string | null = `${name} and more`) {
    await open();
    fireEvent.click(await screen.findByRole("button", { name: `Edit ${name}` }));
    if (rename !== null) fireEvent.change(screen.getByPlaceholderText("Name (English)"), { target: { value: rename } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await settle();
  }

  // Round 11: the row sent all five fields, so a rename also wrote back the
  // color and average order it opened with, over a colleague's change.
  it("sends only the field that was changed", async () => {
    answer = () => new Response(JSON.stringify({ industry: {} }));

    await saveEdit("Tools", "  Hardware ");

    expect(requests).toEqual(["PATCH /api/industries/a0000000-0000-4000-8000-000000000002 {\"name\":\"Hardware\"}"]);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("closes a row saved with nothing changed, and sends nothing", async () => {
    await saveEdit("Tools", null);

    expect(requests).toEqual([]);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("closes the row and reads the list again when a colleague removed the industry first", async () => {
    answer = () => new Response(JSON.stringify({ error: "This industry no longer exists." }), { status: 404 });

    await saveEdit("Tools");

    expect(requests).toHaveLength(1);
    expect(toastError).toHaveBeenCalledWith("This industry no longer exists.");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(reads).toBe(2);
  });

  it("keeps the row open and says so when another industry has the name", async () => {
    answer = () => new Response(JSON.stringify({ error: "An industry with this name already exists." }), { status: 409 });

    await saveEdit("Tools");

    expect(toastError).toHaveBeenCalledWith("An industry with this name already exists.");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });
});
