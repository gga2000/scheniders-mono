import { Readable } from "node:stream";
import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { formatCount } from "./format";
import { IMPORT_MAX_ROWS } from "./product-import";

/**
 * Reads the file a merchant sent for the product import (Fermi B12 item 7):
 * an Excel workbook (.xlsx, its first sheet with anything in it) or a CSV
 * (comma, semicolon or tab; UTF-8, or the Arabic Windows encoding Excel
 * saves CSV in on Arabic Windows). The first row with anything in it is the
 * header; the rows under it come back as text, cell by cell, numbered as in
 * the file.
 */

/** Columns read from a file; more is not a product list. */
export const IMPORT_MAX_COLUMNS = 50;
/** What an .xlsx may really unpack to: a 4 MB file that unpacks past this is not a product list. */
export const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;
/**
 * One cell's text at most. The longest field the import takes is the
 * description (5,000 letters); a longer cell is cut here, a little past
 * that, so the check still names it as too long.
 */
export const IMPORT_MAX_CELL_CHARS = 10_000;
/**
 * All the text one file may hold, header and cells together. It bounds the
 * answer the console sends back, which must stay well under the 4.5 MB a
 * server answer may be: 1.5 million Arabic letters are about 3 MB.
 */
export const IMPORT_MAX_TEXT_CHARS = 1_500_000;
/** The last sheet row read: the rows a file may have, under a header a little way down. */
const MAX_ROW_NUMBER = IMPORT_MAX_ROWS + 100;

export interface ImportSheet {
  /** The sheet read, or null for a CSV. */
  sheet: string | null;
  headers: string[];
  /** The rows under the header, empty ones kept so row numbers stay true. */
  rows: string[][];
  /** The file row of rows[0]. */
  firstRow: number;
}

export type ReadImportFile = { ok: true; file: ImportSheet } | { ok: false; error: string };

const CANNOT_OPEN = "This .xlsx file could not be opened. Save it again from Excel, or send a CSV.";
const TOO_MUCH_TEXT = `The file holds more text than one import reads (${formatCount(IMPORT_MAX_TEXT_CHARS)} letters). Split it into smaller files.`;

/** Something below the rows a file may have: refused rather than read on. */
/**
 * The sheet's name as the workbook gives it. ExcelJS's stream reader sets
 * `name` on each sheet (its own default is "Sheet<n>"), though its types
 * leave the field out.
 */
const sheetNameOf = (worksheet: object): string =>
  "name" in worksheet && typeof worksheet.name === "string" && worksheet.name !== "" ? worksheet.name : "Sheet 1";

const pastTheRows = (rowNumber: number): ReadImportFile => ({
  ok: false,
  error: `The sheet has something in row ${formatCount(rowNumber)}, past the ${formatCount(IMPORT_MAX_ROWS)} rows a file may have. Delete what is down there, or split the file.`,
});

export async function readImportFile(bytes: Uint8Array, fileName: string): Promise<ReadImportFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const csv = parseCsv(decodeText(bytes), MAX_ROW_NUMBER);
    return csv.farRow > 0 ? pastTheRows(csv.farRow) : fromGrid(csv.rows, null);
  }
  if (lower.endsWith(".xlsx")) return readWorkbook(bytes);
  if (lower.endsWith(".xls")) return { ok: false, error: "This is an old Excel file (.xls). Open it in Excel and save it as .xlsx or .csv first." };
  return { ok: false, error: "Send an Excel file (.xlsx) or a CSV file." };
}

/** UTF-8 when the bytes are UTF-8, else the Arabic Windows encoding. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1256").decode(bytes);
  }
}

/** The delimiter of a CSV: the one of , ; tab seen most on its first line, outside quotes. */
function csvDelimiter(text: string): string {
  const counts = new Map<string, number>([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ",";
  for (const [delimiter, count] of counts) if (count > (counts.get(best) ?? 0)) best = delimiter;
  return best;
}

export interface CsvRows {
  /** The first `maxRows` rows, as cells. */
  rows: string[][];
  /** The first row past `maxRows` with something in it (0: none). */
  farRow: number;
}

/**
 * A CSV as rows of cells (RFC 4180: quoted cells may hold the delimiter,
 * quotes and line breaks). Only the first `maxRows` rows are kept; past them
 * the text is only looked through for the first row with something in it, so
 * 4 MB of line breaks is not built into 4 million rows (audit round 20).
 */
export function parseCsv(text: string, maxRows: number = Number.POSITIVE_INFINITY): CsvRows {
  const delimiter = csvDelimiter(text);
  const rows: string[][] = [];
  let rowCount = 0;
  let farRow = 0;
  let row: string[] = [];
  let cell = "";
  // The cell's length so far, counted whether or not it is kept.
  let cellLength = 0;
  let quoted = false;
  // Past maxRows no cell is built: only whether the row has anything in it.
  let keeping = maxRows > 0;
  let filled = false;
  const add = (ch: string) => {
    if (keeping) cell += ch;
    cellLength++;
    if (ch.trim() !== "") filled = true;
  };
  const endCell = () => {
    if (keeping) row.push(cell);
    cell = "";
    cellLength = 0;
  };
  const endRow = () => {
    endCell();
    rowCount++;
    if (keeping) rows.push(row);
    else if (filled && farRow === 0) farRow = rowCount;
    row = [];
    filled = false;
    keeping = rowCount < maxRows;
  };
  for (let i = 0; i < text.length && farRow === 0; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        add('"');
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        add(ch);
      }
    } else if (ch === '"' && cellLength === 0) {
      quoted = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      add(ch);
    }
  }
  if (farRow === 0 && (cellLength > 0 || row.length > 0 || filled)) endRow();
  return { rows, farRow };
}

const isEmptyRow = (row: readonly string[]) => row.every((cell) => cell.trim() === "");

/** The header and the rows under it, from a grid whose row i is file row i + 1. */
function fromGrid(grid: string[][], sheet: string | null): ReadImportFile {
  const headerIndex = grid.findIndex((row) => !isEmptyRow(row));
  if (headerIndex === -1) return { ok: false, error: "The file is empty." };
  const body = grid.slice(headerIndex + 1);
  while (body.length > 0 && isEmptyRow(body[body.length - 1])) body.pop();
  if (body.length === 0) return { ok: false, error: "The file has a header row and no products under it." };
  if (body.length > IMPORT_MAX_ROWS) {
    return { ok: false, error: `The file has ${formatCount(body.length)} rows. Split it into files of ${formatCount(IMPORT_MAX_ROWS)} rows at most.` };
  }
  const width = Math.max(...[grid[headerIndex], ...body].map((row) => {
    let last = row.length;
    while (last > 0 && row[last - 1].trim() === "") last--;
    return last;
  }));
  if (width > IMPORT_MAX_COLUMNS) return { ok: false, error: `The file has ${width} columns; a product list has ${IMPORT_MAX_COLUMNS} at most.` };
  // Counted before any cell is copied: a file of one long text repeated in
  // every cell must not be built up to find out it is too much.
  let text = 0;
  for (const row of [grid[headerIndex], ...body]) {
    for (let i = 0; i < Math.min(row.length, width); i++) text += Math.min(row[i].length, IMPORT_MAX_CELL_CHARS);
    if (text > IMPORT_MAX_TEXT_CHARS) return { ok: false, error: TOO_MUCH_TEXT };
  }
  const fit = (row: readonly string[]) => Array.from({ length: width }, (_, i) => (row[i] ?? "").slice(0, IMPORT_MAX_CELL_CHARS).trim());
  return {
    ok: true,
    file: {
      sheet,
      headers: fit(grid[headerIndex]),
      rows: body.map(fit),
      firstRow: headerIndex + 2,
    },
  };
}

export type ZipUnpacked = { ok: true; bytes: number } | { ok: false; reason: "unreadable" | "too_big" };

/**
 * What an .xlsx (a zip) really unpacks to: every entry is inflated and its
 * bytes counted, stopping as soon as the count passes `limit`. The sizes a
 * zip states about itself are not trusted: the workbook reader inflates
 * every entry before it compares them. An entry whose real size differs from
 * the stated one, a zip64, or a packing other than stored or deflate is
 * unreadable; no file Excel saves is any of those.
 */
export function zipUnpacked(bytes: Uint8Array, limit: number = MAX_UNPACKED_BYTES): ZipUnpacked {
  const unreadable: ZipUnpacked = { ok: false, reason: "unreadable" };
  if (bytes.length < 22) return unreadable;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  let end = -1;
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) return unreadable;
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (entries === 0xffff || at === 0xffffffff) return unreadable;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) return unreadable;
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const stated = view.getUint32(at + 24, true);
    const local = view.getUint32(at + 42, true);
    if (packed === 0xffffffff || stated === 0xffffffff || local === 0xffffffff) return unreadable;
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) return unreadable;
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (dataAt + packed > bytes.length) return unreadable;
    const data = bytes.subarray(dataAt, dataAt + packed);

    let size: number;
    if (method === 0) {
      size = packed;
    } else if (method === 8) {
      try {
        // Never more than what is left under the limit, plus one byte to know it was passed.
        size = inflateRawSync(data, { maxOutputLength: limit - total + 1 }).length;
      } catch (error) {
        if (error instanceof RangeError && "code" in error && error.code === "ERR_BUFFER_TOO_LARGE") return { ok: false, reason: "too_big" };
        return unreadable;
      }
    } else {
      return unreadable;
    }
    total += size;
    if (total > limit) return { ok: false, reason: "too_big" };
    if (size !== stated) return unreadable;
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return { ok: true, bytes: total };
}

/** One Excel cell as text: a link cell gives its link when its text is the link or empty. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("hyperlink" in value) {
    const text = typeof value.text === "string" ? value.text.trim() : "";
    return text === "" || /^https?:\/\//i.test(text) ? value.hyperlink : text;
  }
  if ("result" in value) {
    const result = value.result;
    if (result === undefined || (typeof result === "object" && !(result instanceof Date))) return "";
    return cellText(result);
  }
  return "";
}

/** The stream a workbook is read from: the file's bytes, in one piece. */
const bytesStream = (bytes: Uint8Array) => Readable.from([Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)]);

/**
 * The first sheet with anything in it, read row by row with ExcelJS's
 * streaming reader. It holds only the row it is on and never applies merge
 * ranges, so the work follows the rows the sheet really has. Loading the whole
 * workbook made a cell object for every cell a merge range names: a 1.5 KB
 * file with one merge over the whole sheet ran the server out of memory, and
 * 30,000 rows of 50 cells took 750 MB before the row limit was checked (audit
 * round 20). Every sheet is read to its end, past the limits too: leaving the
 * reader early leaves its temporary files and open files behind. Past the
 * limits rows are only counted, never turned into text.
 *
 * A link cell gives the text it shows (the streaming reader reads a sheet's
 * links only after its rows); a product list's image links show as the links.
 */
async function readWorkbook(bytes: Uint8Array): Promise<ReadImportFile> {
  const unpacked = zipUnpacked(bytes);
  if (!unpacked.ok && unpacked.reason === "unreadable") return { ok: false, error: CANNOT_OPEN };
  if (!unpacked.ok) return { ok: false, error: "This .xlsx file is too big inside. Send a CSV of the products instead." };

  let chosen: { name: string; grid: string[][]; rowsWithValues: number; farRow: number; text: number } | null = null;
  try {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(bytesStream(bytes), {
      worksheets: "emit",
      sharedStrings: "cache",
      hyperlinks: "ignore",
      // Read for the date formats: a date cell is a number until its format says so.
      styles: "cache",
      entries: "ignore",
    });
    for await (const worksheet of reader) {
      // Once the sheet is chosen, the sheets after it are only read through.
      const reading = chosen === null;
      const sheet = { name: sheetNameOf(worksheet), grid: [] as string[][], rowsWithValues: 0, farRow: 0, text: 0 };
      for await (const row of worksheet) {
        if (!reading || !row.hasValues) continue;
        const rowNumber = row.number;
        if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new Error("A row without its number");
        sheet.rowsWithValues++;
        if (rowNumber > MAX_ROW_NUMBER) {
          if (sheet.farRow === 0) sheet.farRow = rowNumber;
          continue;
        }
        if (sheet.text > IMPORT_MAX_TEXT_CHARS) continue;
        const cells: string[] = [];
        const width = Math.min(row.cellCount, IMPORT_MAX_COLUMNS + 1);
        for (let c = 1; c <= width; c++) {
          const text = cellText(row.getCell(c).value).slice(0, IMPORT_MAX_CELL_CHARS);
          sheet.text += text.length;
          cells.push(text);
        }
        while (sheet.grid.length < rowNumber) sheet.grid.push([]);
        sheet.grid[rowNumber - 1] = cells;
      }
      if (reading && sheet.rowsWithValues > 0) chosen = sheet;
    }
  } catch {
    return { ok: false, error: CANNOT_OPEN };
  }
  if (!chosen) return { ok: false, error: "The file is empty." };
  if (chosen.rowsWithValues > IMPORT_MAX_ROWS + 1) {
    return { ok: false, error: `The sheet has ${formatCount(chosen.rowsWithValues)} rows. Split it into files of ${formatCount(IMPORT_MAX_ROWS)} rows at most.` };
  }
  if (chosen.text > IMPORT_MAX_TEXT_CHARS) return { ok: false, error: TOO_MUCH_TEXT };
  if (chosen.farRow > 0) return pastTheRows(chosen.farRow);
  return fromGrid(chosen.grid, chosen.name);
}
