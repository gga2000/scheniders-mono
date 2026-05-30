import type { Product } from "@/lib/supabase";

const COLUMNS = [
    "id",
    "name",
    "sku",
    "category_id",
    "stock_quantity",
    "reserved_quantity",
    "reorder_point",
    "low_stock_threshold",
    "cost",
    "times_sold",
    "updated_at",
] as const;

type Column = (typeof COLUMNS)[number];

function escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    const str = String(value);
    // Quote if the value contains a comma, quote, newline, or leading/trailing whitespace
    if (/[",\n\r]/.test(str) || str !== str.trim()) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function buildCsv(supplies: Product[]): string {
    const header = COLUMNS.join(",");
    const rows = supplies.map((s) =>
        COLUMNS.map((col: Column) => {
            const raw = (s as unknown as Record<string, unknown>)[col];
            return escapeCsvValue(raw);
        }).join(","),
    );
    return [header, ...rows].join("\n");
}

function todayIso(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export function exportSuppliesToCsv(supplies: Product[]): void {
    if (typeof window === "undefined") return;
    const csv = buildCsv(supplies);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `supplies-${todayIso()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Revoke on next tick so the browser has time to start the download
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
