import { z } from "zod";

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
    notes: z.string().nullable(),
    // numeric arrives as a JSON number; null on legacy rows.
    price: z.number().nullable(),
});
export type ReportOrder = z.infer<typeof reportOrderSchema>;

export const REPORT_ORDER_COLUMNS =
    "created_at,status,delivered_at,contact_count,city,governorate_code,validated_governorate_code," +
    "rejection_reason,phone,needs_attention,attention_reasons,source,is_return,notes,price";

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

function inRange(order: ReportOrder, range: ReportRange): boolean {
    const created = new Date(order.created_at).getTime();
    return created >= range.from.getTime() && created <= range.to.getTime();
}

export interface ReportOrderSets {
    /** Sales orders created in the range (returns excluded). */
    current: ReportOrder[];
    /** Sales orders created in the previous period. */
    previous: ReportOrder[];
    /** Return orders created in the range. */
    returns: ReportOrder[];
}

/** Split the fetched rows (previous period + range) into what each widget reads. */
export function splitReportOrders(rows: ReportOrder[], range: ReportRange): ReportOrderSets {
    const prior = previousPeriod(range);
    const current: ReportOrder[] = [];
    const previous: ReportOrder[] = [];
    const returns: ReportOrder[] = [];
    for (const row of rows) {
        if (inRange(row, range)) {
            (row.is_return === true ? returns : current).push(row);
        } else if (row.is_return !== true && inRange(row, prior)) {
            previous.push(row);
        }
    }
    return { current, previous, returns };
}
