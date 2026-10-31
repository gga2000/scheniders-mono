import { VaultError } from "./vault-progress";
import type { VaultRow } from "./vault-schema";

/**
 * Columns whose value is a JSON object or a list. A spreadsheet cell holds
 * text, and SheetJS silently drops an object or array cell on export, so
 * these are written as JSON text and read back from it. Taken from the live
 * schema: a column missing here is lost in Excel and CSV backups.
 */
export const JSON_CELL_COLUMNS = {
    orders: ["items", "risk_metadata", "attribution", "address_issues", "attention_reasons"],
    products: ["lightfunnels_aliases", "gallery_urls", "feature_cards", "dimensions_json"],
    customers: ["ai_summary"],
    categories: ["page_config", "page_config_draft"],
} as const satisfies Record<string, readonly string[]>;

export type SheetTable = keyof typeof JSON_CELL_COLUMNS;

/** What an empty cell means for a column the store insists on having a value for. */
const EMPTY_CELL_FALLBACK: Partial<Record<string, unknown>> = {
    items: [],
    risk_metadata: {},
};

/** Rows ready for a spreadsheet: every object or list cell becomes JSON text. */
export function toSheetRows(table: SheetTable, rows: readonly VaultRow[]): VaultRow[] {
    const columns: readonly string[] = JSON_CELL_COLUMNS[table];
    return rows.map((row) => {
        const out: VaultRow = { ...row };
        for (const column of columns) {
            const value = row[column];
            if (value !== undefined && value !== null) out[column] = JSON.stringify(value);
        }
        return out;
    });
}

/**
 * Rows read from a spreadsheet: JSON text becomes the object or list again.
 * An empty cell is left out so the store keeps its default (or the live value
 * of a row that exists), except where the column has a required empty value.
 */
export function fromSheetRows(table: SheetTable, rows: readonly VaultRow[]): VaultRow[] {
    const columns: readonly string[] = JSON_CELL_COLUMNS[table];
    return rows.map((row) => {
        const out: VaultRow = { ...row };
        for (const column of columns) {
            const cell = row[column];
            if (cell === undefined || cell === null || cell === "") {
                if (column in EMPTY_CELL_FALLBACK) out[column] = EMPTY_CELL_FALLBACK[column];
                else delete out[column];
            } else if (typeof cell === "string") {
                try {
                    out[column] = JSON.parse(cell);
                } catch {
                    throw new VaultError("damagedExcel", "The Excel file has a damaged JSON column and cannot be restored.");
                }
            }
        }
        return out;
    });
}
