import { describe, expect, it } from "vitest";
import {
  guessMapping,
  importProductSchema,
  planImport,
  readAmount,
  readCount,
  readImageLinks,
  type ColumnMapping,
} from "./product-import";

const noShop = { names: [], skus: [], barcodes: [] };

describe("guessMapping", () => {
  it("reads Arabic and English headers, spelling variants and numbered image columns", () => {
    expect(
      guessMapping(["اسم المنتج", "السعر", "الكلفة", "الكميّة", "Size", "اللون", "القسم", "صورة 1", "صورة 2", "ملاحظات"]),
    ).toEqual(["name", "price", "cost", "stock", "size", "colour", "category", "images", "images", null]);
    expect(guessMapping(["Product Name", "Selling Price", "Old price", "QTY", "SKU", "Barcode", "Description", "Image URL"])).toEqual([
      "name",
      "price",
      "compare_at_price",
      "stock",
      "sku",
      "barcode",
      "description",
      "images",
    ]);
  });

  it("gives a field to its first column only, except image links", () => {
    expect(guessMapping(["name", "الاسم", "price"])).toEqual(["name", null, "price"]);
  });
});

describe("readAmount", () => {
  it.each([
    ["35,000", 35000],
    ["35.000", 35000],
    ["1.250.000", 1250000],
    ["٣٥٬٠٠٠", 35000],
    ["۳۵۰۰۰", 35000],
    ["35000 د.ع", 35000],
    ["IQD 35000", 35000],
    ["35000.6", 35001],
    ["12.5", 13],
  ])("reads %s as %d", (cell, value) => {
    expect(readAmount(cell)).toEqual({ kind: "number", value });
  });

  it("tells an empty cell from one that is not a number", () => {
    expect(readAmount("  ")).toEqual({ kind: "empty" });
    expect(readAmount("35 الف")).toEqual({ kind: "bad" });
    expect(readAmount("-5000")).toEqual({ kind: "bad" });
    expect(readAmount("ask")).toEqual({ kind: "bad" });
  });
});

describe("readCount", () => {
  it("takes whole pieces only", () => {
    expect(readCount("12")).toEqual({ kind: "number", value: 12 });
    expect(readCount("12.0")).toEqual({ kind: "number", value: 12 });
    expect(readCount("١٢")).toEqual({ kind: "number", value: 12 });
    expect(readCount("")).toEqual({ kind: "empty" });
    expect(readCount("2.5")).toEqual({ kind: "bad" });
    expect(readCount("-1")).toEqual({ kind: "bad" });
  });
});

describe("readImageLinks", () => {
  it("keeps web links once and counts the rest", () => {
    expect(readImageLinks("https://a.example/1.jpg, https://a.example/2.jpg\nhttps://a.example/1.jpg | photo.jpg ftp://x/y.png")).toEqual({
      links: ["https://a.example/1.jpg", "https://a.example/2.jpg"],
      notLinks: 2,
    });
    expect(readImageLinks("https://user:pw@a.example/1.jpg").links).toEqual([]);
  });
});

describe("planImport", () => {
  const headers = ["الاسم", "السعر", "الكلفة", "الكمية", "SKU", "صورة"];
  const mapping = guessMapping(headers);

  it("plans one product per row, with the shop's own rules", () => {
    const plan = planImport({
      headers,
      firstRow: 2,
      mapping,
      shop: noShop,
      rows: [
        ["عطر عود", "35,000", "18000", "12", "OUD-1", "https://a.example/oud.jpg"],
        ["", "", "", "", "", ""],
        ["مسك", "", "", "5", "", ""],
        ["بخور", "8000", "", "", "", ""],
      ],
    });
    expect(plan.products.map((p) => [p.key, p.name, p.price, p.cost, p.stock, p.sku, p.images])).toEqual([
      ["2", "عطر عود", 35000, 18000, 12, "OUD-1", ["https://a.example/oud.jpg"]],
      ["5", "بخور", 8000, null, 0, null, []],
    ]);
    expect(plan.problems).toEqual([{ row: 4, text: "No price" }]);
    expect(plan.products[0].slug).toBe("عطر-عود");
    for (const product of plan.products) expect(importProductSchema.safeParse(product).success).toBe(true);
  });

  it("leaves out names and codes the shop already has, and repeats within the file", () => {
    const plan = planImport({
      headers,
      firstRow: 2,
      mapping,
      shop: { names: ["عطر العود"], skus: ["TAKEN"], barcodes: [] },
      rows: [
        ["عطر  العود", "1000", "", "", "", ""],
        ["بخور", "8000", "", "", "A", ""],
        ["بخور", "9000", "", "", "", ""],
        ["فواحة", "5000", "", "", "A", ""],
        ["شمعة", "5000", "", "", "TAKEN", ""],
      ],
    });
    expect(plan.products.map((p) => p.name)).toEqual(["بخور"]);
    expect(plan.inShop).toEqual([{ row: 2, text: "A product with this name is already in the shop: left out" }]);
    expect(plan.problems).toEqual([
      { row: 4, text: "Same name as row 3" },
      { row: 5, text: "Same SKU as row 3" },
      { row: 6, text: 'SKU "TAKEN" is already used in the shop' },
    ]);
  });

  it("makes rows with the same name and a size or colour one product with choices", () => {
    const choiceHeaders = ["الاسم", "السعر", "المقاس", "اللون", "الكمية", "صورة"];
    const plan = planImport({
      headers: choiceHeaders,
      firstRow: 2,
      mapping: guessMapping(choiceHeaders),
      shop: noShop,
      rows: [
        ["تيشيرت", "15000", "M", "أسود", "3", "https://a.example/black.jpg"],
        ["تيشيرت", "15000", "L", "أسود", "2", "https://a.example/black.jpg"],
        ["تيشيرت", "14000", "M", "أبيض", "", "https://a.example/white.jpg"],
        ["تيشيرت", "14000", "M", "أبيض", "1", ""],
        ["تيشيرت", "14000", "", "أبيض", "1", ""],
        ["حزام", "9000", "", "", "4", ""],
      ],
    });
    const [shirt, belt] = plan.products;
    expect(shirt).toMatchObject({
      key: "2",
      price: 14000,
      stock: 0,
      options: [
        { name: "المقاس", type: "size", values: ["M", "L"] },
        { name: "اللون", type: "color", values: ["أسود", "أبيض"] },
      ],
      images: ["https://a.example/black.jpg", "https://a.example/white.jpg"],
      rows: [2, 3, 4],
    });
    expect(shirt.variants.map((v) => [v.name, v.option_values, v.price, v.stock])).toEqual([
      ["M / أسود", { المقاس: "M", اللون: "أسود" }, 15000, 3],
      ["L / أسود", { المقاس: "L", اللون: "أسود" }, 15000, 2],
      ["M / أبيض", { المقاس: "M", اللون: "أبيض" }, 14000, 0],
    ]);
    expect(belt).toMatchObject({ name: "حزام", options: [], variants: [], stock: 4 });
    expect(plan.problems).toEqual([
      { row: 5, text: "Same name and choice as row 4" },
      { row: 6, text: "Same name as row 2 but no size" },
    ]);
    expect(importProductSchema.safeParse(shirt).success).toBe(true);
  });

  it("warns about what it drops and keeps the row", () => {
    const m: ColumnMapping = ["name", "price", "compare_at_price", "images"];
    const plan = planImport({
      headers: ["n", "p", "c", "i"],
      firstRow: 2,
      mapping: m,
      shop: noShop,
      rows: [["عطر", "10000", "9000", "see photo https://a.example/1.jpg"]],
    });
    expect(plan.products[0]).toMatchObject({ compare_at_price: null, images: ["https://a.example/1.jpg"] });
    expect(plan.warnings).toEqual([
      { row: 2, text: "Text in the image cell that is not a web link: left out" },
      { row: 2, text: "Price before discount is not above the price: left empty" },
    ]);
  });

  it("says why a number cell is refused", () => {
    const plan = planImport({
      headers,
      firstRow: 2,
      mapping,
      shop: noShop,
      rows: [
        ["a", "free", "", "", "", ""],
        ["b", "0", "", "", "", ""],
        ["c", "1000", "x", "", "", ""],
        ["d", "1000", "", "2.5", "", ""],
      ],
    });
    expect(plan.products).toEqual([]);
    expect(plan.problems.map((p) => p.text)).toEqual([
      'Price "free" is not a number',
      "The price is 0",
      'Cost "x" is not a number',
      'Stock "2.5" is not a whole number',
    ]);
  });
});
