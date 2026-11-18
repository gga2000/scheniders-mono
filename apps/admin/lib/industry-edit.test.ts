import { describe, expect, it } from "vitest";
import { industryChanges, industryForm } from "./industry-edit";

const beauty = {
  id: "a0000000-0000-4000-8000-000000000001",
  name: "Beauty",
  name_ar: null,
  icon: "Sparkles",
  color: "#EC4899",
  avg_order_value_iqd: 25000,
  is_active: true,
  sort_order: 2,
  created_at: "2026-11-17T00:00:00Z",
};

describe("industryChanges", () => {
  const opened = industryForm(beauty);

  it("is empty when nothing was changed", () => {
    expect(industryChanges(opened, { ...opened })).toEqual({});
  });

  it("names only the field that was changed, not the ones the row opened with", () => {
    expect(industryChanges(opened, { ...opened, name: "Cosmetics" })).toEqual({ name: "Cosmetics" });
    expect(industryChanges(opened, { ...opened, color: "#3B82F6", avg_order_value_iqd: 40000 })).toEqual({
      color: "#3B82F6",
      avg_order_value_iqd: 40000,
    });
  });

  it("reads names as the server keeps them: spaces trimmed, no Arabic name as none", () => {
    expect(industryChanges(opened, { ...opened, name: "  Beauty " })).toEqual({});
    expect(industryChanges(opened, { ...opened, name_ar: "   " })).toEqual({});
    expect(industryChanges(opened, { ...opened, name_ar: " تجميل " })).toEqual({ name_ar: "تجميل" });
    const named = industryForm({ ...beauty, name_ar: "تجميل" });
    expect(industryChanges(named, { ...named, name_ar: "" })).toEqual({ name_ar: null });
  });

  it("sends an emptied name, for the server to refuse", () => {
    expect(industryChanges(opened, { ...opened, name: "  " })).toEqual({ name: "" });
  });
});
