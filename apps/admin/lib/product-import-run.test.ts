import { describe, expect, it } from "vitest";
import type { PlannedProduct } from "./product-import";
import {
  batches,
  checkRows,
  firstValue,
  imageJobs,
  importOutcome,
  missingFields,
  runProductImport,
  setColumn,
  type Answer,
  type ImportProgress,
} from "./product-import-run";

const product = (key: number, images: string[] = []): PlannedProduct => ({
  key: String(key),
  name: `p${key}`,
  slug: null,
  description: null,
  category: null,
  category_slug: null,
  price: 1000,
  cost: null,
  compare_at_price: null,
  stock: 1,
  sku: null,
  barcode: null,
  options: [],
  variants: [],
  images,
  rows: [key],
});
const id = (key: string) => `00000000-0000-4000-8000-${key.padStart(12, "0")}`;

/** A console that adds every product it is sent, skipping the keys in `inShop`. */
function console_(opts: { inShop?: string[]; refuseBatch?: number; loseBatch?: number; images?: (links: string[]) => Answer } = {}) {
  const sent: string[][] = [];
  const imageCalls: Array<{ productId: string; links: string[] }> = [];
  return {
    sent,
    imageCalls,
    calls: {
      importBatch: async ({ products }: { fileName: string; products: PlannedProduct[] }): Promise<Answer> => {
        sent.push(products.map((p) => p.key));
        if (opts.refuseBatch === sent.length) return { ok: false, error: "A SKU or barcode in this batch is already used in the shop.", lost: false };
        if (opts.loseBatch === sent.length) return { ok: false, error: "No answer came back, so this may have been done. Check the shop before trying again.", lost: true };
        const skip = new Set(opts.inShop ?? []);
        return {
          ok: true,
          body: {
            created: products.filter((p) => !skip.has(p.key)).map((p) => ({ key: p.key, product_id: id(p.key) })),
            skipped: products.filter((p) => skip.has(p.key)).map((p) => ({ key: p.key, reason: "in_shop" })),
          },
        };
      },
      saveImages: async (body: { productId: string; links: string[] }): Promise<Answer> => {
        imageCalls.push(body);
        return opts.images ? opts.images(body.links) : { ok: true, body: { saved: body.links.length, imageUrl: "x", failed: [] } };
      },
    },
  };
}

describe("runProductImport", () => {
  it("sends the products 100 at a time, then saves the images of the ones added", async () => {
    const products = Array.from({ length: 205 }, (_, i) => product(i + 2, i === 0 ? ["https://a.example/1.jpg", "https://a.example/2.jpg"] : i === 3 ? ["https://a.example/3.jpg"] : []));
    const fake = console_({ inShop: ["5"] });
    const seen: ImportProgress[] = [];
    const done = await runProductImport({ fileName: "p.xlsx", products, calls: fake.calls, onProgress: (p) => seen.push(p) });

    expect(fake.sent.map((b) => b.length)).toEqual([100, 100, 5]);
    // Row 5's product was in the shop by now: no id, so no images for it.
    expect(fake.imageCalls).toEqual([{ productId: id("2"), links: ["https://a.example/1.jpg", "https://a.example/2.jpg"] }]);
    expect(done).toMatchObject({ phase: "done", productsTotal: 205, productsSent: 205, added: 204, skippedInShop: 1, stopped: null, imagesTotal: 2, imagesTried: 2, imagesSaved: 2, imageFailures: [] });
    expect(seen.map((p) => p.phase)).toEqual(["products", "products", "products", "products", "images", "images", "done"]);
  });

  it("stops at a refused batch, keeps what went before, and still saves its images", async () => {
    const products = Array.from({ length: 150 }, (_, i) => product(i + 2, i === 0 ? ["https://a.example/1.jpg"] : []));
    const fake = console_({ refuseBatch: 2 });
    const done = await runProductImport({ fileName: "p.xlsx", products, calls: fake.calls, onProgress: () => {} });

    expect(done.added).toBe(100);
    expect(done.stopped).toBe(
      "Batch 2 of 2 was not added. A SKU or barcode in this batch is already used in the shop. The 100 added before it stay. Read the file again to add the rest: products already in the shop are left out.",
    );
    expect(fake.imageCalls).toHaveLength(1);
  });

  it("names every image link that failed, by its row, and goes on", async () => {
    const products = [product(2, ["https://a.example/ok.jpg", "https://a.example/page"]), product(7, ["https://a.example/gone.jpg"])];
    const fake = console_({
      images: (links) =>
        links[0] === "https://a.example/gone.jpg"
          ? { ok: false, error: "Failed to save the images", lost: false }
          : { ok: true, body: { saved: 1, imageUrl: "x", failed: [{ link: "https://a.example/page", reason: "The link is not a JPEG, PNG, WebP or GIF image" }] } },
    });
    const done = await runProductImport({ fileName: "p.xlsx", products, calls: fake.calls, onProgress: () => {} });

    expect(done.imagesSaved).toBe(1);
    expect(done.imagesTried).toBe(3);
    expect(done.imageFailures).toEqual([
      { row: 2, link: "https://a.example/page", reason: "The link is not a JPEG, PNG, WebP or GIF image" },
      { row: 7, link: "https://a.example/gone.jpg", reason: "Failed to save the images" },
    ]);
  });
});

describe("lost answers and a second read", () => {
  it("never calls a batch with no answer not added, and counts at least what came back", async () => {
    const products = Array.from({ length: 250 }, (_, i) => product(i + 2, i === 0 || i === 150 ? ["https://a.example/1.jpg"] : []));
    const fake = console_({ loseBatch: 2 });
    const done = await runProductImport({ fileName: "p.xlsx", products, calls: fake.calls, onProgress: () => {} });

    expect(fake.sent.map((b) => b.length)).toEqual([100, 100]);
    expect(done).toMatchObject({ added: 100, stoppedLost: true });
    expect(done.stopped).toBe(
      "Batch 2 of 3: no answer came back, so it may have been added. The 100 added before it stay. Check the shop's products, then read the file again: products already in the shop are left out, and the ones still without a photo get the file's photos.",
    );
    expect(done.stopped).not.toMatch(/was not added/);
    // Batch 1's images are saved; batch 2's products have no id here.
    expect(fake.imageCalls).toEqual([{ productId: id("2"), links: ["https://a.example/1.jpg"] }]);
    expect(importOutcome("Kawkab", done)).toMatchObject({ ok: false, title: "Kawkab: import stopped. Added at least 100 of 250 products. Images: 1 of 1 saved." });
  });

  it("a second read gives the file's photos to the products the shop has with none, beside the new ones", async () => {
    const fake = console_();
    const done = await runProductImport({
      fileName: "p.xlsx",
      products: [product(5, ["https://a.example/new.jpg"])],
      photosOnly: [{ productId: id("77"), row: 3, links: ["https://a.example/lost.jpg", "https://a.example/lost2.jpg"] }],
      calls: fake.calls,
      onProgress: () => {},
    });
    expect(fake.imageCalls).toEqual([
      { productId: id("77"), links: ["https://a.example/lost.jpg", "https://a.example/lost2.jpg"] },
      { productId: id("5"), links: ["https://a.example/new.jpg"] },
    ]);
    expect(done).toMatchObject({ added: 1, imagesTotal: 3, imagesSaved: 3 });

    const photosOnly = await runProductImport({
      fileName: "p.xlsx",
      products: [],
      photosOnly: [{ productId: id("77"), row: 3, links: ["https://a.example/lost.jpg"] }],
      calls: fake.calls,
      onProgress: () => {},
    });
    expect(fake.sent).toEqual([["5"]]);
    expect(photosOnly).toMatchObject({ phase: "done", added: 0, imagesSaved: 1 });
  });

  it("says an images answer that never came is not known, not failed", async () => {
    const fake = console_({
      images: (links) =>
        links[0] === "https://a.example/lost.jpg"
          ? { ok: false, error: "No answer came back, so this may have been done. Check the shop before trying again.", lost: true }
          : { ok: true, body: "not json" },
    });
    const done = await runProductImport({
      fileName: "p.xlsx",
      products: [product(2, ["https://a.example/lost.jpg"]), product(9, ["https://a.example/odd.jpg"])],
      calls: fake.calls,
      onProgress: () => {},
    });
    expect(done).toMatchObject({ imageFailures: [], imagesNotKnown: [2, 9], imagesSaved: 0, imagesTried: 2 });
    expect(importOutcome("Kawkab", done)).toEqual({
      ok: false,
      title: "Kawkab: import done. Added 2 of 2 products. Images: 0 of 2 saved, 2 products not known.",
      description:
        "Open the shop's import and read the file again: products already in the shop are left out, and the ones still without a photo get the file's photos.",
    });
  });

  it("says a clean run as done", async () => {
    const done = await runProductImport({ fileName: "p.xlsx", products: [product(2)], calls: console_().calls, onProgress: () => {} });
    expect(importOutcome("Kawkab", done)).toEqual({ ok: true, title: "Kawkab: import done. Added 1 of 1 product.", description: undefined });
  });
});

describe("the column list", () => {
  it("gives a field that one column fills to the last column chosen; image links may fill several", () => {
    expect(setColumn(["name", "price", null], 2, "price")).toEqual(["name", null, "price"]);
    expect(setColumn(["images", null], 1, "images")).toEqual(["images", "images"]);
    expect(setColumn(["name", "price"], 0, null)).toEqual([null, "price"]);
  });

  it("needs a name and a price column", () => {
    expect(missingFields(["name", null])).toEqual(["price"]);
    expect(missingFields(["price", "name"])).toEqual([]);
  });

  it("shows a column's first value that is not empty", () => {
    expect(firstValue([["", "a"], [" x ", "b"]], 0)).toBe("x");
    expect(firstValue([["", "a"]], 0)).toBe("");
  });

  it("cuts a list into batches and finds the image jobs of added products and in-shop ones with no photo, by row", () => {
    expect(batches([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(imageJobs([product(2, ["l"]), product(3, ["m"]), product(4)], new Map([["2", "a"], ["4", "c"]]))).toEqual([{ productId: "a", row: 2, links: ["l"] }]);
    expect(imageJobs([product(5, ["l"])], new Map([["5", "a"]]), [{ productId: "z", row: 3, links: ["k"] }])).toEqual([
      { productId: "z", row: 3, links: ["k"] },
      { productId: "a", row: 5, links: ["l"] },
    ]);
  });
});

describe("checkRows", () => {
  it("lists products and left-out rows in file order, with the file's own name and price for a row left out", () => {
    const withChoices: PlannedProduct = {
      ...product(2, []),
      name: "عطر",
      variants: [
        { name: "50", option_values: { الحجم: "50" }, price: 35_000, cost: null, compare_at_price: null, stock: 2, sku: null, barcode: null },
        { name: "100", option_values: { الحجم: "100" }, price: 60_000, cost: null, compare_at_price: null, stock: 3, sku: null, barcode: null },
      ],
      rows: [2, 3],
    };
    const lines = checkRows(
      {
        products: [withChoices, { ...product(6), name: "بخور", price: 8000, stock: 40 }],
        problems: [{ row: 4, text: "No price" }],
        inShop: [{ row: 5, text: "A product with this name is already in the shop: left out" }],
        warnings: [{ row: 3, text: "Text in the image cell that is not a web link: left out" }],
      },
      { rows: [["عطر", "35000"], ["عطر", "60000"], ["مسك", ""], ["عود", "9000"], ["بخور", "8000"]], firstRow: 2 },
      ["name", "price"],
    );
    expect(lines).toEqual([
      { row: 2, name: "عطر", choices: 2, price: "35,000 to 60,000", stock: "5", status: "add", note: "Text in the image cell that is not a web link: left out" },
      { row: 4, name: "مسك", choices: 0, price: "", stock: "", status: "problem", note: "No price" },
      { row: 5, name: "عود", choices: 0, price: "9000", stock: "", status: "in_shop", note: "A product with this name is already in the shop: left out" },
      { row: 6, name: "بخور", choices: 0, price: "8,000", stock: "40", status: "add", note: "" },
    ]);
  });
});
