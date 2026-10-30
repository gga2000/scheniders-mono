import { ORDER_STATUS_LABELS } from "@/lib/order-status-labels";
import type { Order, OrderItem } from "@/types/order";

/** Whole IQD with thousands separators, the way merchants read prices. */
export function iqd(amount: number | null | undefined): string {
    return `${Math.round(amount ?? 0).toLocaleString("en-US")} IQD`;
}

/** Status key plus its English and Arabic label, so Claude can answer in either language. */
export function statusText(status: Order["status"]): string {
    return `${status} (${ORDER_STATUS_LABELS.en[status]} / ${ORDER_STATUS_LABELS.ar[status]})`;
}

const BAGHDAD = "Asia/Baghdad";

/** "2026-10-30 14:05" in Baghdad time. */
export function baghdadTime(iso: string | null | undefined): string {
    if (!iso) return "-";
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BAGHDAD,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** Today's date in Baghdad as YYYY-MM-DD. */
export function baghdadToday(): string {
    return baghdadTime(new Date().toISOString()).slice(0, 10);
}

/** The UTC instant a Baghdad calendar day starts (Iraq has no DST: UTC+3 all year). */
export function baghdadDayStart(day: string): string {
    return new Date(`${day}T00:00:00+03:00`).toISOString();
}

/** The UTC instant the Baghdad day after `day` starts — an exclusive upper bound. */
export function baghdadDayEnd(day: string): string {
    const start = new Date(`${day}T00:00:00+03:00`);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export function itemsText(items: readonly OrderItem[] | null | undefined): string {
    if (!items || items.length === 0) return "no items";
    return items.map((i) => `${i.quantity}× ${i.name} @ ${iqd(i.price)}`).join("; ");
}

/** The columns every order summary line needs. */
export const ORDER_SUMMARY_COLUMNS =
    "id, order_id, created_at, customer_name, phone, city, address_details, items, price, delivery_fee, status, is_return, is_replacement, delivery_company, waseet_status_text";

export type OrderSummaryRow = Pick<
    Order,
    | "id"
    | "order_id"
    | "created_at"
    | "customer_name"
    | "phone"
    | "city"
    | "address_details"
    | "items"
    | "price"
    | "delivery_fee"
    | "status"
    | "is_return"
    | "is_replacement"
    | "delivery_company"
    | "waseet_status_text"
>;

export function orderLine(o: OrderSummaryRow, showMoney: boolean): string {
    const kind = o.is_return ? " [return]" : o.is_replacement ? " [replacement]" : "";
    const place = [o.city, o.address_details].filter(Boolean).join(", ");
    const money = showMoney ? ` | ${iqd(o.price)} + delivery ${iqd(o.delivery_fee)}` : "";
    return `#${o.order_id}${kind} | ${baghdadTime(o.created_at)} | ${o.status} | ${o.customer_name} ${o.phone} | ${place || "no address"} | ${itemsText(o.items)}${money}`;
}
