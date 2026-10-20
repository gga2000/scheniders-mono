/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import { applyFillerVisibility, countFiller, fillerIsVisible } from "./product-filler";

type Row = {
  id: string;
  is_filler?: boolean | null;
  is_supply?: boolean | null;
  is_archived?: boolean | null;
};

const real: Row = { id: "real" };
const filler: Row = { id: "filler", is_filler: true };
const fillerSupply: Row = { id: "fs", is_filler: true, is_supply: true };
const fillerArchived: Row = { id: "fa", is_filler: true, is_archived: true };

describe("fillerIsVisible", () => {
  it("hides filler when the list is at rest", () => {
    expect(fillerIsVisible({ showFiller: false, searching: false })).toBe(false);
  });

  it("shows filler once the group is expanded", () => {
    expect(fillerIsVisible({ showFiller: true, searching: false })).toBe(true);
  });

  // The failure this prevents: an operator types a product name, the row is
  // filler, and the list comes back empty as though the product did not exist.
  it("shows filler while a search is running, even when collapsed", () => {
    expect(fillerIsVisible({ showFiller: false, searching: true })).toBe(true);
  });
});

describe("applyFillerVisibility", () => {
  const rows = [real, filler];

  it("drops filler rows at rest", () => {
    expect(applyFillerVisibility(rows, { showFiller: false, searching: false })).toEqual([real]);
  });

  it("keeps every row when expanded", () => {
    expect(applyFillerVisibility(rows, { showFiller: true, searching: false })).toEqual(rows);
  });

  it("keeps every row while searching", () => {
    expect(applyFillerVisibility(rows, { showFiller: false, searching: true })).toEqual(rows);
  });

  it("never touches non-filler rows", () => {
    const onlyReal = [real, { id: "r2" }];
    expect(applyFillerVisibility(onlyReal, { showFiller: false, searching: false })).toEqual(onlyReal);
  });

  it("treats a missing flag as not filler", () => {
    const undefinedFlag = [{ id: "u", is_filler: undefined }];
    expect(applyFillerVisibility(undefinedFlag, { showFiller: false, searching: false })).toHaveLength(1);
  });

  it("does not mutate the input", () => {
    const input = [real, filler];
    applyFillerVisibility(input, { showFiller: false, searching: false });
    expect(input).toHaveLength(2);
  });
});

describe("countFiller", () => {
  it("counts only filler rows", () => {
    expect(countFiller([real, filler])).toBe(1);
  });

  // The count sits on the group header, so it has to match what expanding
  // actually reveals — and the page never lists supplies or archived rows.
  it("excludes supplies and archived rows so the header matches the list", () => {
    expect(countFiller([real, filler, fillerSupply, fillerArchived])).toBe(1);
  });

  it("is zero when nothing is filler", () => {
    expect(countFiller([real, { id: "r2" }])).toBe(0);
  });
});
