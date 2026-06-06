import { describe, it, expect } from "vitest";
import { getNextStages } from "./lead-stage";

describe("getNextStages", () => {
  it("returns forward transitions for an active stage", () => {
    expect(getNextStages("new")).toEqual(["contacted", "lost"]);
    expect(getNextStages("interested")).toEqual(["store_built", "converted", "lost"]);
  });
  it("returns no transitions for a terminal converted lead", () => {
    expect(getNextStages("converted")).toEqual([]);
  });
  it("allows re-opening a lost lead", () => {
    expect(getNextStages("lost")).toEqual(["new"]);
  });
});
