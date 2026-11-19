import { describe, expect, it, vi } from "vitest";
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
    expect(staffLogSummary("any_step", { days: 7 })).toBe("days: 7");
    expect(staffLogSummary("any_step", { rows: 40, kind: "leads", format: "csv" })).toBe("rows: 40 | kind: leads");
  });

  // A converted trial's words name the days and the plan, so the reason comes first, never a raw plan key.
  it("leads a converted trial with its reason", () => {
    expect(
      staffLogSummary("convert_trial", {
        days: 30,
        plan: "growth",
        reason: "Paid in cash",
        current_period_end: "2026-12-19T05:00:00+00:00",
        previous_period_end: "2026-11-22T05:00:00+00:00",
      }),
    ).toMatch(/^reason: Paid in cash \| current period end: \S/);
  });

  it("does not repeat a logged call's outcome its words already say", () => {
    expect(staffLogSummary("support_task_logged", { task_id: null, call_id: "c1", outcome: "no_answer" })).toBeNull();
  });

  it("leaves out ids, lists and empty values", () => {
    expect(staffLogSummary("any_step", { session_id: "5f0c2c1e-0000-4000-8000-000000000001" })).toBeNull();
    expect(
      staffLogSummary("any_step", { setting: "industries", industry_id: "x", id: "y", fields: ["name"], was: null, change: "edited" }),
    ).toBe("setting: industries | change: edited");
    expect(staffLogSummary("any_step", { paid: true, said: "ok" })).toBe("paid: true | said: ok");
  });

  // Round 12: an owner move (admin_change_leads) logs from and to as staff ids.
  it("leaves out an id under any key", () => {
    expect(
      staffLogSummary("any_step", {
        lead_id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f",
        merchant_name: "Kawkab",
        from: "9b1e2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
        to: "A0000000-0000-4000-8000-00000000000A",
      }),
    ).toBe("merchant name: Kawkab");
  });

  // An owner move's and a lead edit's own words name the lead: not twice.
  it("leaves out the lead's name where the step's words give it", () => {
    const move = { merchant_name: "Kawkab", from: "9b1e2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d", to: null };
    expect(staffActionText("reassign_lead", move)).toBe("Moved a lead to another owner: Kawkab");
    expect(staffLogSummary("reassign_lead", move)).toBeNull();
    expect(staffLogSummary("edit_lead", { merchant_name: "Kawkab", source: "form" })).toBe("source: form");
  });

  // Round 13: the summary repeated the step's own words ("Gave 7 free trial
  // days" over "days: 7", an edit's old name, a pause that ended by itself).
  it("leaves out what the step's own words already say", () => {
    const trial = { days: 7, reason: "Waiting for the bank", source: "single" };
    expect(staffActionText("extend_trial", trial)).toBe("Gave 7 free trial days");
    expect(staffLogSummary("extend_trial", trial)).toBe("reason: Waiting for the bank");

    const edit = { merchant_name: "Kawkab Baghdad", was: "Kawkab", fields: ["merchant_name"], source: "form" };
    expect(staffActionText("edit_lead", edit)).toBe("Edited a lead: Kawkab Baghdad, was Kawkab (name)");
    expect(staffLogSummary("edit_lead", edit)).toBe("source: form");

    const industry = { setting: "industries", change: "edited", name: "Beauty", was: "Cosmetics", fields: ["name"] };
    expect(staffActionText("update_settings", industry)).toBe("Edited industry Beauty, was Cosmetics (name)");
    expect(staffLogSummary("update_settings", industry)).toBeNull();

    const lifted = { ended: true, status: "active" };
    expect(staffActionText("unpause_tenant", lifted)).toBe("Pause ended on its end date");
    expect(staffLogSummary("unpause_tenant", lifted)).toBe("status: active");

    const bulk = { action: "change_status", status: "contacted", changed: 3 };
    expect(staffLogSummary("bulk_leads", bulk)).toBeNull();
  });

  // Round 13: "source: single" under a trial gift was a code word.
  it("says how a step was made only when it was not one shop at a time", () => {
    expect(staffLogSummary("extend_trial", { days: 7, source: "bulk", reason: "Eid" })).toBe("several shops at once | reason: Eid");
    expect(staffLogSummary("status_change", { status: "trial", source: "single" })).toBeNull();
    // A way the console does not know is kept as written.
    expect(staffLogSummary("edit_lead", { merchant_name: "Kawkab", source: "form" })).toBe("source: form");
  });

  it("keeps a value the words did not use", () => {
    // An older bulk row has no count, so its words are the general ones.
    expect(staffActionText("bulk_leads", { action: "assign" })).toBe("Changed several leads at once");
    expect(staffLogSummary("bulk_leads", { action: "assign" })).toBe("action: assign");
    // Other settings than the industry list keep their name.
    expect(staffLogSummary("update_settings", { setting: "payment_details" })).toBe("setting: payment_details");
  });

  it("gives a time on the console's clock, and leaves out blank text", () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T12:00:00Z") });
    try {
      expect(staffLogSummary("any_step", { paused_until: "2026-11-17T03:21:24.887769+00:00", note: " " })).toBe(
        "paused until: Tue 17 Nov, 06:21",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("is null for no details", () => {
    expect(staffLogSummary("any_step", null)).toBeNull();
    expect(staffLogSummary("any_step", {})).toBeNull();
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
