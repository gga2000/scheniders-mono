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

  it("names the lead that was moved to another owner", () => {
    expect(staffActionText("reassign_lead", { merchant_name: "Kawkab" })).toBe("Moved a lead to another owner: Kawkab");
  });

  it("says what a bulk press really changed, and names the leads it deleted", () => {
    expect(staffActionText("bulk_leads", { action: "change_status", status: "contacted", changed: 3 })).toBe(
      "Marked 3 leads as Contacted",
    );
    expect(
      staffActionText("bulk_leads", {
        action: "delete",
        changed: 5,
        leads: ["Kawkab", "Noor", "Dijla", "Babil", "Sumer"].map((merchant_name, i) => ({ id: String(i), merchant_name })),
      }),
    ).toBe("Deleted 5 leads: Kawkab, Noor, Dijla and 2 more");
    expect(staffActionText("bulk_leads", { action: "delete", changed: 1, leads: [{ id: "1", merchant_name: "Kawkab" }] })).toBe(
      "Deleted 1 lead: Kawkab",
    );
  });

  it("keeps the general words for a bulk row from before, which counted every ticked lead", () => {
    expect(staffActionText("bulk_leads", { action: "change_status", count: 40, lead_ids: [] })).toBe(
      "Changed several leads at once",
    );
    expect(staffActionText("bulk_leads", { action: "change_status", status: "nonsense", changed: 2 })).toBe(
      "Changed several leads at once",
    );
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
