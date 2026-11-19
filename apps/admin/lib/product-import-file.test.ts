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
    expect(parseCsv('name,price\r\n"عطر, عود",35000\n"قميص ""قطن""","1,000"\n"سطر\nثاني",5')).toEqual([
      ["name", "price"],
      ["عطر, عود", "35000"],
      ['قميص "قطن"', "1,000"],
      ["سطر\nثاني", "5"],
    ]);
  });

  it("finds a semicolon or tab delimiter from the first line", () => {
    expect(parseCsv("name;price\nعطر;35,000")).toEqual([["name", "price"], ["عطر", "35,000"]]);
    expect(parseCsv("name\tprice\nعطر\t35000\n")).toEqual([["name", "price"], ["عطر", "35000"]]);
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
