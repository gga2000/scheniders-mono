import { describe, expect, it } from "vitest";
import { staffActionText, staffLogSummary, toStaffAction } from "./staff-actions";

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

  it("names an edited lead, its old name, and the fields that changed in the form's words", () => {
    expect(
      staffActionText("edit_lead", { merchant_name: "Kawkab Baghdad", was: "Kawkab", fields: ["merchant_name", "phone_numbers", "priority"] }),
    ).toBe("Edited a lead: Kawkab Baghdad, was Kawkab (name, phones and priority)");
    expect(staffActionText("edit_lead", { merchant_name: "Kawkab", fields: ["tags"] })).toBe("Edited a lead: Kawkab (tags)");
    expect(
      staffActionText("edit_lead", { merchant_name: "Kawkab", fields: ["city", "address", "tags", "email", "branches"] }),
    ).toBe("Edited a lead: Kawkab (city, address, tags, email and 1 more)");
    expect(staffActionText("edit_lead", {})).toBe("Edited a lead");
  });

  it("names the industry a settings change touched, and what became of it", () => {
    const industries = { setting: "industries" };
    expect(staffActionText("update_settings", { ...industries, change: "added", name: "Perfume" })).toBe("Added industry Perfume");
    expect(staffActionText("update_settings", { ...industries, change: "removed", name: "Perfume" })).toBe("Removed industry Perfume");
    expect(staffActionText("update_settings", { ...industries, change: "switched_off", name: "Perfume", leads_using_it: 3 })).toBe(
      "Switched off industry Perfume (3 leads use it)",
    );
    expect(staffActionText("update_settings", { ...industries, change: "switched_off", name: "Perfume", leads_using_it: 1 })).toBe(
      "Switched off industry Perfume (1 lead uses it)",
    );
    expect(staffActionText("update_settings", { ...industries, change: "moved", name: "Tools", from_place: 2, to_place: 1 })).toBe(
      "Moved industry Tools from place 2 to 1",
    );
    expect(
      staffActionText("update_settings", { ...industries, change: "edited", name: "Cosmetics", was: "Beauty", fields: ["name", "color"] }),
    ).toBe("Edited industry Cosmetics, was Beauty (name and color)");
    expect(
      staffActionText("update_settings", { ...industries, change: "edited", name: "Beauty", was: null, fields: ["avg_order_value_iqd", "is_active"] }),
    ).toBe("Edited industry Beauty (average order and on or off)");
  });

  it("says an industry for edit and move rows written before they named it", () => {
    expect(staffActionText("update_settings", { setting: "industries", change: "edited", industry_id: "x", fields: ["icon"] })).toBe(
      "Edited an industry (icon)",
    );
    expect(staffActionText("update_settings", { setting: "industries", change: "moved", from_place: 3, to_place: 4 })).toBe(
      "Moved an industry from place 3 to 4",
    );
    expect(staffActionText("update_settings", { setting: "seed_automation", active: true })).toBe("Changed console settings");
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

  // Round 11: the end of a look-as-the-merchant visit read "support view end".
  it("says a look as the merchant started and ended", () => {
    expect(staffActionText("support_view", { session_id: "5f0c2c1e-0000-4000-8000-000000000001" })).toBe("Looked at the shop as the merchant");
    expect(staffActionText("support_view_end", { ended: 1 })).toBe("Stopped looking as the merchant");
  });
});

// Round 11: the details column showed a look's session_id, a uuid nobody can read.
describe("staffLogSummary", () => {
  it("shows up to two plain values in words", () => {
    expect(staffLogSummary({ days: 7 })).toBe("days: 7");
    expect(staffLogSummary({ rows: 40, kind: "leads", format: "csv" })).toBe("rows: 40 | kind: leads");
  });

  it("leaves out ids, lists and empty values", () => {
    expect(staffLogSummary({ session_id: "5f0c2c1e-0000-4000-8000-000000000001" })).toBeNull();
    expect(
      staffLogSummary({ setting: "industries", industry_id: "x", id: "y", fields: ["name"], was: null, change: "edited" }),
    ).toBe("setting: industries | change: edited");
    expect(staffLogSummary({ paid: true, said: "ok" })).toBe("paid: true | said: ok");
  });

  it("is null for no details", () => {
    expect(staffLogSummary(null)).toBeNull();
    expect(staffLogSummary({})).toBeNull();
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
