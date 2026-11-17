import { describe, expect, it } from "vitest";
import { leadToFormData } from "@/components/leads/lead-form-data";
import type { Lead } from "@/types/leads";
import { leadPatchSchema, leadUpdateSchema, listsChangedText } from "./lead-update";

// A lead as the API returns it, with the empty columns a real row has.
const stored = {
  id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f",
  merchant_name: "Noor Boutique",
  industry_id: null,
  industry_detail: null,
  platform: "instagram",
  platform_url: null,
  handle: "noor.boutique",
  follower_count: 12000,
  post_count: 340,
  management_name: null,
  management_info: null,
  page_phone: "07701234567",
  phone_numbers: [{ title: "Owner", number: "07701234567" }],
  contact_via_dm: false,
  website_url: null,
  email: null,
  avg_view_count: 0,
  avg_like_count: 0,
  avg_comments_count: 0,
  avg_order_count: 3,
  address: null,
  city: "Baghdad",
  governorate_code: "BGD",
  is_online_only: true,
  branches: [],
  priority: "medium",
  assigned_to: "9f8e7d6c-5b4a-4321-8fed-cba987654321",
  tags: null,
  source_campaign: null,
  source_medium: null,
  status: "contacted",
} as unknown as Lead;

describe("leadUpdateSchema", () => {
  it("takes what the lead form sends for a saved lead", () => {
    const sent = JSON.parse(JSON.stringify({ ...leadToFormData(stored), is_draft: false }));
    const parsed = leadUpdateSchema.safeParse(sent);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(sent);
  });

  it("takes a status menu change on its own", () => {
    expect(leadUpdateSchema.parse({ status: "store_built" })).toEqual({ status: "store_built" });
  });

  it("refuses Converted as a plain status, naming Convert", () => {
    const parsed = leadUpdateSchema.safeParse({ status: "converted" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/only through Convert/);
  });

  it("drops fields the server keeps", () => {
    const parsed = leadUpdateSchema.parse({
      priority: "high",
      assigned_at: "2020-01-01T00:00:00Z",
      last_contacted_at: "2020-01-01T00:00:00Z",
      converted_tenant_id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f",
      lead_score: 100,
    });
    expect(parsed).toEqual({ priority: "high" });
  });

  it("refuses an owner that is not an id and a negative count", () => {
    expect(leadUpdateSchema.safeParse({ assigned_to: "me" }).success).toBe(false);
    expect(leadUpdateSchema.safeParse({ follower_count: -5 }).success).toBe(false);
  });
});

/*
 * Round 11: phones, tags and branches are saved whole, so a save carries each
 * list it changed as the form opened it, and admin_edit_lead compares them.
 */
describe("listsChangedText", () => {
  it("names the lists in the form's words", () => {
    expect(listsChangedText(["tags"])).toBe(
      "A colleague changed this lead's tags while you had it open. Nothing was saved. Open the lead again to see their change, then make yours.",
    );
    expect(listsChangedText(["branches", "phone_numbers"])).toMatch(/^A colleague changed this lead's phones and branches /);
  });
});

describe("leadPatchSchema", () => {
  it("takes the lists as they opened, as they came, and nothing else there", () => {
    const odd = [{ title: "Owner", number: "0770", note: "old shape" }];
    expect(leadPatchSchema.parse({ tags: ["vip"], was: { tags: null, phone_numbers: odd } })).toEqual({
      tags: ["vip"],
      was: { tags: null, phone_numbers: odd },
    });
    expect(leadPatchSchema.safeParse({ was: { city: "Kut" } }).success).toBe(false);
  });
});
