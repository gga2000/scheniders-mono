import { z } from "zod";
import { baghdadDayKey, orderInDateWindow, type OrderWindow } from "@/lib/order-window";

/**
 * One order as the reports page reads it from the server.
 *
 * The reports page used to aggregate the shared orders list, which is a date
 * window of the book (default: today). A 30-day report therefore described
 * whatever happened to be loaded. Every calculator now takes these rows instead,
 * fetched complete for the report's range (plus the previous period for the
 * comparisons) by hooks/use-report-orders.ts.
 */
export const reportOrderSchema = z.object({
    created_at: z.string(),
    // An order also belongs to the day it is scheduled for, as on Orders.
    scheduled_date: z.string().nullable(),
    status: z.string(),
    delivered_at: z.string().nullable(),
    contact_count: z.number().nullable(),
    city: z.string().nullable(),
    governorate_code: z.string().nullable(),
    validated_governorate_code: z.string().nullable(),
    rejection_reason: z.string().nullable(),
    phone: z.string().nullable(),
    needs_attention: z.boolean().nullable(),
    attention_reasons: z.array(z.string()).nullable(),
    source: z.string().nullable(),
    is_return: z.boolean().nullable(),
    // The Orders chip rules read these three (lib/orders/order-chips.ts).
    refund_status: z.string().nullable(),
    is_replacement: z.boolean().nullable(),
    order_id: z.string().nullable(),
    notes: z.string().nullable(),
    // numeric arrives as a JSON number; null on legacy rows.
    price: z.number().nullable(),
});
export type ReportOrder = z.infer<typeof reportOrderSchema>;

export const REPORT_ORDER_COLUMNS =
    "created_at,scheduled_date,status,delivered_at,contact_count,city,governorate_code,validated_governorate_code," +
    "rejection_reason,phone,needs_attention,attention_reasons,source,is_return,refund_status,is_replacement,order_id,notes,price";

export interface ReportRange {
    from: Date;
    to: Date;
}

/** The period of equal length immediately before `range`. */
export function previousPeriod(range: ReportRange): ReportRange {
    const duration = range.to.getTime() - range.from.getTime();
    return {
        from: new Date(range.from.getTime() - duration),
        to: new Date(range.from.getTime() - 1),
    };
}

/**
 * The range as the Orders list reads a date filter (lib/order-window.ts): the
 * instants for when an order arrived, and the Baghdad days for when it is
 * scheduled. An order belongs to the range if it arrived in it OR is scheduled
 * for one of its days, so «آخر 7 أيام» here counts what Orders and the
 * dashboard count.
 */
export function reportWindow(range: ReportRange): NonNullable<OrderWindow> {
    return {
        fromInstant: range.from.getTime(),
        toInstant: range.to.getTime(),
        fromDay: baghdadDayKey(range.from),
        toDay: baghdadDayKey(range.to),
    };
}

export interface ReportOrderSets {
    /** Sales orders of the range: arrived in it or scheduled for one of its days (returns excluded). */
    current: ReportOrder[];
    /** Sales orders of the previous period, by the same rule. */
    previous: ReportOrder[];
    /** Return orders of the range. */
    returns: ReportOrder[];
}

/** Split the fetched rows (previous period + range) into what each widget reads. */
export function splitReportOrders(rows: ReportOrder[], range: ReportRange): ReportOrderSets {
    const now = reportWindow(range);
    const prior = reportWindow(previousPeriod(range));
    const current: ReportOrder[] = [];
    const previous: ReportOrder[] = [];
    const returns: ReportOrder[] = [];
    for (const row of rows) {
        // Two independent windows, as on the dashboard: an order that arrived
        // last week and is scheduled for this week counts in both.
        if (orderInDateWindow(row, now)) {
            (row.is_return === true ? returns : current).push(row);
        }
        if (row.is_return !== true && orderInDateWindow(row, prior)) {
            previous.push(row);
        }
    }
    return { current, previous, returns };
}
