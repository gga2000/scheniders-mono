import { z } from "zod";
import { slugify } from "@scheniders/shared";

/**
 * Product import for the setup service (Fermi B12 item 7): a shop's products
 * from the Excel or CSV file the merchant sends, read by the team in the
 * console. The file is read on the server (product-import-file.ts); this
 * module matches its columns to product fields, checks every row and plans
 * the products, so the screen shows exactly what the import will add.
 *
 * Rules:
 *   - a row needs a name and a price above 0; cost, price before discount and
 *     stock are optional, and a cell that is there must be a number;
 *   - amounts are whole Iraqi dinars: "35,000", "35.000", "٣٥٠٠٠" and
 *     "35000 د.ع" all read as 35000;
 *   - rows with the same name and a size or colour are one product with
 *     choices; without a size or colour, a second row with the same name is
 *     a problem, never a second copy;
 *   - a product whose name is already in the shop is left out, so importing
 *     the same file twice adds nothing twice;
 *   - a SKU or barcode the shop already uses, or that two rows share, is a
 *     problem on the later row;
 *   - image cells hold web links (several per cell are fine); anything else
 *     in them is left out with a warning.
 */

/** The most data rows one file may have. */
export const IMPORT_MAX_ROWS = 2000;
/** The biggest file the console reads: under the 4.5 MB a request to the console may carry. */
export const IMPORT_MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Image links kept per product. */
export const IMPORT_MAX_IMAGES = 8;
/** Products sent to the database in one request. */
export const IMPORT_BATCH = 100;

export const IMPORT_FIELDS = [
  "name",
  "price",
  "cost",
  "compare_at_price",
  "stock",
  "sku",
  "barcode",
  "description",
  "category",
  "images",
  "size",
  "colour",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: "Name",
  price: "Price",
  cost: "Cost",
  compare_at_price: "Price before discount",
  stock: "Stock",
  sku: "SKU",
  barcode: "Barcode",
  description: "Description",
  category: "Category",
  images: "Image links",
  size: "Choice: size",
  colour: "Choice: colour",
};

/** For each column of the file, the field it fills, or null to skip it. */
export type ColumnMapping = (ImportField | null)[];

/** Only image links may come from more than one column. */
export function fieldTakesManyColumns(field: ImportField): boolean {
  return field === "images";
}

/**
 * A header or a name made comparable: Unicode-folded, lower case, Arabic
 * spelling variants made one (أ إ آ → ا, ة → ه, ى → ي), short vowels and
 * tatweel dropped, runs of spaces made one.
 */
export function foldText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/** A header with only its letters left, and the digits of "صورة 2" dropped. */
function headerKey(header: string): string {
  return foldText(header).replace(/[^\p{L}]/gu, "");
}

const ALIASES: Record<ImportField, readonly string[]> = {
  name: ["name", "productname", "product", "title", "item", "itemname", "اسم", "الاسم", "اسمالمنتج", "المنتج", "منتج", "اسمالماده", "الماده", "العنوان"],
  price: ["price", "saleprice", "sellingprice", "السعر", "سعر", "سعرالبيع", "البيع"],
  cost: ["cost", "costprice", "purchaseprice", "buyprice", "الكلفه", "كلفه", "التكلفه", "تكلفه", "سعرالشراء", "الشراء", "سعرالجمله", "الجمله"],
  compare_at_price: ["compareatprice", "compareprice", "oldprice", "originalprice", "pricebefore", "السعرالقديم", "سعرقبلالخصم", "قبلالخصم", "السعرقبلالخصم"],
  stock: ["stock", "qty", "quantity", "inventory", "الكميه", "كميه", "العدد", "المخزون", "مخزون", "الكميهالمتوفره"],
  sku: ["sku", "code", "productcode", "itemcode", "الرمز", "رمز", "الكود", "كود", "رمزالمنتج", "كودالمنتج"],
  barcode: ["barcode", "ean", "upc", "الباركود", "باركود"],
  description: ["description", "desc", "details", "الوصف", "وصف", "التفاصيل", "تفاصيل"],
  category: ["category", "collection", "type", "القسم", "قسم", "الفئه", "فئه", "التصنيف", "تصنيف", "النوع"],
  images: ["image", "images", "imageurl", "imagelink", "photo", "photos", "picture", "img", "صوره", "الصوره", "الصور", "صور", "رابطالصوره", "رابطالصور"],
  size: ["size", "الحجم", "حجم", "المقاس", "مقاس", "القياس", "قياس"],
  colour: ["color", "colour", "اللون", "لون"],
};

const FIELD_BY_ALIAS: ReadonlyMap<string, ImportField> = new Map(
  IMPORT_FIELDS.flatMap((field) => ALIASES[field].map((alias) => [headerKey(alias), field] as const)),
);

/** The field each column most likely fills, from its header. Each field once, except image links. */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const taken = new Set<ImportField>();
  return headers.map((header) => {
    const field = FIELD_BY_ALIAS.get(headerKey(header));
    if (!field || (taken.has(field) && !fieldTakesManyColumns(field))) return null;
    taken.add(field);
    return field;
  });
}

/** A cell read as a number: absent (empty), the number, or not a number. */
export type CellNumber = { kind: "empty" } | { kind: "number"; value: number } | { kind: "bad" };

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function westernDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * An amount in Iraqi dinars, as merchants write it: "35,000", "35.000",
 * "٣٥٬٠٠٠", "35000 د.ع", "IQD 35000". Whole dinars: a fraction is rounded.
 */
export function readAmount(cell: string): CellNumber {
  const text = westernDigits(cell)
    .replace(/٬/g, ",")
    .replace(/٫/g, ".")
    .replace(/iqd|د\.?\s?ع|دينار|ع\.?\s?د/gi, "")
    .replace(/[\s ,]/g, "");
  if (text === "") return { kind: "empty" };
  // Dots every three digits are thousands, never a fraction of a dinar.
  const plain = /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text;
  if (!/^\d+(\.\d+)?$/.test(plain)) return { kind: "bad" };
  return { kind: "number", value: Math.round(Number(plain)) };
}

/** A count of pieces: a whole number, 0 or more. */
export function readCount(cell: string): CellNumber {
  const text = westernDigits(cell).replace(/[\s ,]/g, "");
  if (text === "") return { kind: "empty" };
  if (!/^\d+(\.0+)?$/.test(text)) return { kind: "bad" };
  return { kind: "number", value: Number.parseInt(text, 10) };
}

/** The web links in an image cell, and how many other bits were in it. */
export function readImageLinks(cell: string): { links: string[]; notLinks: number } {
  const links: string[] = [];
  let notLinks = 0;
  for (const token of cell.split(/[\s,;|]+/)) {
    if (!token) continue;
    let url: URL;
    try {
      url = new URL(token);
    } catch {
      notLinks += 1;
      continue;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      notLinks += 1;
      continue;
    }
    if (!links.includes(url.href)) links.push(url.href);
  }
  return { links, notLinks };
}

const choiceSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(["size", "color"]),
  values: z.array(z.string().min(1).max(50)).min(1).max(50),
});

const variantSchema = z.object({
  name: z.string().min(1).max(120),
  option_values: z.record(z.string(), z.string()),
  price: z.number().int().positive().max(1_000_000_000),
  cost: z.number().int().min(0).max(1_000_000_000).nullable(),
  compare_at_price: z.number().int().positive().max(1_000_000_000).nullable(),
  stock: z.number().int().min(0).max(1_000_000),
  sku: z.string().min(1).max(100).nullable(),
  barcode: z.string().min(1).max(100).nullable(),
});

/** One product as the import sends it to the database (admin_import_products). */
export const importProductSchema = z.object({
  /** The file row it starts on, as text: the answer names products by it. */
  key: z.string().regex(/^\d{1,5}$/),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).nullable(),
  description: z.string().max(5000).nullable(),
  category: z.string().min(1).max(100).nullable(),
  category_slug: z.string().min(1).max(100).nullable(),
  price: z.number().int().positive().max(1_000_000_000),
  cost: z.number().int().min(0).max(1_000_000_000).nullable(),
  compare_at_price: z.number().int().positive().max(1_000_000_000).nullable(),
  stock: z.number().int().min(0).max(1_000_000),
  sku: z.string().min(1).max(100).nullable(),
  barcode: z.string().min(1).max(100).nullable(),
  options: z.array(choiceSchema).max(2),
  variants: z.array(variantSchema).max(100),
});

export type ImportProduct = z.infer<typeof importProductSchema>;

/** A product the plan adds: what the database gets, its image links, and its file rows. */
export interface PlannedProduct extends ImportProduct {
  images: string[];
  rows: number[];
}

/** Something about one file row. */
export interface RowNote {
  row: number;
  text: string;
}

/**
 * A product the shop already has, with no image yet, whose rows in the file
 * have image links: the import fetches them for it. That is how a second
 * read of a file finishes a run whose images were cut short (a lost answer,
 * a closed tab).
 */
export interface PhotosOnly {
  productId: string;
  /** Its first file row with links. */
  row: number;
  links: string[];
}

export interface ImportPlan {
  products: PlannedProduct[];
  /** Rows left out because something in them is wrong. */
  problems: RowNote[];
  /** Rows left out because the product is already in the shop. */
  inShop: RowNote[];
  /** Products already in the shop that get the file's photos. */
  photosOnly: PhotosOnly[];
  /** Rows imported with something dropped (an image cell bit that is not a link). */
  warnings: RowNote[];
}

/** What the shop has now, so the plan leaves out what it already has. */
export interface ShopProducts {
  names: readonly string[];
  /** SKUs of its products and their choices. */
  skus: readonly string[];
  barcodes: readonly string[];
  /** Its products (not archived) with no image yet. */
  noImages: readonly { id: string; name: string }[];
}

/** The words for a row left out because its name is in the shop. */
export const IN_SHOP_NOTE = "A product with this name is already in the shop: left out";
export const IN_SHOP_PHOTOS_NOTE = "Already in the shop with no photo: only its photos are added";

interface ParsedRow {
  row: number;
  name: string;
  price: number;
  cost: number | null;
  compareAt: number | null;
  stock: number;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  category: string | null;
  images: string[];
  size: string | null;
  colour: string | null;
}

const clean = (text: string | undefined): string => (text ?? "").replace(/\s+/g, " ").trim();
const orNull = (text: string): string | null => (text === "" ? null : text);

/** Every cell of `field` in one row: one column, or several for image links. */
function cellsOf(cells: readonly string[], mapping: ColumnMapping, field: ImportField): string[] {
  return mapping.flatMap((f, i) => (f === field ? [cells[i] ?? ""] : []));
}

const firstCell = (cells: readonly string[], mapping: ColumnMapping, field: ImportField): string =>
  cellsOf(cells, mapping, field)[0] ?? "";

const amountWords: Record<"price" | "cost" | "compare_at_price", string> = {
  price: "Price",
  cost: "Cost",
  compare_at_price: "Price before discount",
};

/** One row read, or the reason it cannot be. Null for a row with nothing in it. */
function readRow(
  cells: readonly string[],
  row: number,
  mapping: ColumnMapping,
  warnings: RowNote[],
): ParsedRow | { problem: string } | null {
  if (mapping.every((field, i) => field === null || clean(cells[i]) === "")) return null;

  const name = clean(firstCell(cells, mapping, "name"));
  if (name === "") return { problem: "No name" };
  if (name.length > 200) return { problem: "The name is longer than 200 letters" };

  const amounts: Partial<Record<"price" | "cost" | "compare_at_price", number | null>> = {};
  for (const field of ["price", "cost", "compare_at_price"] as const) {
    const raw = clean(firstCell(cells, mapping, field));
    const read = readAmount(raw);
    if (read.kind === "bad") return { problem: `${amountWords[field]} "${raw}" is not a number` };
    amounts[field] = read.kind === "number" ? read.value : null;
  }
  const price = amounts.price ?? null;
  if (price === null) return { problem: "No price" };
  if (price <= 0) return { problem: "The price is 0" };
  if (price > 1_000_000_000) return { problem: "The price is too big" };
  if ((amounts.cost ?? 0) > 1_000_000_000) return { problem: "The cost is too big" };

  const stockRaw = clean(firstCell(cells, mapping, "stock"));
  const stock = readCount(stockRaw);
  if (stock.kind === "bad") return { problem: `Stock "${stockRaw}" is not a whole number` };
  if (stock.kind === "number" && stock.value > 1_000_000) return { problem: "The stock is too big" };

  const sku = orNull(clean(firstCell(cells, mapping, "sku")));
  const barcode = orNull(clean(firstCell(cells, mapping, "barcode")));
  if ((sku?.length ?? 0) > 100) return { problem: "The SKU is longer than 100 letters" };
  if ((barcode?.length ?? 0) > 100) return { problem: "The barcode is longer than 100 letters" };

  const description = orNull((firstCell(cells, mapping, "description") ?? "").trim());
  if ((description?.length ?? 0) > 5000) return { problem: "The description is longer than 5,000 letters" };
  const category = orNull(clean(firstCell(cells, mapping, "category")));
  if ((category?.length ?? 0) > 100) return { problem: "The category is longer than 100 letters" };

  const size = orNull(clean(firstCell(cells, mapping, "size")));
  const colour = orNull(clean(firstCell(cells, mapping, "colour")));
  if ((size?.length ?? 0) > 50 || (colour?.length ?? 0) > 50) return { problem: "A size or colour is longer than 50 letters" };

  const images: string[] = [];
  let notLinks = 0;
  for (const cell of cellsOf(cells, mapping, "images")) {
    const read = readImageLinks(cell);
    notLinks += read.notLinks;
    for (const link of read.links) if (!images.includes(link)) images.push(link);
  }
  if (notLinks > 0) {
    warnings.push({ row, text: "Text in the image cell that is not a web link: left out" });
  }

  // A "before" price that is not above the price is no discount.
  const compareAt = amounts.compare_at_price ?? null;
  if (compareAt !== null && compareAt <= price) {
    warnings.push({ row, text: "Price before discount is not above the price: left empty" });
  }

  return {
    row,
    name,
    price,
    cost: amounts.cost ?? null,
    compareAt: compareAt !== null && compareAt > price ? compareAt : null,
    stock: stock.kind === "number" ? stock.value : 0,
    sku,
    barcode,
    description,
    category,
    images,
    size,
    colour,
  };
}

/** What a choice column is called on the product: its header, or the plain word. */
function choiceName(headers: readonly string[], mapping: ColumnMapping, field: "size" | "colour"): string {
  const header = clean(headers[mapping.indexOf(field)]).slice(0, 50);
  return header || (field === "size" ? "المقاس" : "اللون");
}

/**
 * The import, planned from the file's rows (the rows under the header; the
 * first one is file row `firstRow`), its column mapping and what the shop
 * already has.
 */
export function planImport(input: {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  firstRow: number;
  mapping: ColumnMapping;
  shop: ShopProducts;
}): ImportPlan {
  const { headers, rows, firstRow, mapping, shop } = input;
  const problems: RowNote[] = [];
  const inShop: RowNote[] = [];
  const warnings: RowNote[] = [];

  const shopNames = new Set(shop.names.map(foldText));
  // A name the shop has once, on a product with no image: the file's links
  // for it are fetched. Two shop products with one name: neither, as the
  // file cannot say which.
  const nameCount = new Map<string, number>();
  for (const name of shop.names) nameCount.set(foldText(name), (nameCount.get(foldText(name)) ?? 0) + 1);
  const noImage = new Map(
    shop.noImages.filter((p) => nameCount.get(foldText(p.name)) === 1).map((p) => [foldText(p.name), p.id] as const),
  );
  const photos = new Map<string, PhotosOnly>();
  const shopSkus = new Set(shop.skus);
  const shopBarcodes = new Set(shop.barcodes);
  const skuRow = new Map<string, number>();
  const barcodeRow = new Map<string, number>();

  /** Why a row's SKU or barcode cannot be used, or null; a usable one is taken by the row. */
  const codeClash = (read: ParsedRow, row: number): string | null => {
    if (read.sku !== null) {
      if (shopSkus.has(read.sku)) return `SKU "${read.sku}" is already used in the shop`;
      const earlier = skuRow.get(read.sku);
      if (earlier !== undefined) return `Same SKU as row ${earlier}`;
    }
    if (read.barcode !== null) {
      if (shopBarcodes.has(read.barcode)) return `Barcode "${read.barcode}" is already used in the shop`;
      const earlier = barcodeRow.get(read.barcode);
      if (earlier !== undefined) return `Same barcode as row ${earlier}`;
    }
    if (read.sku !== null) skuRow.set(read.sku, row);
    if (read.barcode !== null) barcodeRow.set(read.barcode, row);
    return null;
  };

  // Rows by product name, in the order the names first appear.
  const groups = new Map<string, ParsedRow[]>();
  rows.forEach((cells, i) => {
    const row = firstRow + i;
    const read = readRow(cells, row, mapping, warnings);
    if (read === null) return;
    if ("problem" in read) {
      problems.push({ row, text: read.problem });
      return;
    }
    const folded = foldText(read.name);
    if (shopNames.has(folded)) {
      const productId = noImage.get(folded);
      if (productId !== undefined && read.images.length > 0) {
        const entry = photos.get(folded) ?? { productId, row, links: [] };
        for (const link of read.images) if (!entry.links.includes(link) && entry.links.length < IMPORT_MAX_IMAGES) entry.links.push(link);
        photos.set(folded, entry);
        inShop.push({ row, text: IN_SHOP_PHOTOS_NOTE });
      } else {
        inShop.push({ row, text: IN_SHOP_NOTE });
      }
      return;
    }
    const clash = codeClash(read, row);
    if (clash !== null) {
      problems.push({ row, text: clash });
      return;
    }
    groups.set(folded, [...(groups.get(folded) ?? []), read]);
  });

  const choiceFields = (["size", "colour"] as const)
    .filter((field) => mapping.includes(field))
    .sort((a, b) => mapping.indexOf(a) - mapping.indexOf(b));

  const products: PlannedProduct[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    const used = choiceFields.filter((field) => group.some((r) => r[field] !== null));

    if (used.length === 0) {
      for (const other of group.slice(1)) problems.push({ row: other.row, text: `Same name as row ${first.row}` });
      products.push({
        key: String(first.row),
        name: first.name,
        slug: slugify(first.name) || null,
        description: first.description,
        category: first.category,
        category_slug: first.category === null ? null : slugify(first.category) || null,
        price: first.price,
        cost: first.cost,
        compare_at_price: first.compareAt,
        stock: first.stock,
        sku: first.sku,
        barcode: first.barcode,
        options: [],
        variants: [],
        images: first.images.slice(0, IMPORT_MAX_IMAGES),
        rows: [first.row],
      });
      continue;
    }

    // A product with choices: every row names a value for each choice the
    // product has, and no two rows name the same values.
    const kept: ParsedRow[] = [];
    const comboRow = new Map<string, number>();
    for (const r of group) {
      const missing = used.filter((field) => r[field] === null);
      if (missing.length > 0) {
        const what = missing.map((field) => (field === "size" ? "size" : "colour")).join(" or ");
        problems.push({ row: r.row, text: `Same name as row ${first.row} but no ${what}` });
        continue;
      }
      const combo = JSON.stringify(used.map((field) => foldText(r[field] ?? "")));
      const earlier = comboRow.get(combo);
      if (earlier !== undefined) {
        problems.push({ row: r.row, text: `Same name and choice as row ${earlier}` });
        continue;
      }
      comboRow.set(combo, r.row);
      kept.push(r);
    }
    if (kept.length === 0) continue;

    if (kept.length > 100) {
      for (const r of kept.slice(100)) problems.push({ row: r.row, text: "A product may have 100 choices at most" });
      kept.length = 100;
    }
    // A choice lists 50 values at most, as the product editor keeps it: a
    // row with a 51st size or colour is left out, not added with a value
    // its product does not list.
    for (const field of used) {
      const values = new Set<string>();
      for (let i = 0; i < kept.length; i++) {
        const value = kept[i][field] ?? "";
        if (values.has(value) || values.size < 50) {
          values.add(value);
          continue;
        }
        problems.push({ row: kept[i].row, text: `A product may have 50 ${field === "size" ? "sizes" : "colours"} at most` });
        kept.splice(i, 1);
        i--;
      }
    }

    const options = used.map((field) => ({
      name: choiceName(headers, mapping, field),
      type: field === "size" ? ("size" as const) : ("color" as const),
      values: [...new Set(kept.map((r) => r[field] ?? ""))],
    }));
    const head = kept[0];
    const category = kept.find((r) => r.category !== null)?.category ?? null;
    const cheapest = kept.reduce((low, r) => (r.price < low.price ? r : low), head);
    const images: string[] = [];
    for (const r of kept) for (const link of r.images) if (!images.includes(link)) images.push(link);

    products.push({
      key: String(head.row),
      name: head.name,
      slug: slugify(head.name) || null,
      description: kept.find((r) => r.description !== null)?.description ?? null,
      category,
      category_slug: category === null ? null : slugify(category) || null,
      price: cheapest.price,
      cost: cheapest.cost,
      compare_at_price: null,
      // The choices hold the stock, as the product editor keeps it.
      stock: 0,
      sku: null,
      barcode: null,
      options,
      variants: kept.map((r) => ({
        name: used.map((field) => r[field]).join(" / "),
        option_values: Object.fromEntries(used.map((field, i) => [options[i].name, r[field] ?? ""])),
        price: r.price,
        cost: r.cost,
        compare_at_price: r.compareAt,
        stock: r.stock,
        sku: r.sku,
        barcode: r.barcode,
      })),
      images: images.slice(0, IMPORT_MAX_IMAGES),
      rows: kept.map((r) => r.row),
    });
  }

  const byRow = (a: RowNote, b: RowNote) => a.row - b.row;
  return {
    products,
    problems: problems.sort(byRow),
    inShop: inShop.sort(byRow),
    photosOnly: [...photos.values()],
    warnings: warnings.sort(byRow),
  };
}

/** What the database answers for one batch. */
export const importBatchResultSchema = z.object({
  created: z.array(z.object({ key: z.string(), product_id: z.string().uuid() })),
  /** Products another import or a person added since the file was read. */
  skipped: z.array(z.object({ key: z.string(), reason: z.literal("in_shop") })),
});

export type ImportBatchResult = z.infer<typeof importBatchResultSchema>;
