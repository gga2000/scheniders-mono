import ExcelJS from "exceljs";
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
/** What an .xlsx may unpack to: a 5 MB file that unpacks past this is not a product list. */
const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;
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

export async function readImportFile(bytes: Uint8Array, fileName: string): Promise<ReadImportFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return fromGrid(parseCsv(decodeText(bytes)), null);
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

/** A CSV as rows of cells (RFC 4180: quoted cells may hold the delimiter, quotes and line breaks). */
export function parseCsv(text: string): string[][] {
  const delimiter = csvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
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
    return { ok: false, error: `The file has ${body.length.toLocaleString("en-US")} rows. Split it into files of ${IMPORT_MAX_ROWS.toLocaleString("en-US")} rows at most.` };
  }
  const width = Math.max(...[grid[headerIndex], ...body].map((row) => {
    let last = row.length;
    while (last > 0 && row[last - 1].trim() === "") last--;
    return last;
  }));
  if (width > IMPORT_MAX_COLUMNS) return { ok: false, error: `The file has ${width} columns; a product list has ${IMPORT_MAX_COLUMNS} at most.` };
  const fit = (row: readonly string[]) => Array.from({ length: width }, (_, i) => (row[i] ?? "").trim());
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

/**
 * What an .xlsx (a zip) says it unpacks to, from its central directory; null
 * when it cannot be read or is a zip64, which no product list needs.
 */
export function zipUnpackedBytes(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  let end = -1;
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (entries === 0xffff || at === 0xffffffff) return null;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) return null;
    const unpacked = view.getUint32(at + 24, true);
    if (unpacked === 0xffffffff) return null;
    total += unpacked;
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return total;
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

async function readWorkbook(bytes: Uint8Array): Promise<ReadImportFile> {
  const unpacked = zipUnpackedBytes(bytes);
  if (unpacked === null) return { ok: false, error: "This .xlsx file could not be opened. Save it again from Excel, or send a CSV." };
  if (unpacked > MAX_UNPACKED_BYTES) return { ok: false, error: "This .xlsx file is too big inside. Send a CSV of the products instead." };

  const workbook = new ExcelJS.Workbook();
  try {
    // A copy, so the workbook reader gets a plain ArrayBuffer of exactly the file.
    await workbook.xlsx.load(bytes.slice().buffer);
  } catch {
    return { ok: false, error: "This .xlsx file could not be opened. Save it again from Excel, or send a CSV." };
  }
  const sheet = workbook.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) return { ok: false, error: "The file is empty." };
  // Only rows with something in them are visited; a sheet formatted down to
  // its last row is not read a million times.
  if (sheet.actualRowCount > IMPORT_MAX_ROWS + 1) {
    return { ok: false, error: `The sheet has ${sheet.actualRowCount.toLocaleString("en-US")} rows. Split it into files of ${IMPORT_MAX_ROWS.toLocaleString("en-US")} rows at most.` };
  }
  const grid: string[][] = [];
  // The first row past the limit with something in it (0: none).
  const far = { row: 0 };
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > MAX_ROW_NUMBER) {
      if (far.row === 0) far.row = rowNumber;
      return;
    }
    const cells: string[] = [];
    const width = Math.min(row.cellCount, IMPORT_MAX_COLUMNS + 1);
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
    while (grid.length < rowNumber - 1) grid.push([]);
    grid.push(cells);
  });
  if (far.row > 0) {
    return { ok: false, error: `The sheet has something in row ${far.row.toLocaleString("en-US")}, past the ${IMPORT_MAX_ROWS.toLocaleString("en-US")} rows a file may have. Delete what is down there, or split the file.` };
  }
  return fromGrid(grid, sheet.name);
}
