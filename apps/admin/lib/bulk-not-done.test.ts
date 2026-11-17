import { describe, expect, it } from "vitest";
import { BULK_MAX_SHOPS, isBulkFailureList, notDoneLines, tooManyShops } from "./bulk-not-done";

/*
 * Round 6: a bulk action that was not done for some shops said only "2 not
 * done: <reason>", and a failed top-up showed the database's own words. Staff
 * could not tell which shops to look at.
 */

const NO_WALLET = "This shop has no wallet yet, so nothing was added.";
const PAUSED = "This shop is paused. Resume it first.";
const shop = (n: number, error: string, name: string | null = `Shop ${n}`) => ({ tenant_id: `t-${n}`, name, error });

describe("the lines for shops a bulk action did not do", () => {
  it("names the shops under each reason", () => {
    expect(notDoneLines([shop(1, NO_WALLET), shop(2, PAUSED), shop(3, NO_WALLET)])).toEqual([
      `Not done for Shop 1 and Shop 3: ${NO_WALLET}`,
      `Not done for Shop 2: ${PAUSED}`,
    ]);
  });

  it("counts the shops past three, and the ones whose name could not be read", () => {
    expect(notDoneLines([1, 2, 3, 4, 5].map((n) => shop(n, NO_WALLET)))).toEqual([
      `Not done for Shop 1, Shop 2, Shop 3 and 2 more: ${NO_WALLET}`,
    ]);
    expect(notDoneLines([shop(1, NO_WALLET), shop(2, NO_WALLET, null)])).toEqual([
      `Not done for Shop 1 and 1 more: ${NO_WALLET}`,
    ]);
  });

  it("says how many when no name could be read", () => {
    expect(notDoneLines([shop(1, PAUSED, null), shop(2, PAUSED, null)])).toEqual([`2 not done: ${PAUSED}`]);
  });
});

describe("a bulk answer's list of shops not done", () => {
  it("takes names that are text, missing or null", () => {
    expect(isBulkFailureList([{ tenant_id: "t", error: "x" }, { tenant_id: "u", error: "y", name: null }, shop(1, "z")])).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isBulkFailureList(null)).toBe(false);
    expect(isBulkFailureList([{ tenant_id: "t" }])).toBe(false);
    expect(isBulkFailureList([{ tenant_id: "t", error: "x", name: 4 }])).toBe(false);
  });
});

/*
 * Round 7: "Select all" on more than 100 shops answered "Invalid input", and
 * the dialog showed nothing staff could act on. Now it says how many to pick.
 */
describe("the most shops one bulk action takes", () => {
  it("lets up to the limit through", () => {
    expect(tooManyShops(1)).toBeNull();
    expect(tooManyShops(BULK_MAX_SHOPS)).toBeNull();
  });

  it("says the limit and how many were ticked past it", () => {
    expect(tooManyShops(1500)).toBe("Pick at most 100 shops (1,500 ticked).");
  });
});
