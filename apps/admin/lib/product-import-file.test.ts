import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { cellText, decodeText, parseCsv, readImportFile, zipUnpackedBytes } from "./product-import-file";

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

describe("zipUnpackedBytes", () => {
  it("adds up what a workbook unpacks to, and refuses what is not a zip", async () => {
    const bytes = await xlsx((sheet) => sheet.addRow(["name"]));
    const unpacked = zipUnpackedBytes(bytes);
    expect(unpacked).not.toBeNull();
    expect(unpacked ?? 0).toBeGreaterThan(bytes.length);
    expect(zipUnpackedBytes(utf8("no zip here at all, just text"))).toBeNull();
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
