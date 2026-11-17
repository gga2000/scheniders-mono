import { describe, expect, it } from "vitest";
import { leadsCountLine, pageAfterShrink } from "./leads-count";

/*
 * Round 5 of the staff console audit: the Leads header read "0 leads in the
 * pipeline" while the list was loading and above "Failed to load leads".
 */

describe("the Leads header line", () => {
  it("counts the leads once they are read", () => {
    expect(leadsCountLine({ count: 1240, isError: false })).toBe("1,240 leads in the pipeline");
    expect(leadsCountLine({ count: 1, isError: false })).toBe("1 lead in the pipeline");
    expect(leadsCountLine({ count: 0, isError: false })).toBe("0 leads in the pipeline");
  });

  it("never says 0 while the read is running", () => {
    expect(leadsCountLine({ count: undefined, isError: false })).toBe("Counting leads...");
  });

  it("says the count failed, even over an older count", () => {
    expect(leadsCountLine({ count: undefined, isError: true })).toBe("Could not count the leads");
    expect(leadsCountLine({ count: 40, isError: true })).toBe("Could not count the leads");
  });
});

/*
 * Round 13 (Reliability new 1). A page past the end of a list that shrank
 * showed no rows; the table now moves to the new last page.
 */
describe("a page past the end", () => {
  it("moves to the new last page", () => {
    expect(pageAfterShrink(3, 28)).toBe(2);
    expect(pageAfterShrink(2, 20)).toBe(1);
    expect(pageAfterShrink(4, 0)).toBe(1);
  });

  it("stays while the page is in the list", () => {
    expect(pageAfterShrink(2, 21)).toBeNull();
    expect(pageAfterShrink(1, 0)).toBeNull();
  });
});
