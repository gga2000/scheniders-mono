import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IMPORT_MAX_CELL_CHARS,
  MAX_UNPACKED_BYTES,
  PART_LIMITS,
  cellText,
  decodeText,
  hasLinksRoot,
  parseCsv,
  readImportFile,
  zipUnpacked,
} from "./product-import-file";

const utf8 = (text: string) => new TextEncoder().encode(text);

async function xlsx(build: (sheet: ExcelJS.Worksheet, book: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("المنتجات");
  build(sheet, book);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

describe("parseCsv", () => {
  it("reads quoted cells with the delimiter, quotes and line breaks in them", () => {
    expect(parseCsv('name,price\r\n"عطر, عود",35000\n"قميص ""قطن""","1,000"\n"سطر\nثاني",5').rows).toEqual([
      ["name", "price"],
      ["عطر, عود", "35000"],
      ['قميص "قطن"', "1,000"],
      ["سطر\nثاني", "5"],
    ]);
  });

  it("finds a semicolon or tab delimiter from the first line", () => {
    expect(parseCsv("name;price\nعطر;35,000").rows).toEqual([["name", "price"], ["عطر", "35,000"]]);
    expect(parseCsv("name\tprice\nعطر\t35000\n").rows).toEqual([["name", "price"], ["عطر", "35000"]]);
  });

  // Audit round 20: 4 MB of line breaks was built into 4,194,304 rows (about 900 MB).
  it("keeps only the rows asked for, and names the first row past them with something in it", () => {
    const breaks = "\n".repeat(4 * 1024 * 1024);
    const started = Date.now();
    expect(parseCsv(breaks, 2100)).toEqual({ rows: Array.from({ length: 2100 }, () => [""]), farRow: 0 });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(parseCsv(`a,b\n1,2\n\n  ,\n"x\ny"\nlast`, 2)).toEqual({ rows: [["a", "b"], ["1", "2"]], farRow: 5 });
    expect(parseCsv("a\nb", 5)).toEqual({ rows: [["a"], ["b"]], farRow: 0 });
  });
});

describe("decodeText", () => {
  it("reads UTF-8 with its mark, and falls back to the Arabic Windows encoding", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("اسم")]))).toBe("اسم");
    // «عطر» in windows-1256.
    expect(decodeText(new Uint8Array([0xda, 0xd8, 0xd1]))).toBe("عطر");
  });
});

describe("readImportFile", () => {
  it("reads a CSV under its first non-empty row, keeping row numbers true", async () => {
    const read = await readImportFile(utf8("\n\nالاسم,السعر,\nعطر,35000,\n\nمسك,9000,\n\n"), "products.csv");
    expect(read).toEqual({
      ok: true,
      file: { sheet: null, headers: ["الاسم", "السعر"], rows: [["عطر", "35000"], ["", ""], ["مسك", "9000"]], firstRow: 4 },
    });
  });

  it("reads the first sheet of a workbook, cell kinds as text", async () => {
    const bytes = await xlsx((sheet, book) => {
      book.addWorksheet("empty");
      sheet.addRow(["الاسم", "السعر", "صورة", "الوصف", "التاريخ"]);
      sheet.addRow([
        "عطر",
        35000,
        { text: "https://a.example/1.jpg", hyperlink: "https://a.example/1.jpg" },
        { richText: [{ text: "عطر " }, { text: "فاخر" }] },
        new Date(Date.UTC(2026, 10, 19)),
      ]);
      sheet.addRow(["مسك", { formula: "1000*9", result: 9000 }, { text: "صورة", hyperlink: "https://a.example/2.jpg" }, null, null]);
    });
    const read = await readImportFile(bytes, "Products.XLSX");
    expect(read).toEqual({
      ok: true,
      file: {
        sheet: "المنتجات",
        headers: ["الاسم", "السعر", "صورة", "الوصف", "التاريخ"],
        rows: [
          ["عطر", "35000", "https://a.example/1.jpg", "عطر فاخر", "2026-11-19"],
          ["مسك", "9000", "صورة", "", ""],
        ],
        firstRow: 2,
      },
    });
  });

  it("refuses what is not a product list, saying what to send instead", async () => {
    expect(await readImportFile(utf8("a"), "old.xls")).toMatchObject({ ok: false, error: expect.stringContaining("save it as .xlsx or .csv") });
    expect(await readImportFile(utf8("a"), "list.pdf")).toMatchObject({ ok: false });
    expect(await readImportFile(utf8("\n \n"), "empty.csv")).toEqual({ ok: false, error: "The file is empty." });
    expect(await readImportFile(utf8("name,price\n"), "header.csv")).toMatchObject({ ok: false, error: expect.stringContaining("no products") });
    expect(await readImportFile(utf8("not a zip"), "broken.xlsx")).toMatchObject({ ok: false, error: expect.stringContaining("could not be opened") });
    const many = ["name", ...Array.from({ length: 2001 }, (_, i) => `p${i}`)].join("\n");
    expect(await readImportFile(utf8(many), "many.csv")).toMatchObject({ ok: false, error: expect.stringContaining("2,001 rows") });
    const wide = Array.from({ length: 51 }, (_, i) => `c${i}`).join(",") + "\n" + "x,".repeat(51);
    expect(await readImportFile(utf8(wide), "wide.csv")).toMatchObject({ ok: false, error: expect.stringContaining("51 columns") });
  });

  it("refuses a sheet with something far below the rows a file may have", async () => {
    const bytes = await xlsx((sheet) => {
      sheet.addRow(["name", "price"]);
      sheet.addRow(["عطر", 1000]);
      sheet.getCell("A5000").value = "stray";
    });
    expect(await readImportFile(bytes, "far.xlsx")).toMatchObject({ ok: false, error: expect.stringContaining("row 5,000") });
  });

  it("counts every row of a sheet that has too many, and reads the sheets after the first one through", async () => {
    const bytes = await xlsx((sheet, book) => {
      sheet.addRow(["name", "price"]);
      for (let n = 0; n < 2500; n++) sheet.addRow([`p${n}`, n]);
      book.addWorksheet("later").addRow(["other"]);
    });
    expect(await readImportFile(bytes, "many.xlsx")).toMatchObject({ ok: false, error: expect.stringContaining("The sheet has 2,501 rows") });
  });

  // Audit round 20: the whole workbook was loaded, merge ranges applied, before
  // any row was counted; this 1.5 KB file ran the server out of memory.
  it("reads a tiny workbook whose one merge covers the whole sheet, without building the merge", async () => {
    const bytes = workbookWithMerge("A1:XFD1048576");
    expect(bytes.length).toBeLessThan(2_000);
    const started = Date.now();
    expect(await readImportFile(bytes, "merged.xlsx")).toEqual({
      ok: true,
      file: { sheet: "Sheet1", headers: ["name", "price"], rows: [["عطر", "35000"]], firstRow: 2 },
    });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("refuses a CSV with something far below the rows a file may have, without reading the rest", async () => {
    const lines = ["name,price", ...Array.from({ length: 2000 }, (_, i) => `p${i},1`), ...Array.from({ length: 200 }, () => ""), "stray"];
    expect(await readImportFile(utf8(lines.join("\n")), "far.csv")).toMatchObject({ ok: false, error: expect.stringContaining("row 2,202") });
    expect(await readImportFile(utf8("\n".repeat(4 * 1024 * 1024)), "breaks.csv")).toEqual({ ok: false, error: "The file is empty." });
    // Blank lines after the products are not something below them.
    const trailing = ["name,price", "عطر,1", ...Array.from({ length: 3000 }, () => "")].join("\n");
    expect(await readImportFile(utf8(trailing), "trailing.csv")).toMatchObject({ ok: true, file: { rows: [["عطر", "1"]] } });
  });
});

interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** The unpacked size the headers state, when not the true one. */
  stated?: number;
  /** Stored as it is, not deflated. */
  stored?: boolean;
  /** In the file, but left out of the directory. */
  unlisted?: boolean;
  /** Sizes left out of the header and given in a data descriptor after the data (bit 3). */
  descriptor?: boolean;
}

/** A zip of the entries in the order given; `listTwice` names an entry the directory lists a second time. */
function zip(entries: ZipEntry[], { listTwice }: { listTwice?: string } = {}): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  let listed = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const method = entry.stored ? 0 : 8;
    const packed = entry.stored ? Buffer.from(entry.data) : deflateRawSync(entry.data);
    const stated = entry.stated ?? entry.data.length;
    const flags = entry.descriptor ? 0x08 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(entry.descriptor ? 0 : packed.length, 18);
    local.writeUInt32LE(entry.descriptor ? 0 : stated, 22);
    local.writeUInt16LE(name.length, 26);
    const descriptor = Buffer.alloc(entry.descriptor ? 16 : 0);
    if (entry.descriptor) {
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(packed.length, 8);
      descriptor.writeUInt32LE(stated, 12);
    }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(stated, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed, descriptor);
    if (!entry.unlisted) {
      const copies = entry.name === listTwice ? 2 : 1;
      for (let n = 0; n < copies; n++) centrals.push(central, name);
      listed += copies;
    }
    offset += local.length + name.length + packed.length + descriptor.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(listed, 8);
  end.writeUInt16LE(listed, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data: Uint8Array) => {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const XML = '<?xml version="1.0" encoding="UTF-8"?>';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** A sheet's XML around the rows given. */
const sheetXml = (rows: string, after = "") => `${XML}<worksheet xmlns="${MAIN}"><sheetData>${rows}</sheetData>${after}</worksheet>`;

/** The two rows of inline text the hand-built workbooks hold. */
const TWO_ROWS =
  '<row r="1"><c r="A1" t="inlineStr"><is><t>name</t></is></c><c r="B1" t="inlineStr"><is><t>price</t></is></c></row>' +
  '<row r="2"><c r="A2" t="inlineStr"><is><t>عطر</t></is></c><c r="B2"><v>35000</v></c></row>';

/**
 * The parts of an .xlsx, built by hand: one sheet per XML given, in the
 * order Excel saves them. With no shared strings, the reader keeps every
 * sheet waiting in a temporary file until the file's end.
 */
function bookEntries(sheets: string[]): ZipEntry[] {
  const files: Array<[string, string]> = [
    [
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        sheets.map((_, n) => `<Override PartName="/xl/worksheets/sheet${n + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        "</Types>",
    ],
    ["_rels/.rels", `${XML}<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${OFFICE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    [
      "xl/workbook.xml",
      `${XML}<workbook xmlns="${MAIN}" xmlns:r="${OFFICE}"><sheets>` +
        sheets.map((_, n) => `<sheet name="Sheet${n + 1}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`).join("") +
        "</sheets></workbook>",
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="${RELS}">` +
        sheets.map((_, n) => `<Relationship Id="rId${n + 1}" Type="${OFFICE}/worksheet" Target="worksheets/sheet${n + 1}.xml"/>`).join("") +
        "</Relationships>",
    ],
    ...sheets.map((xml, n): [string, string] => [`xl/worksheets/sheet${n + 1}.xml`, xml]),
  ];
  return files.map(([name, text]) => ({ name, data: utf8(text) }));
}

/** The smallest .xlsx with two rows of inline text and one merge range: built by hand, as no writer builds such a merge. */
function workbookWithMerge(range: string): Uint8Array {
  const entries = bookEntries([sheetXml(TWO_ROWS, `<mergeCells count="1"><mergeCell ref="${range}"/></mergeCells>`)]);
  const bytes = zip(entries);
  // The local and central headers carry each entry's CRC, as Excel writes them.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const crcs = entries.map((entry) => crc32(entry.data));
  for (const crc of crcs) {
    view.setUint32(at + 14, crc, true);
    at += 30 + view.getUint16(at + 26, true) + view.getUint32(at + 18, true);
  }
  for (const crc of crcs) {
    view.setUint32(at + 16, crc, true);
    at += 46 + view.getUint16(at + 28, true);
  }
  return bytes;
}

const CANNOT_OPEN = { ok: false, error: "This .xlsx file could not be opened. Save it again from Excel, or send a CSV." };
const TOO_BIG = { ok: false, error: "This .xlsx file is too big inside. Send a CSV of the products instead." };
const UNREADABLE = { ok: false, reason: "unreadable" };

describe("zipUnpacked", () => {
  it("adds up what a workbook really unpacks to, and refuses what is not a zip", async () => {
    const bytes = await xlsx((sheet) => sheet.addRow(["name"]));
    const unpacked = zipUnpacked(bytes);
    expect(unpacked.ok && unpacked.bytes).toBeGreaterThan(bytes.length);
    expect(zipUnpacked(utf8("no zip here at all, just text"))).toEqual({ ok: false, reason: "unreadable" });
  });

  it("counts the bytes that really come out, not the sizes the zip states", () => {
    const zeros = new Uint8Array(2 * 1024 * 1024);
    // States 1,000 bytes, unpacks to 2 MB: past a 1 MB limit, found while inflating.
    expect(zipUnpacked(zip([{ name: "xl/a.xml", data: zeros, stated: 1000 }]), 1024 * 1024)).toEqual({ ok: false, reason: "too_big" });
    // Under the limit but not the size it states: not a file Excel saved.
    expect(zipUnpacked(zip([{ name: "xl/a.xml", data: zeros, stated: 1000 }]), 4 * 1024 * 1024)).toEqual({ ok: false, reason: "unreadable" });
    // Many honest entries add up past the limit together.
    const parts = Array.from({ length: 3 }, (_, n) => ({ name: `xl/${n}.xml`, data: new Uint8Array(400 * 1024) }));
    expect(zipUnpacked(zip(parts), 1024 * 1024)).toEqual({ ok: false, reason: "too_big" });
    expect(zipUnpacked(zip(parts), 2 * 1024 * 1024)).toEqual({ ok: true, bytes: 3 * 400 * 1024 });
  });

  it("refuses a small .xlsx that lies about unpacking past the limit, before the workbook reader opens it", async () => {
    const bomb = zip([{ name: "xl/sharedStrings.xml", data: new Uint8Array(MAX_UNPACKED_BYTES + 1024), stated: 1000 }]);
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(await readImportFile(bomb, "bomb.xlsx")).toEqual(TOO_BIG);
  });

  // Audit round 21: the workbook reader reads the entries from the file's
  // first byte, the count read the directory; 1.6 GB of shared strings the
  // directory left out took a 4 MB file to 4.2 GB of memory.
  it("refuses an entry the directory leaves out, wherever it sits, before the workbook reader opens the file", async () => {
    const book = bookEntries([sheetXml(TWO_ROWS)]);
    expect(await readImportFile(zip(book), "fine.xlsx")).toMatchObject({ ok: true, file: { headers: ["name", "price"] } });
    const hidden: ZipEntry = { name: "xl/sharedStrings.xml", data: utf8("<si><t>ab</t></si>".repeat(100_000)), unlisted: true };
    for (const bytes of [zip([hidden, ...book]), zip([...book.slice(0, 3), hidden, ...book.slice(3)]), zip([...book, hidden])]) {
      expect(zipUnpacked(bytes)).toEqual(UNREADABLE);
      expect(await readImportFile(bytes, "hidden.xlsx")).toEqual(CANNOT_OPEN);
    }
  });

  it("refuses an entry the directory lists twice, and bytes outside the entries", () => {
    const book = bookEntries([sheetXml(TWO_ROWS)]);
    expect(zipUnpacked(zip(book, { listTwice: "xl/workbook.xml" }))).toEqual(UNREADABLE);
    const bytes = zip(book);
    expect(zipUnpacked(new Uint8Array([0, ...bytes]))).toEqual(UNREADABLE);
  });

  it("finds an entry's end as the reader does when its sizes follow in a data descriptor", async () => {
    const book = bookEntries([sheetXml(TWO_ROWS)]).map((entry) => ({ ...entry, descriptor: true }));
    expect(zipUnpacked(zip(book))).toMatchObject({ ok: true });
    expect(await readImportFile(zip(book), "descriptors.xlsx")).toMatchObject({ ok: true, file: { rows: [["عطر", "35000"]] } });
    // Stored data holding the descriptor's mark: the reader stops there, inside what the directory lists.
    const marked = new Uint8Array([1, 2, 0x50, 0x4b, 0x07, 0x08, 3, 4]);
    expect(zipUnpacked(zip([{ name: "xl/a.bin", data: marked, stored: true, descriptor: true }]))).toEqual(UNREADABLE);
    expect(zipUnpacked(zip([{ name: "xl/a.bin", data: marked, stored: true }]))).toEqual({ ok: true, bytes: 8 });
  });

  it("holds the parts the reader keeps whole to their own smaller limits", async () => {
    const strings = PART_LIMITS["xl/sharedStrings.xml"];
    const styles = PART_LIMITS["xl/styles.xml"];
    expect(strings).toBe(8 * 1024 * 1024);
    expect(styles).toBe(2 * 1024 * 1024);
    const book = bookEntries([sheetXml(TWO_ROWS)]);
    const withPart = (name: string, size: number) => zip([...book, { name, data: new Uint8Array(size) }]);
    expect(zipUnpacked(withPart("xl/sharedStrings.xml", strings))).toMatchObject({ ok: true });
    expect(zipUnpacked(withPart("xl/sharedStrings.xml", strings + 1))).toEqual({ ok: false, reason: "too_big" });
    expect(zipUnpacked(withPart("xl/styles.xml", styles + 1))).toEqual({ ok: false, reason: "too_big" });
    expect(await readImportFile(withPart("xl/styles.xml", styles + 1), "styles.xlsx")).toEqual(TOO_BIG);
    // Any other part only counts toward the whole file's limit.
    expect(zipUnpacked(withPart("xl/theme/theme1.xml", strings + 1))).toMatchObject({ ok: true });
  });
});

describe("the reader's temporary files", () => {
  let dir = "";
  const before = process.env.TMPDIR;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "import-read-"));
    process.env.TMPDIR = dir;
  });
  afterEach(() => {
    // Setting it to undefined would set the text "undefined".
    if (before === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = before;
    rmSync(dir, { recursive: true, force: true });
  });

  // Audit round 21: Excel saves the shared strings after the sheets, so the
  // reader kept every sheet in a temporary file, and a sheet that broke it
  // left the files of the sheets after it until the server was recycled.
  it("reads the sheets as they come, so a sheet that breaks the reader leaves no temporary file", async () => {
    const broken = sheetXml('<row><c r="A1" t="inlineStr"><is><t>name</t></is></c></row>');
    const fine = sheetXml(TWO_ROWS);
    expect(await readImportFile(zip(bookEntries([broken, fine])), "broken.xlsx")).toEqual(CANNOT_OPEN);
    expect(readdirSync(dir)).toEqual([]);
    expect(await readImportFile(zip(bookEntries([fine, fine])), "two.xlsx")).toMatchObject({ ok: true, file: { sheet: "Sheet1" } });
    // As ExcelJS saves it: the sheet, then the shared strings, the workbook last.
    const saved = await xlsx((sheet) => {
      sheet.addRow(["name", "price"]);
      sheet.addRow(["عطر", 35000]);
    });
    expect(await readImportFile(saved, "saved.xlsx")).toMatchObject({ ok: true, file: { sheet: "المنتجات", rows: [["عطر", "35000"]] } });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses a workbook without its workbook part or its links", async () => {
    const book = bookEntries([sheetXml(TWO_ROWS)]);
    for (const name of ["xl/workbook.xml", "xl/_rels/workbook.xml.rels"]) {
      expect(await readImportFile(zip(book.filter((entry) => entry.name !== name)), "partial.xlsx")).toEqual(CANNOT_OPEN);
    }
  });

  // Audit round 22: a links part with no Relationships element leaves the
  // reader without the links, so it wrote each sheet to a temporary file, and
  // a broken first sheet left the rest behind.
  it("refuses links with no Relationships element, before any sheet is read", async () => {
    const broken = sheetXml('<row r="1"></sheetData>');
    const fine = sheetXml(TWO_ROWS);
    // Round 23: the tag's text inside an instruction or a DOCTYPE is no element either.
    for (const links of [
      "",
      XML,
      `${XML}<!-- <Relationships> -->`,
      `${XML}<r:Relationships xmlns:r="${RELS}"/>`,
      `${XML}<?links <Relationships ?>`,
      `${XML}<!DOCTYPE r [<!ENTITY e "<Relationships">]><r/>`,
    ]) {
      const book = bookEntries([broken, fine, fine]).map((entry) =>
        entry.name === "xl/_rels/workbook.xml.rels" ? { ...entry, data: utf8(links) } : entry,
      );
      expect(await readImportFile(zip(book), "emptyrels.xlsx")).toEqual(CANNOT_OPEN);
      expect(readdirSync(dir)).toEqual([]);
    }
    // Stored, not deflated, the same links read as they do deflated.
    const stored = bookEntries([fine]).map((entry) => (entry.name === "xl/_rels/workbook.xml.rels" ? { ...entry, stored: true } : entry));
    expect(await readImportFile(zip(stored), "stored.xlsx")).toMatchObject({ ok: true, file: { sheet: "Sheet1" } });
  });

  it("finds the Relationships element as the reader does", () => {
    expect(hasLinksRoot(`${XML}<Relationships xmlns="${RELS}"></Relationships>`)).toBe(true);
    expect(hasLinksRoot("<Relationships/>")).toBe(true);
    expect(hasLinksRoot("<Relationships\n xmlns='x'>")).toBe(true);
    expect(hasLinksRoot(`${XML}\r\n<!-- saved by hand -->\n<Relationships xmlns="${RELS}"/>`)).toBe(true);
    expect(hasLinksRoot("<!-- <Relationships> --><RelationshipsX/>")).toBe(false);
    expect(hasLinksRoot("<!-- a -- b --><Relationships/>")).toBe(false);
    expect(hasLinksRoot(`${XML}<?pi <Relationships ?><x/>`)).toBe(false);
    expect(hasLinksRoot(`${XML}<?pi x?><Relationships/>`)).toBe(false);
    expect(hasLinksRoot(`<!DOCTYPE r [<!ENTITY e "<Relationships>">]><r>&e;</r>`)).toBe(false);
    expect(hasLinksRoot(`<x><Relationships/></x>`)).toBe(false);
    expect(hasLinksRoot("")).toBe(false);
  });
});

describe("the text a file may hold", () => {
  it("cuts a cell past the longest field, so the check still calls it too long", async () => {
    const read = await readImportFile(utf8(`name,description\nعطر,${"و".repeat(IMPORT_MAX_CELL_CHARS + 2000)}\n`), "long.csv");
    expect(read.ok && read.file.rows[0]?.[1]?.length).toBe(IMPORT_MAX_CELL_CHARS);
  });

  it("refuses a small file whose cells share one long text, without building it up", async () => {
    const long = "ن".repeat(50_000);
    const bytes = await xlsx((sheet) => {
      sheet.addRow(["name", "description"]);
      for (let n = 0; n < 2000; n++) sheet.addRow([long, long]);
    });
    expect(bytes.length).toBeLessThan(1024 * 1024);
    const started = Date.now();
    expect(await readImportFile(bytes, "shared.xlsx")).toMatchObject({ ok: false, error: expect.stringContaining("more text than one import reads (1,500,000 letters)") });
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("cellText", () => {
  it("gives an error cell and an empty formula as nothing", () => {
    expect(cellText({ error: "#N/A" })).toBe("");
    expect(cellText({ formula: "A1" })).toBe("");
    expect(cellText({ formula: "A1", result: { error: "#REF!" } })).toBe("");
    expect(cellText(true)).toBe("TRUE");
  });
});
