import { describe, expect, it } from "vitest";
import { leadsCountLine } from "./leads-count";

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
