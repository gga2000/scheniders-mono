import { beforeEach, describe, expect, it, vi } from "vitest";

// The store keeps the view and columns in localStorage; tests run without a browser.
const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
});
const { merchantFiltersOn, useAdminStore } = await import("./use-admin-store");

/*
 * Ticks survived a search. Tick #100095, search "100012", tick it: the list
 * showed one shop, the bar said "2 selected", and a bulk Top Up of 20,000 IQD
 * went to both, with no shop named in the dialog. A change of what the list
 * shows now drops the ticks.
 */

const store = () => useAdminStore.getState();

beforeEach(() => {
  store().clearFilters();
  store().toggleMerchantSelection("shop-a");
  store().toggleMerchantSelection("shop-b");
  store().setLastSelectedIndex(1);
});

describe("merchant ticks", () => {
  it.each([
    ["the search", () => store().setSearchQuery("100012")],
    ["the plan filter", () => store().setPlanFilter("growth")],
    ["the status filter", () => store().setStatusFilter("trial")],
    ["the city filter", () => store().setCityFilter("baghdad")],
    ["the balance filter", () => store().setBalanceFilter("low")],
    ["the health filter", () => store().setHealthFilter("at_risk")],
    ["the date range", () => store().setDateRange({ from: "2026-11-01", to: null })],
  ])("go when %s changes", (_name, change) => {
    change();
    expect(store().selectedMerchants.size).toBe(0);
    expect(store().lastSelectedIndex).toBeNull();
  });

  it("go when the filters are cleared", () => {
    store().setSearchQuery("kut");
    store().toggleMerchantSelection("shop-c");
    store().clearFilters();
    expect(store().selectedMerchants.size).toBe(0);
  });

  it("stay when a filter is set to the value it already has", () => {
    store().setSearchQuery("");
    store().setStatusFilter(null);
    store().setDateRange({ from: null, to: null });
    expect([...store().selectedMerchants]).toEqual(["shop-a", "shop-b"]);
  });

  it("stay when only the sort or the view changes, which hide no shop", () => {
    store().toggleSort("business");
    store().setViewMode("table");
    expect(store().sortConfig).toEqual([{ column: "business", direction: "asc" }]);
    expect(store().selectedMerchants.size).toBe(2);
  });
});

/*
 * Stars were kept in this browser too: every login on it shared them, and the
 * next person's first star sent the last person's to the server. They are the
 * signed-in person's own (admin_watchlist), so the browser keeps none.
 */
describe("stars", () => {
  it("are not kept in this browser", () => {
    store().toggleStar("shop-a");

    const saved = JSON.parse(memory.get("admin-ui-store") ?? "{}");
    expect(saved.state).toBeDefined();
    expect(saved.state).not.toHaveProperty("starredMerchants");
  });

  it("stored by an earlier version are not read back", async () => {
    useAdminStore.setState({ starredMerchants: [] });
    memory.set(
      "admin-ui-store",
      JSON.stringify({ state: { viewMode: "table", starredMerchants: ["last-persons-shop"] }, version: 0 }),
    );

    await useAdminStore.persist.rehydrate();

    expect(store().starredMerchants).toEqual([]);
    expect(store().viewMode).toBe("table");
  });
});


/*
 * Round 16: Merchants with "Today" picked and no shop signed up today said
 * "No merchants yet. Merchants will appear here once they sign up", as if
 * there were none at all: the date range did not count as a filter.
 */
describe("merchantFiltersOn", () => {
  beforeEach(() => store().clearFilters());

  it("is off with no filter, and the search alone does not count", () => {
    expect(merchantFiltersOn(store())).toBe(false);
    store().setSearchQuery("kut");
    expect(merchantFiltersOn(store())).toBe(false);
  });

  it.each([
    ["the plan filter", () => store().setPlanFilter("growth")],
    ["the status filter", () => store().setStatusFilter("trial")],
    ["the city filter", () => store().setCityFilter("baghdad")],
    ["the balance filter", () => store().setBalanceFilter("low")],
    ["the health filter", () => store().setHealthFilter("at_risk")],
    ["a date range's first day", () => store().setDateRange({ from: "2026-11-18", to: null })],
    ["a date range's last day", () => store().setDateRange({ from: null, to: "2026-11-18" })],
  ])("is on with %s, and off again once the filters are cleared", (_name, set) => {
    set();
    expect(merchantFiltersOn(store())).toBe(true);
    store().clearFilters();
    expect(merchantFiltersOn(store())).toBe(false);
  });
});
