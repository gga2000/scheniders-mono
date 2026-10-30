// CSV export for the customers page (whole filtered set and the bulk selection).

import { toIraqE164 } from "@/lib/customer-format";

/**
 * One CSV cell. Names and addresses come from storefront and webhook input, so a
 * value that starts with = + - @ (or a tab/CR) is prefixed with ' to stop
 * Excel/Sheets from running it as a formula. A bare "+digits" phone is data,
 * not a formula, and keeps its "+".
 */
export function csvCell(value: string | number | null | undefined): string {
    let v = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(v) && !/^\+\d+$/.test(v)) v = `'${v}`;
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** "+9647…" so WhatsApp tools and Excel keep it as a phone, not a number. */
export function csvPhone(raw: string | null | undefined): string {
    return raw ? `+${toIraqE164(raw)}` : "";
}

/** ISO timestamp → YYYY-MM-DD. */
export function csvDate(iso: string | null | undefined): string {
    return iso ? iso.slice(0, 10) : "";
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
    return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Download with a BOM so Excel opens Arabic text as UTF-8. */
export function downloadCsv(csv: string, filename: string): void {
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
