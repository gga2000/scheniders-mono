import { z } from "zod";
import {
  IMPORT_BATCH,
  IMPORT_FIELDS,
  importBatchResultSchema,
  type ColumnMapping,
  type ImportField,
  type PlannedProduct,
  type RowNote,
  fieldTakesManyColumns,
} from "./product-import";

/**
 * The console side of a product import (Fermi B12 item 7), once the plan is
 * shown: the products go to the shop 100 at a time, one batch after another,
 * then each new product's images are fetched and saved, a few products at a
 * time. A refused batch stops the run, with what was added before it; a
 * failed image link is named and the run goes on.
 */

/** Products being fetched images for at once (each fetches its own links at once). */
export const IMAGE_PRODUCTS_AT_ONCE = 3;

/** What one call to the console answers: its JSON, or the error the route gave. */
export type Answer = { ok: true; body: unknown } | { ok: false; error: string };

export interface ImportCalls {
  importBatch(body: { fileName: string; products: PlannedProduct[] }): Promise<Answer>;
  saveImages(body: { productId: string; links: string[] }): Promise<Answer>;
}

export interface ImageFailure {
  row: number;
  link: string;
  reason: string;
}

export interface ImportProgress {
  phase: "products" | "images" | "done";
  /** Products the plan sends, and how many of them have gone (added or skipped). */
  productsTotal: number;
  productsSent: number;
  added: number;
  /** Products another import or a person added since the file was read. */
  skippedInShop: number;
  /** Why the run stopped before every batch went, or null. */
  stopped: string | null;
  /** Image links of the products added, and how many were tried, saved, failed. */
  imagesTotal: number;
  imagesTried: number;
  imagesSaved: number;
  imageFailures: ImageFailure[];
}

const imagesAnswerSchema = z.object({
  saved: z.number().int(),
  failed: z.array(z.object({ link: z.string(), reason: z.string() })),
});

/** Words that end as a sentence. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** The plan's products, in the batches the database takes. */
export function batches<T>(items: readonly T[], size = IMPORT_BATCH): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size));
  return out;
}

/** The images to fetch: the products that were added and have links, each under its new id. */
export function imageJobs(products: readonly PlannedProduct[], created: ReadonlyMap<string, string>) {
  return products.flatMap((product) => {
    const productId = created.get(product.key);
    return productId && product.images.length > 0 ? [{ productId, row: product.rows[0] ?? Number(product.key), links: product.images }] : [];
  });
}

/**
 * Runs the import and reports after every step. Never throws: a failed call
 * is a stop (products) or a failure per link (images).
 */
export async function runProductImport(input: {
  fileName: string;
  products: readonly PlannedProduct[];
  calls: ImportCalls;
  onProgress: (progress: ImportProgress) => void;
}): Promise<ImportProgress> {
  const { fileName, products, calls, onProgress } = input;
  let progress: ImportProgress = {
    phase: "products",
    productsTotal: products.length,
    productsSent: 0,
    added: 0,
    skippedInShop: 0,
    stopped: null,
    imagesTotal: 0,
    imagesTried: 0,
    imagesSaved: 0,
    imageFailures: [],
  };
  const report = (next: Partial<ImportProgress>) => {
    progress = { ...progress, ...next };
    onProgress(progress);
  };
  report({});

  const created = new Map<string, string>();
  const all = batches(products);
  for (const [n, batch] of all.entries()) {
    const answer = await calls.importBatch({ fileName, products: batch });
    const result = answer.ok ? importBatchResultSchema.safeParse(answer.body) : null;
    if (!result?.success) {
      const why = sentence(answer.ok ? "The answer could not be read" : answer.error);
      const before = progress.added > 0 ? ` The ${progress.added} added before it stay.` : "";
      report({
        stopped: `Batch ${n + 1} of ${all.length} was not added. ${why}${before} Read the file again to add the rest: products already in the shop are left out.`,
      });
      break;
    }
    for (const { key, product_id } of result.data.created) created.set(key, product_id);
    report({
      productsSent: progress.productsSent + batch.length,
      added: progress.added + result.data.created.length,
      skippedInShop: progress.skippedInShop + result.data.skipped.length,
    });
  }

  const jobs = imageJobs(products, created);
  report({ phase: "images", imagesTotal: jobs.reduce((sum, job) => sum + job.links.length, 0) });

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (!job) return;
      const answer = await calls.saveImages({ productId: job.productId, links: job.links });
      const result = answer.ok ? imagesAnswerSchema.safeParse(answer.body) : null;
      const failures: ImageFailure[] = result?.success
        ? result.data.failed.map((f) => ({ row: job.row, link: f.link, reason: f.reason }))
        : job.links.map((link) => ({ row: job.row, link, reason: answer.ok ? "The answer could not be read" : answer.error }));
      report({
        imagesTried: progress.imagesTried + job.links.length,
        imagesSaved: progress.imagesSaved + (result?.success ? result.data.saved : 0),
        imageFailures: [...progress.imageFailures, ...failures].sort((a, b) => a.row - b.row),
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_PRODUCTS_AT_ONCE, jobs.length) }, worker));

  report({ phase: "done" });
  return progress;
}

/**
 * The mapping after one column is set to `field`: a field that only one
 * column may fill leaves the column that had it, which goes back to skip.
 */
export function setColumn(mapping: ColumnMapping, column: number, field: ImportField | null): ColumnMapping {
  return mapping.map((current, at) => {
    if (at === column) return field;
    if (field && current === field && !fieldTakesManyColumns(field)) return null;
    return current;
  });
}

/** The fields a plan cannot do without, missing from the mapping. */
export function missingFields(mapping: ColumnMapping): ImportField[] {
  return (["name", "price"] as const).filter((field) => !mapping.includes(field));
}

/** A column's first value that is not empty, for the column list. */
export function firstValue(rows: readonly (readonly string[])[], column: number): string {
  for (const row of rows) {
    const cell = row[column]?.trim();
    if (cell) return cell;
  }
  return "";
}

/** What reading a file answers (POST /api/merchants/[id]/product-import/read). */
export const readAnswerSchema = z.object({
  file: z.object({
    sheet: z.string().nullable(),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    firstRow: z.number().int(),
  }),
  mapping: z.array(z.enum(IMPORT_FIELDS).nullable()),
  shop: z.object({ names: z.array(z.string()), skus: z.array(z.string()), barcodes: z.array(z.string()) }),
});

export type ReadAnswer = z.infer<typeof readAnswerSchema>;

/** One line of the check list: a product to add, or a row left out, by its file row. */
export interface CheckRow {
  row: number;
  name: string;
  /** "3 choices" for a product with sizes or colours. */
  choices: number;
  price: string;
  stock: string;
  status: "add" | "problem" | "in_shop";
  /** What is wrong, left out or dropped; empty for a clean product. */
  note: string;
}

const amount = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

/**
 * The plan as one list in file order, for the check step: each product on
 * its first row (price as a range when its choices differ), each row left
 * out with why, and a product's warnings on its line.
 */
export function checkRows(
  plan: { products: readonly PlannedProduct[]; problems: readonly RowNote[]; inShop: readonly RowNote[]; warnings: readonly RowNote[] },
  sheet: { rows: readonly (readonly string[])[]; firstRow: number },
  mapping: ColumnMapping,
): CheckRow[] {
  const nameColumn = mapping.indexOf("name");
  const priceColumn = mapping.indexOf("price");
  const stockColumn = mapping.indexOf("stock");
  const cell = (row: number, column: number) => (column < 0 ? "" : (sheet.rows[row - sheet.firstRow]?.[column] ?? "").trim());
  const warningsByRow = new Map<number, string[]>();
  for (const warning of plan.warnings) warningsByRow.set(warning.row, [...(warningsByRow.get(warning.row) ?? []), warning.text]);

  const products: CheckRow[] = plan.products.map((product) => {
    const prices = product.variants.length > 0 ? product.variants.map((v) => v.price) : [product.price];
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const stock = product.variants.length > 0 ? product.variants.reduce((sum, v) => sum + v.stock, 0) : product.stock;
    return {
      row: product.rows[0] ?? Number(product.key),
      name: product.name,
      choices: product.variants.length,
      price: low === high ? amount(low) : `${amount(low)} to ${amount(high)}`,
      stock: amount(stock),
      status: "add",
      note: product.rows.flatMap((row) => warningsByRow.get(row) ?? []).join(" "),
    };
  });
  const leftOut = (notes: readonly RowNote[], status: "problem" | "in_shop"): CheckRow[] =>
    notes.map((note) => ({
      row: note.row,
      name: cell(note.row, nameColumn),
      choices: 0,
      price: cell(note.row, priceColumn),
      stock: cell(note.row, stockColumn),
      status,
      note: note.text,
    }));
  return [...products, ...leftOut(plan.problems, "problem"), ...leftOut(plan.inShop, "in_shop")].sort((a, b) => a.row - b.row);
}
