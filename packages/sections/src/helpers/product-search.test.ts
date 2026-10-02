import { describe, expect, it } from "vitest";
import { filterByQuery, matchesQuery, normalizeSearchText } from "./product-search";
import type { Product } from "../types";

function product(over: Partial<Product> & { name: string }): Product {
  return {
    id: over.name,
    price: 30000,
    stock_quantity: 5,
    reserved_quantity: 0,
    is_archived: false,
    ...over,
  } as Product;
}

describe("normalizeSearchText", () => {
  it("collapses the hamza carriers a shopper does not type", () => {
    expect(normalizeSearchText("الأكثر")).toBe(normalizeSearchText("الاكثر"));
    expect(normalizeSearchText("إحساس")).toBe(normalizeSearchText("احساس"));
    expect(normalizeSearchText("آمال")).toBe(normalizeSearchText("امال"));
  });

  it("collapses the final taa and the alef maqsura", () => {
    expect(normalizeSearchText("عودة")).toBe(normalizeSearchText("عوده"));
    expect(normalizeSearchText("ليلى")).toBe(normalizeSearchText("ليلي"));
  });

  it("strips tashkeel and the tatweel", () => {
    expect(normalizeSearchText("عَوْدٌ")).toBe(normalizeSearchText("عود"));
    expect(normalizeSearchText("عـــود")).toBe(normalizeSearchText("عود"));
  });

  it("reads Arabic-Indic digits as the same number", () => {
    expect(normalizeSearchText("٣٠ مل")).toBe("30 مل");
    expect(normalizeSearchText("۵۰")).toBe("50");
  });

  it("folds case and collapses whitespace", () => {
    expect(normalizeSearchText("  Blue   OUD ")).toBe("blue oud");
  });

  it("leaves a distinct word distinct", () => {
    // The normalizer is lossy, not blind: these must not collapse together.
    expect(normalizeSearchText("عود")).not.toBe(normalizeSearchText("ورد"));
    expect(normalizeSearchText("عود")).not.toBe(normalizeSearchText("عودي"));
  });
});

describe("matchesQuery", () => {
  const oud = product({
    name: "عطر الأكثر مبيعاً",
    sku: "SCH-100",
    short_description: "عود أزرق فاخر",
  });

  it("finds a product typed without its hamza", () => {
    expect(matchesQuery(oud, "الاكثر")).toBe(true);
  });

  it("ignores word order and narrows as tokens are added", () => {
    expect(matchesQuery(oud, "ازرق عود")).toBe(true);
    expect(matchesQuery(oud, "عود ازرق")).toBe(true);
    expect(matchesQuery(oud, "عود اخضر")).toBe(false);
  });

  it("matches the SKU and is case-insensitive about it", () => {
    expect(matchesQuery(oud, "sch-100")).toBe(true);
  });

  it("treats an empty or blank query as no filter at all", () => {
    expect(matchesQuery(oud, "")).toBe(true);
    expect(matchesQuery(oud, "   ")).toBe(true);
  });

  it("does not match a word the product never carries", () => {
    expect(matchesQuery(oud, "مسك")).toBe(false);
  });
});

describe("filterByQuery", () => {
  const list = [
    product({ name: "عود أزرق" }),
    product({ name: "مسك أبيض" }),
    product({ name: "Blue Oud" }),
  ];

  it("returns the same array contents for an empty query", () => {
    expect(filterByQuery(list, "")).toEqual(list);
  });

  it("filters without mutating the input", () => {
    const before = list.map((p) => p.name);
    expect(filterByQuery(list, "عود").map((p) => p.name)).toEqual(["عود أزرق"]);
    expect(list.map((p) => p.name)).toEqual(before);
  });

  it("matches Latin text too", () => {
    expect(filterByQuery(list, "blue").map((p) => p.name)).toEqual(["Blue Oud"]);
  });
});
