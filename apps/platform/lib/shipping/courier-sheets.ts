import type * as XLSXTypes from "xlsx";
import type { Order } from "@/types/order";
import { extractGovernorate } from "@/lib/address-validator";
import { computeCodAmount } from "@/lib/order-money";
import { mergeOrderItems } from "@/lib/merge-order-items";

/**
 * The courier upload sheets (Prime and Al-Waseet), as plain rows. The orders
 * page downloads them in the browser; the shipping-export route builds the same
 * file on the server for a batch Claude prepared. One builder, so the two can
 * never disagree about an amount or a governorate.
 */

export type CourierCompany = "prime" | "waseet";

export const COURIER_LABELS: Record<CourierCompany, string> = { prime: "Prime", waseet: "Al-Waseet" };

export type CourierSheetOrder = Pick<
    Order,
    | "order_id"
    | "customer_name"
    | "phone"
    | "secondary_phone"
    | "city"
    | "governorate_code"
    | "validated_governorate_code"
    | "address_details"
    | "items"
    | "notes"
    | "price"
    | "delivery_fee"
    | "discount_amount"
    | "payment_status"
    | "is_return"
    | "is_replacement"
>;

/** The columns the sheets read, for a select. */
export const COURIER_SHEET_COLUMNS =
    "id, order_id, customer_name, phone, secondary_phone, city, governorate_code, validated_governorate_code, " +
    "address_details, items, notes, price, delivery_fee, discount_amount, payment_status, is_return, is_replacement";

export type CourierSheet = {
    sheetName: string;
    headers: string[];
    rows: Record<string, string | number>[];
    widths: number[];
    filename: string;
};

/** Courier-facing note (Arabic) flagging an order as already paid → collect 0 COD. */
const PREPAID_NOTE = "طلب مدفوع مسبقا";

/**
 * Helper to clean phone numbers for export
 * - Removes 964 prefix
 * - Removes leading zeros
 * - Removes non-digit characters
 */
export function cleanPhoneForExport(phone: string): string {
    if (!phone) return "";
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, "");
    // Remove 964 country code prefix
    if (cleaned.startsWith("964")) {
        cleaned = cleaned.substring(3);
    }
    // Remove leading zeros
    cleaned = cleaned.replace(/^0+/, "");
    return cleaned;
}

const totalQuantity = (order: CourierSheetOrder) =>
    order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 1;

const productType = (order: CourierSheetOrder) =>
    mergeOrderItems(order.items).map((item) => item.name).filter(Boolean).join(" + ") || "ملابس";

// Prepaid orders: courier must not collect COD, so the amount is 0
// (computeCodAmount) and a note flags it as already paid for the courier.
function courierNotes(order: CourierSheetOrder): string {
    const isPrepaid = order.payment_status === "prepaid" || order.payment_status === "paid";
    return isPrepaid ? [PREPAID_NOTE, order.notes].filter(Boolean).join(" - ") : order.notes || "";
}

const today = () => new Date().toISOString().split("T")[0];

/** Prime upload sheet. Matches the exact column structure of PrimeUploadSample.xlsx. */
export function primeSheet(orders: CourierSheetOrder[]): CourierSheet {
    // Prime headers (Arabic, exact match to their sample)
    const headers = [
        "ملاحظات",
        "عدد القطع",
        "يحتوي على ارجاع بضاعة؟",
        "هاتف المستلم",
        "تفاصيل العنوان",
        "شفرة المحافظة",
        "أسم المستلم",
        "المبلغ عراقي",
        "رقم الوصل",
        "كود الشحنة",
        "هاتف المستلم 2",
        "نوع البضاعة",
    ];

    const rows = orders.map((order) => {
        // Get governorate code
        let govCode = order.validated_governorate_code || order.governorate_code || "";
        if (!govCode && order.city) {
            const { governorate } = extractGovernorate(order.city, undefined, order.address_details);
            govCode = governorate?.code || "";
        }

        // Clean Order ID:
        // 1. Remove CHK- prefix if present
        // 2. For RTN-669-1 or RPL-669-1 style, extract only the middle number (669)
        let cleanOrderId = (order.order_id || "").replace(/^CHK-/, "");
        if (cleanOrderId.startsWith("RTN-") || cleanOrderId.startsWith("RPL-")) {
            const parts = cleanOrderId.split("-");
            if (parts.length >= 2) {
                cleanOrderId = parts[1]; // Get the middle number
            }
        }

        return {
            "ملاحظات": courierNotes(order),
            "عدد القطع": totalQuantity(order),
            "يحتوي على ارجاع بضاعة؟": order.is_return || order.is_replacement ? "Y" : "N",
            "هاتف المستلم": cleanPhoneForExport(order.phone),
            "تفاصيل العنوان": order.address_details || order.city || "",
            "شفرة المحافظة": govCode,
            "أسم المستلم": order.customer_name || "",
            // `price` excludes delivery (see lib/order-money) — the courier must
            // collect price + delivery_fee, or the merchant eats the delivery.
            "المبلغ عراقي": computeCodAmount(order),
            "رقم الوصل": cleanOrderId,
            "كود الشحنة": "",
            "هاتف المستلم 2": cleanPhoneForExport(order.secondary_phone || ""),
            "نوع البضاعة": productType(order),
        };
    });

    return {
        sheetName: "Orders",
        headers,
        rows,
        widths: [15, 10, 20, 15, 30, 15, 20, 15, 15, 15, 15, 15],
        filename: `prime_shipment_${today()}.xlsx`,
    };
}

/** Al-Waseet upload sheet. */
export function waseetSheet(orders: CourierSheetOrder[]): CourierSheet {
    const headers = [
        "اسم الزبون",
        "رقم الهاتف الاساسي",
        "رقم الهاتف الثانوي",
        "المحافظة",
        "المنطقة",
        "نوع البضاعه",
        "عدد القطع",
        "السعر مع التوصيل",
        "حجم الطلب",
        "الملاحظات",
        "نوع الطلب",
    ];

    const rows = orders.map((order) => {
        // Get governorate Arabic name
        let govName = "";
        const govCode = order.validated_governorate_code || order.governorate_code || "";
        if (govCode) {
            // INT-3: the code was passed in the `city` slot. The signature is
            // extractGovernorate(city?, governorateCode?, addressDetails?), so the
            // code-resolution branch never ran. That branch is not merely tidier:
            // 16 of the 18 canonical codes return null from the city slot, and
            // only BGD and KOT happen to resolve there — which is why a spot-check
            // with Baghdad looks fine. 214 real orders hold one of the other 16
            // codes with a city that names no province, and for those the courier
            // received an empty governorate while the data sat in the row.
            const { governorate } = extractGovernorate(undefined, govCode, undefined);
            govName = governorate?.nameAr || "";
        }
        if (!govName && order.city) {
            const { governorate } = extractGovernorate(order.city, undefined, order.address_details);
            govName = governorate?.nameAr || "";
        }

        return {
            "اسم الزبون": order.customer_name || "",
            "رقم الهاتف الاساسي": cleanPhoneForExport(order.phone),
            "رقم الهاتف الثانوي": cleanPhoneForExport(order.secondary_phone || ""),
            "المحافظة": govName,
            "المنطقة": order.address_details || "",
            "نوع البضاعه": productType(order),
            "عدد القطع": totalQuantity(order),
            "السعر مع التوصيل": computeCodAmount(order),
            "حجم الطلب": "عادي",
            "الملاحظات": courierNotes(order),
            "نوع الطلب": "طلب جديد",
        };
    });

    return {
        sheetName: "الطلبات",
        headers,
        rows,
        widths: [20, 15, 15, 15, 20, 20, 10, 15, 12, 20, 12],
        filename: `waseet_shipment_${today()}.xlsx`,
    };
}

export function courierSheet(company: CourierCompany, orders: CourierSheetOrder[]): CourierSheet {
    return company === "prime" ? primeSheet(orders) : waseetSheet(orders);
}

/** The sheet as an .xlsx workbook. The caller passes the loaded `xlsx` module. */
export function courierWorkbook(XLSX: typeof XLSXTypes, sheet: CourierSheet): XLSXTypes.WorkBook {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows, { header: sheet.headers });
    worksheet["!cols"] = sheet.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName);
    return workbook;
}
