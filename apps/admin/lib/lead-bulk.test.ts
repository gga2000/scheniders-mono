import { describe, expect, it } from "vitest";
import { bulkLeadSchema, bulkResultText } from "./lead-bulk";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const done = (found: number, changed: number) => ({ success: true as const, found, changed });

describe("bulkResultText", () => {
  it("says how many leads changed and how many were so already", () => {
    const body = { action: "change_status" as const, lead_ids: ids(5), payload: { status: "contacted" as const } };
    expect(bulkResultText(body, done(5, 3))).toBe("Marked 3 leads as Contacted. 2 were Contacted already.");
    expect(bulkResultText(body, done(5, 5))).toBe("Marked 5 leads as Contacted.");
    expect(bulkResultText(body, done(5, 0))).toBe("Nothing changed. 5 were Contacted already.");
  });

  it("says which leads are yours now", () => {
    const body = { action: "assign_to_me" as const, lead_ids: ids(3) };
    expect(bulkResultText(body, done(3, 1))).toBe("1 lead is yours now. 2 were yours already.");
    expect(bulkResultText(body, done(3, 3))).toBe("3 leads are yours now.");
  });

  it("counts the deleted leads and the ones someone removed meanwhile", () => {
    const body = { action: "delete" as const, lead_ids: ids(4) };
    expect(bulkResultText(body, done(4, 4))).toBe("Deleted 4 leads.");
    expect(bulkResultText(body, done(3, 3))).toBe("Deleted 3 leads. 1 no longer exists.");
    expect(bulkResultText(body, done(0, 0))).toBe("Nothing was deleted. 4 no longer exist.");
  });

  it("names the leads kept because they became stores meanwhile, instead of saying they are gone", () => {
    const body = { action: "delete" as const, lead_ids: ids(4) };
    expect(bulkResultText(body, { ...done(4, 3), kept: ["Kawkab"] })).toBe(
      'Deleted 3 leads. Kept "Kawkab": it has a store now.',
    );
    expect(bulkResultText(body, { ...done(3, 1), kept: ["Kawkab", "متجر الذهب"] })).toBe(
      'Deleted 1 lead. Kept "Kawkab" and "متجر الذهب": they have stores now. 1 no longer exists.',
    );
  });
});

describe("bulkLeadSchema", () => {
  it("knows only what the bar sends: no priority or tag step that writes no history", () => {
    expect(bulkLeadSchema.safeParse({ action: "change_priority", lead_ids: ids(1), payload: { priority: "high" } }).success).toBe(false);
    expect(bulkLeadSchema.safeParse({ action: "add_tag", lead_ids: ids(1), payload: { tag: "vip" } }).success).toBe(false);
  });
});
