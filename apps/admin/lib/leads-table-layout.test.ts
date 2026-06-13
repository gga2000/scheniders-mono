import { describe, it, expect } from "vitest";
import {
  LEADS_TABLE_LAYOUT_VERSION,
  MAX_COLUMN_WIDTH,
  layoutSchema,
  defaultLayout,
  resolveLeadLayout,
  serializeLayout,
  visibleColumns,
  sameLayout,
  cloneLayout,
  type LayoutConfig,
} from "./leads-table-layout";
import { LEAD_COLUMN_ORDER, LEAD_COLUMN_MAP } from "./leads-table-columns";

const cfg = (columns: { id: string; width: number; hidden: boolean }[]): LayoutConfig =>
  ({ version: LEADS_TABLE_LAYOUT_VERSION, columns }) as LayoutConfig;

describe("resolveLeadLayout", () => {
  it("returns the default layout for null (first run)", () => {
    const resolved = resolveLeadLayout(null);
    expect(resolved.map((c) => c.id)).toEqual([...LEAD_COLUMN_ORDER]);
    expect(resolved.every((c) => !c.hidden)).toBe(true);
    expect(resolved.map((c) => c.width)).toEqual(LEAD_COLUMN_ORDER.map((id) => LEAD_COLUMN_MAP[id].defaultWidth));
  });

  it("drops unknown / removed column ids", () => {
    const resolved = resolveLeadLayout(cfg([
      { id: "merchant", width: 280, hidden: false },
      { id: "ghost_column", width: 200, hidden: false },
      { id: "platform", width: 150, hidden: false },
    ]));
    expect(resolved.find((c) => (c.id as string) === "ghost_column")).toBeUndefined();
    expect(resolved.find((c) => c.id === "platform")).toBeDefined();
  });

  it("de-duplicates, keeping the first occurrence's position", () => {
    const resolved = resolveLeadLayout(cfg([
      { id: "merchant", width: 280, hidden: false },
      { id: "status", width: 150, hidden: false },
      { id: "status", width: 999, hidden: true },
    ]));
    expect(resolved.filter((c) => c.id === "status")).toHaveLength(1);
    // first occurrence wins → not hidden, width clamped from 150 (within bounds)
    expect(resolved.find((c) => c.id === "status")?.hidden).toBe(false);
  });

  it("appends newly-shipped columns (visible) at the end, preserving stored order", () => {
    const resolved = resolveLeadLayout(cfg([
      { id: "merchant", width: 280, hidden: false },
      { id: "priority", width: 130, hidden: false },
      { id: "platform", width: 150, hidden: false },
    ]));
    // explicit ones keep their order
    expect(resolved.slice(0, 3).map((c) => c.id)).toEqual(["merchant", "priority", "platform"]);
    // everything else is present exactly once, appended after
    expect(new Set(resolved.map((c) => c.id)).size).toBe(LEAD_COLUMN_ORDER.length);
    expect(resolved).toHaveLength(LEAD_COLUMN_ORDER.length);
  });

  it("clamps NaN / below-min / above-max widths", () => {
    const resolved = resolveLeadLayout(cfg([
      { id: "merchant", width: Number.NaN, hidden: false },
      { id: "platform", width: 1, hidden: false },
      { id: "industry", width: 99999, hidden: false },
    ]));
    expect(resolved.find((c) => c.id === "merchant")?.width).toBe(LEAD_COLUMN_MAP.merchant.defaultWidth);
    expect(resolved.find((c) => c.id === "platform")?.width).toBe(LEAD_COLUMN_MAP.platform.minWidth);
    expect(resolved.find((c) => c.id === "industry")?.width).toBe(MAX_COLUMN_WIDTH);
  });

  it("forces the merchant column to index 0 and visible", () => {
    const resolved = resolveLeadLayout(cfg([
      { id: "platform", width: 150, hidden: false },
      { id: "status", width: 150, hidden: false },
      { id: "merchant", width: 280, hidden: true },
    ]));
    expect(resolved[0].id).toBe("merchant");
    expect(resolved[0].hidden).toBe(false);
  });

  it("round-trips through serialize → resolve unchanged", () => {
    const a = resolveLeadLayout(cfg([
      { id: "merchant", width: 300, hidden: false },
      { id: "ranking", width: 140, hidden: true },
      { id: "platform", width: 160, hidden: false },
    ]));
    const b = resolveLeadLayout(serializeLayout(a));
    expect(sameLayout(a, b)).toBe(true);
  });
});

describe("layoutSchema", () => {
  it("accepts a well-formed config", () => {
    expect(layoutSchema.safeParse(serializeLayout(defaultLayout())).success).toBe(true);
  });
  it("rejects the wrong version", () => {
    expect(layoutSchema.safeParse({ version: 2, columns: [{ id: "merchant", width: 280, hidden: false }] }).success).toBe(false);
  });
  it("rejects empty columns and unknown top-level keys", () => {
    expect(layoutSchema.safeParse({ version: 1, columns: [] }).success).toBe(false);
    expect(layoutSchema.safeParse({ version: 1, columns: [{ id: "merchant", width: 280, hidden: false }], extra: 1 }).success).toBe(false);
  });
  it("accepts lenient ids/widths (resolver normalizes, not the schema)", () => {
    expect(layoutSchema.safeParse({ version: 1, columns: [{ id: "removed_col", width: 5, hidden: false }] }).success).toBe(true);
  });
});

describe("helpers", () => {
  it("visibleColumns filters hidden", () => {
    const layout = resolveLeadLayout(cfg([
      { id: "merchant", width: 280, hidden: false },
      { id: "platform", width: 150, hidden: true },
    ]));
    expect(visibleColumns(layout).some((c) => c.id === "platform")).toBe(false);
    expect(visibleColumns(layout).some((c) => c.id === "merchant")).toBe(true);
  });
  it("cloneLayout produces an independent copy", () => {
    const a = defaultLayout();
    const b = cloneLayout(a);
    b[0].width = 999;
    expect(a[0].width).not.toBe(999);
    expect(sameLayout(a, cloneLayout(a))).toBe(true);
  });
});
