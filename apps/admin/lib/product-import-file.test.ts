import { deflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  IMPORT_MAX_CELL_CHARS,
  MAX_UNPACKED_BYTES,
  cellText,
  decodeText,
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

/** A zip of deflated entries, each stating the unpacked size given (or its true one). */
function zip(entries: Array<{ name: string; data: Uint8Array; stated?: number }>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const packed = deflateRawSync(entry.data);
    const stated = entry.stated ?? entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(stated, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(stated, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
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

/** The smallest .xlsx with two rows of inline text and one merge range: built by hand, as no writer builds such a merge. */
function workbookWithMerge(range: string): Uint8Array {
  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml":
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>name</t></is></c><c r="B1" t="inlineStr"><is><t>price</t></is></c></row>' +
      '<row r="2"><c r="A2" t="inlineStr"><is><t>عطر</t></is></c><c r="B2"><v>35000</v></c></row>' +
      `</sheetData><mergeCells count="1"><mergeCell ref="${range}"/></mergeCells></worksheet>`,
  };
  const entries = Object.entries(files).map(([name, text]) => ({ name, data: utf8(text) }));
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
    expect(await readImportFile(bomb, "bomb.xlsx")).toEqual({ ok: false, error: "This .xlsx file is too big inside. Send a CSV of the products instead." });
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
