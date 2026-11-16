import { describe, it, expect } from "vitest";
import { LEAD_STATUS_FLOW, type LeadStatus } from "@/types/leads";
import { MANUAL_LEAD_STATUSES } from "@/lib/lead-update";
import { getNextStages } from "./lead-stage";

describe("getNextStages", () => {
  it("returns forward transitions for an active stage", () => {
    expect(getNextStages("new")).toEqual(["contacted", "lost"]);
    expect(getNextStages("interested")).toEqual(["store_built", "lost"]);
  });
  it("never offers Converted by hand: it comes only from Convert", () => {
    const manual: readonly LeadStatus[] = MANUAL_LEAD_STATUSES;
    for (const moves of Object.values(LEAD_STATUS_FLOW)) {
      for (const to of moves) expect(manual).toContain(to);
    }
    expect(getNextStages("store_built")).toEqual(["lost"]);
  });
  it("returns no transitions for a terminal converted lead", () => {
    expect(getNextStages("converted")).toEqual([]);
  });
  it("allows re-opening a lost lead", () => {
    expect(getNextStages("lost")).toEqual(["new"]);
  });
});
