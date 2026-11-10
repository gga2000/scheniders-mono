export type CsvRow = Record<string, unknown>;

/**
 * One backup cell. Text comes from shoppers, webhooks and staff, and the
 * merchant opens this file in Excel or Sheets, so a text value that starts
 * with = + - @ (or a tab/CR) is prefixed with ' to stop it running as a
 * formula. Numbers and booleans are written as they are: they are data the
 * database typed, never a formula. Objects are JSON, which starts with { or [.
 */
function backupCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
}

/** The automated backup's CSV: header row from the first row's keys. */
export function generateBackupCsv(data: CsvRow[]): string {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const lines = [headers.join(",")];
    for (const row of data) lines.push(headers.map((h) => backupCell(row[h])).join(","));
    return lines.join("\n");
}
