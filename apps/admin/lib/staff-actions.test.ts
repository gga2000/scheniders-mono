import { describe, expect, it } from "vitest";
import { staffActionText, toStaffAction } from "./staff-actions";

describe("staffActionText", () => {
  it("uses the shop list's words for a shop step", () => {
    expect(staffActionText("extend_trial", { days: 1 })).toBe("Gave 1 free trial day");
    expect(staffActionText("top_up_wallet", {})).toBe("Added money");
  });

  it("has words for steps the shop list leaves out", () => {
    expect(staffActionText("add_note", { content: "called" })).toBe("Wrote a note");
    expect(staffActionText("export_data", { rows: 40 })).toBe("Downloaded a list");
  });

  it("names a deleted lead from the log, since its row is gone", () => {
    expect(staffActionText("delete_lead", { merchant_name: "Kawkab" })).toBe("Deleted a lead: Kawkab");
    expect(staffActionText("delete_lead", {})).toBe("Deleted a lead");
  });

  it("reads an unknown step as words", () => {
    expect(staffActionText("support_notice_posted", null)).toBe("Support notice posted");
  });
});

describe("toStaffAction", () => {
  const row = { id: "l1", action: "reactivate", details: null, created_at: "2026-11-16T10:00:00Z" };

  it("names the shop, whichever shape the join comes in", () => {
    expect(toStaffAction({ ...row, tenant_id: "s1", tenant: { business_name: "Kawkab" } }).shop).toEqual({ id: "s1", name: "Kawkab" });
    expect(toStaffAction({ ...row, tenant_id: "s1", tenant: [{ business_name: "Kawkab" }] }).shop).toEqual({ id: "s1", name: "Kawkab" });
  });

  it("keeps a shop that is gone, without a name, and no shop for a console step", () => {
    expect(toStaffAction({ ...row, tenant_id: "s1", tenant: null }).shop).toEqual({ id: "s1", name: null });
    expect(toStaffAction({ ...row, tenant_id: null, tenant: null }).shop).toBeNull();
  });
});
