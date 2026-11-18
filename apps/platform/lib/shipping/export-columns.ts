import { z } from "zod";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { computeCodAmount } from "@/lib/order-money";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { orderItemLabel } from "@/lib/orders/item-label";
import {
    cleanPhoneForExport,
    courierNotes,
    governorateNameAr,
    primeSheet,
    totalQuantity,
    waseetSheet,
    type CourierSheet,
    type CourierSheetOrder,
} from "@/lib/shipping/courier-sheets";

/**
 * Fermi B4: a courier sheet in the merchant's own layout. Any Iraqi courier
 * takes an Excel or CSV upload; what differs is which columns, in which order,
 * under which headers. A layout is that list, plus how phones are written and
 * the file type. "General" is every column with plain Arabic headers; a store
 * saves its own as "my courier" (public.shipping_export_templates) and gets it
 * offered again.
 *
 * Amounts and counts go into the sheet as numbers, phones and order numbers as
 * text (a phone written as a number loses its leading 0).
 */

export const EXPORT_COLUMN_KEYS = [
    "order_number",
    "customer_name",
    "phone",
    "secondary_phone",
    "governorate",
    "area",
    "address",
    "full_address",
    "items",
    "item_count",
    "cod_amount",
    "delivery_fee",
    "notes",
    "store_name",
] as const;

export type ExportColumnKey = (typeof EXPORT_COLUMN_KEYS)[number];

/** How a phone is written: 07701234567, 7701234567, 9647701234567, +9647701234567. */
export const PHONE_FORMATS = ["local", "bare", "intl", "intl_plus"] as const;
export type PhoneFormat = (typeof PHONE_FORMATS)[number];

export const FILE_FORMATS = ["xlsx", "csv"] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

export type ExportColumn = { key: ExportColumnKey; header: string };

export type ExportLayout = {
    columns: ExportColumn[];
    phoneFormat: PhoneFormat;
    fileFormat: FileFormat;
};

/** The header a column gets in the general layout, in the words couriers use. */
export const DEFAULT_HEADERS: Record<ExportColumnKey, string> = {
    order_number: "رقم الطلب",
    customer_name: "اسم الزبون",
    phone: "رقم الهاتف",
    secondary_phone: "رقم الهاتف الثاني",
    governorate: "المحافظة",
    area: "المنطقة",
    address: "العنوان",
    full_address: "العنوان الكامل",
    items: "المنتجات",
    item_count: "عدد القطع",
    cod_amount: "المبلغ مع التوصيل",
    delivery_fee: "سعر التوصيل",
    notes: "الملاحظات",
    store_name: "اسم المتجر",
};

/** Every column with its plain header, Excel, phones as 07... */
export const GENERAL_LAYOUT: ExportLayout = {
    columns: EXPORT_COLUMN_KEYS.map((key) => ({ key, header: DEFAULT_HEADERS[key] })),
    phoneFormat: "local",
    fileFormat: "xlsx",
};

export const MAX_HEADER_LENGTH = 60;

/** A saved layout as the database holds it; anything else is not a layout. */
const savedColumnsSchema = z
    .array(
        z.object({
            key: z.enum(EXPORT_COLUMN_KEYS),
            header: z.string().trim().min(1).max(MAX_HEADER_LENGTH),
        }),
    )
    .min(1)
    .max(30);

export const savedLayoutRowSchema = z.object({
    id: z.string(),
    name: z.string(),
    columns: savedColumnsSchema,
    phone_format: z.enum(PHONE_FORMATS),
    file_format: z.enum(FILE_FORMATS),
});

export type SavedLayout = { id: string; name: string; layout: ExportLayout };

/** Rows from shipping_export_templates; a row that does not parse is left out. */
export function parseSavedLayouts(rows: readonly unknown[]): SavedLayout[] {
    const out: SavedLayout[] = [];
    for (const row of rows) {
        const parsed = savedLayoutRowSchema.safeParse(row);
        if (!parsed.success) continue;
        out.push({
            id: parsed.data.id,
            name: parsed.data.name,
            layout: {
                columns: parsed.data.columns,
                phoneFormat: parsed.data.phone_format,
                fileFormat: parsed.data.file_format,
            },
        });
    }
    return out;
}

/** Another saved layout already uses this name (names are unique per store, any case). */
export function layoutNameTaken(layouts: readonly SavedLayout[], name: string, exceptId?: string): boolean {
    const wanted = name.trim().toLowerCase();
    return layouts.some((l) => l.id !== exceptId && l.name.trim().toLowerCase() === wanted);
}

/** A layout ready to save: at least one column, every header filled. */
export function layoutProblem(layout: ExportLayout): "noColumns" | "emptyHeader" | null {
    if (layout.columns.length === 0) return "noColumns";
    if (layout.columns.some((c) => c.header.trim() === "")) return "emptyHeader";
    return null;
}

/**
 * A phone in the courier's format. A number that is not an Iraqi mobile is
 * kept as its digits, so nothing is silently dropped.
 */
export function formatPhoneForCourier(raw: string | null | undefined, format: PhoneFormat): string {
    if (!raw) return "";
    const local = normalizeIraqiMobile(raw);
    if (!local) return cleanPhoneForExport(raw);
    const bare = local.slice(1);
    switch (format) {
        case "local":
            return local;
        case "bare":
            return bare;
        case "intl":
            return `964${bare}`;
        case "intl_plus":
            return `+964${bare}`;
    }
}

/** What the parcel holds: «name (variant) × qty», lines joined with « + ». */
export function itemsText(order: Pick<CourierSheetOrder, "items">): string {
    return mergeOrderItems(order.items)
        .filter((item) => item.name)
        .map((item) => `${orderItemLabel(item)} × ${item.quantity || 1}`)
        .join(" + ");
}

/**
 * Governorate, area and address, each once: a part already written is skipped,
 * and a later part that already names an earlier one («النجف - حي الأمير»
 * after «النجف») takes its place.
 */
export function fullAddress(order: CourierSheetOrder): string {
    let parts: string[] = [];
    for (const part of [governorateNameAr(order), order.city, order.address_details]) {
        const text = part?.trim();
        if (!text || parts.some((p) => p.includes(text))) continue;
        parts = [...parts.filter((p) => !text.includes(p)), text];
    }
    return parts.join(" - ");
}

export type ExportContext = { storeName: string; phoneFormat: PhoneFormat };

export function exportCellValue(order: CourierSheetOrder, key: ExportColumnKey, ctx: ExportContext): string | number {
    switch (key) {
        case "order_number":
            return (order.order_id || "").replace(/^CHK-/, "");
        case "customer_name":
            return order.customer_name || "";
        case "phone":
            return formatPhoneForCourier(order.phone, ctx.phoneFormat);
        case "secondary_phone":
            return formatPhoneForCourier(order.secondary_phone, ctx.phoneFormat);
        case "governorate":
            return governorateNameAr(order);
        case "area":
            return order.city || "";
        case "address":
            return order.address_details || "";
        case "full_address":
            return fullAddress(order);
        case "items":
            return itemsText(order);
        case "item_count":
            return totalQuantity(order);
        case "cod_amount":
            return computeCodAmount(order);
        case "delivery_fee":
            return Math.round(Number(order.delivery_fee) || 0);
        case "notes":
            return courierNotes(order);
        case "store_name":
            return ctx.storeName;
    }
}

/** Orders the courier cannot route because no governorate could be read. */
export function ordersWithoutGovernorate<T extends CourierSheetOrder>(orders: readonly T[]): T[] {
    return orders.filter((o) => governorateNameAr(o) === "");
}

/**
 * The sheet in a layout. Two columns may share a header in the editor, but a
 * sheet row is keyed by header, so a repeat gets " 2", " 3" to keep both.
 */
export function layoutSheet(
    orders: readonly CourierSheetOrder[],
    layout: ExportLayout,
    ctx: { storeName: string; filename: string },
): CourierSheet {
    const seen = new Map<string, number>();
    const headers = layout.columns.map((c) => {
        const base = c.header.trim() || DEFAULT_HEADERS[c.key];
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        return n === 1 ? base : `${base} ${n}`;
    });
    const cellCtx: ExportContext = { storeName: ctx.storeName, phoneFormat: layout.phoneFormat };
    const rows = orders.map((order) => {
        const row: Record<string, string | number> = {};
        layout.columns.forEach((c, i) => {
            row[headers[i]] = exportCellValue(order, c.key, cellCtx);
        });
        return row;
    });
    return {
        sheetName: "الطلبات",
        headers,
        rows,
        widths: layout.columns.map((c) => COLUMN_WIDTHS[c.key]),
        filename: ctx.filename,
    };
}

const COLUMN_WIDTHS: Record<ExportColumnKey, number> = {
    order_number: 14,
    customer_name: 22,
    phone: 16,
    secondary_phone: 16,
    governorate: 14,
    area: 18,
    address: 32,
    full_address: 40,
    items: 40,
    item_count: 10,
    cod_amount: 16,
    delivery_fee: 12,
    notes: 30,
    store_name: 18,
};

/**
 * `fermi-<store>-<courier>-<date>.<ext>`. Characters a file system refuses are
 * dropped and spaces become dashes; Arabic stays.
 */
export function exportFileName(storeName: string, courierName: string, date: Date, ext: FileFormat): string {
    const part = (text: string, fallback: string) =>
        text
            .trim()
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
            .replace(/\s+/g, "-")
            .slice(0, 40) || fallback;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `fermi-${part(storeName, "store")}-${part(courierName, "courier")}-${y}-${m}-${d}.${ext}`;
}

/** Where an export goes: a built-in courier sheet, or a layout with the courier's name. */
export type ShipExportTarget =
    | { kind: "prime" }
    | { kind: "waseet" }
    | { kind: "layout"; courierName: string; layout: ExportLayout };

/** The courier's name as the merchant reads it ("sent to …"). */
export function targetCourierName(target: ShipExportTarget): string {
    if (target.kind === "prime") return "Prime";
    if (target.kind === "waseet") return "Al-Waseet";
    return target.courierName.trim();
}

/** shipping_export_log.company for this target. */
export function targetCompany(target: ShipExportTarget): "prime" | "waseet" | "other" {
    return target.kind === "layout" ? "other" : target.kind;
}

export function targetFileFormat(target: ShipExportTarget): FileFormat {
    return target.kind === "layout" ? target.layout.fileFormat : "xlsx";
}

/**
 * The file for a target, named `fermi-<store>-<courier>-<date>`. Prime and
 * Al-Waseet keep their exact upload columns; a layout gets its own.
 */
export function targetSheet(
    target: ShipExportTarget,
    orders: readonly CourierSheetOrder[],
    ctx: { storeName: string; date: Date },
): CourierSheet {
    const filename = exportFileName(ctx.storeName, targetCourierName(target), ctx.date, targetFileFormat(target));
    if (target.kind === "prime") return { ...primeSheet([...orders]), filename };
    if (target.kind === "waseet") return { ...waseetSheet([...orders]), filename };
    return layoutSheet(orders, target.layout, { storeName: ctx.storeName, filename });
}
