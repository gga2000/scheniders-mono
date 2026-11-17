// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/*
 * Stars are kept in this browser and on the server (admin_watchlist).
 * - On the first read in a browser with no stars of its own (a new device,
 *   a cleared browser), the console took every server star off and put it
 *   back: the note on the row was lost, and the star too if the two
 *   requests swapped.
 * - A star's save was sent with `.catch(() => {})` and its answer never
 *   read, so a refused or lost save left a star the server never kept.
 * Now the first read sends nothing, and a failed save is undone and said.
 */

vi.mock("@/hooks/use-watchlist", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-watchlist")>()),
  useWatchlist: () => ({ data: { watchlist: [{ tenant_id: "kept", note: "call Friday", created_at: "2026-11-16T09:00:00Z" }] } }),
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

let requests: string[] = [];
let answer: (method: string) => Response | Promise<Response> = () => new Response("{}");
vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  requests.push(`${method} ${url}`);
  return Promise.resolve().then(() => answer(method));
});

const { useAdminStore } = await import("@/store/use-admin-store");
const { WatchlistSync } = await import("./watchlist-sync");
const starred = () => [...useAdminStore.getState().starredMerchants].sort();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const mount = async (local: string[]) => {
  useAdminStore.setState({ starredMerchants: local });
  render(<WatchlistSync />);
  await settle();
};

beforeEach(() => {
  requests = [];
  answer = () => new Response("{}");
  toastError.mockReset();
});
afterEach(cleanup);

describe("WatchlistSync", () => {
  it("sends nothing on the first read in a browser with no stars of its own", async () => {
    await mount([]);

    expect(requests).toEqual([]);
    expect(starred()).toEqual(["kept"]);
  });

  it("saves a star this browser had before the server knew it, and only that", async () => {
    await mount(["local-only"]);

    expect(requests).toEqual(["POST /api/admin/watchlist"]);
    expect(starred()).toEqual(["kept", "local-only"]);
  });

  it("takes the star off again and says so when the server refuses it", async () => {
    await mount([]);
    answer = () => new Response("{}", { status: 500 });

    act(() => useAdminStore.getState().toggleStar("new"));
    await settle();

    expect(requests).toEqual(["POST /api/admin/watchlist"]);
    expect(starred()).toEqual(["kept"]);
    expect(toastError).toHaveBeenCalledWith("The star was not saved. Try again.");
  });

  it("puts the star back and says so when taking it off cannot reach the server", async () => {
    await mount([]);
    answer = () => Promise.reject(new TypeError("Failed to fetch"));

    act(() => useAdminStore.getState().toggleStar("kept"));
    await settle();

    expect(requests).toEqual(["DELETE /api/admin/watchlist/kept"]);
    expect(starred()).toEqual(["kept"]);
    expect(toastError).toHaveBeenCalledWith("The star was not taken off. Try again.");
  });

  it("keeps a saved star and says nothing", async () => {
    await mount([]);

    act(() => useAdminStore.getState().toggleStar("new"));
    await settle();

    expect(starred()).toEqual(["kept", "new"]);
    expect(toastError).not.toHaveBeenCalled();
  });
});
