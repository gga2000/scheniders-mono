import { beforeEach, describe, expect, it } from "vitest";
import { useLeadStore } from "./use-lead-store";

/*
 * The leads list kept its page number when what it shows changed. On page 3
 * of 45 leads, a status filter with 8 leads asked for rows 41 to 60, got
 * none, and the pager (shown only past one page) was gone too.
 */

const store = () => useLeadStore.getState();

beforeEach(() => {
  store().clearFilters();
  store().setViewMode("table");
  store().setPage(3);
});

describe("lead list page", () => {
  it.each([
    ["the view", () => store().setViewMode("kanban")],
    ["the sort", () => store().setSortBy("lead_score:desc")],
    ["the status filter", () => store().setStatusFilter("new")],
    ["the platform filter", () => store().setPlatformFilter("instagram")],
    ["the priority filter", () => store().setPriorityFilter("high")],
    ["the tier filter", () => store().setTierFilter("gold")],
    ["the industry filter", () => store().setIndustryFilter("fashion")],
    ["the assignee filter", () => store().setAssigneeFilter("someone")],
    ["the has-store filter", () => store().setHasStoreFilter(true)],
    ["the score range", () => store().setScoreRange([40, 100])],
    ["the search", () => store().setSearchQuery("ali")],
    ["clearing the filters", () => store().clearFilters()],
  ])("goes back to page 1 when %s changes", (_what, change) => {
    expect(store().page).toBe(3);
    change();
    expect(store().page).toBe(1);
  });

  it("never goes below page 1", () => {
    store().setPage(0);
    expect(store().page).toBe(1);
  });
});
