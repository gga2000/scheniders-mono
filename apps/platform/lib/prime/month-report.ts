/** One Prime parcel as the monthly report reads it. */
export interface PrimeMonthParcel {
    orderNumber: string;
    customerName: string;
    city: string | null;
    /** ISO instant the parcel was handed to Prime. */
    sentAt: string;
    /** The order's status in our books. */
    orderStatus: string;
    /** What Prime reported collecting, when it has. */
    collected: number | null;
    /** Prime's fee as it last told us, when known. */
    fee: number | null;
    /** Prime's last status line (step name), for the accountant's eye. */
    primeStatus: string | null;
}

export interface PrimeMonthReport {
    /** Parcels handed to Prime in the month. */
    sent: number;
    /** Our order says delivered or completed. */
    delivered: number;
    /** Rejected at the door or coming back. */
    returned: number;
    /** Cancelled before delivery. */
    cancelled: number;
    /** Still moving (confirmed or in transit). */
    open: number;
    /** Cash Prime collected on the delivered parcels. */
    collected: number;
    /** Prime's fees on the delivered parcels, where known. */
    fees: number;
}

const DELIVERED = new Set(["delivered", "completed"]);
const RETURNED = new Set(["rejected", "return_pending"]);
const OPEN = new Set(["confirmed", "in_transit"]);

export type PrimeMonthOutcome = "delivered" | "returned" | "cancelled" | "open" | "other";

/** What became of a parcel, by its order's status. */
export function primeMonthOutcome(orderStatus: string): PrimeMonthOutcome {
    if (DELIVERED.has(orderStatus)) return "delivered";
    if (RETURNED.has(orderStatus)) return "returned";
    if (orderStatus === "cancelled") return "cancelled";
    if (OPEN.has(orderStatus)) return "open";
    return "other";
}

/** The month's counts and the cash on its delivered parcels. */
export function primeMonthReport(parcels: readonly PrimeMonthParcel[]): PrimeMonthReport {
    const report: PrimeMonthReport = { sent: parcels.length, delivered: 0, returned: 0, cancelled: 0, open: 0, collected: 0, fees: 0 };
    for (const p of parcels) {
        const outcome = primeMonthOutcome(p.orderStatus);
        if (outcome === "delivered") {
            report.delivered += 1;
            report.collected += Math.round(p.collected ?? 0);
            report.fees += Math.round(p.fee ?? 0);
        } else if (outcome === "returned" || outcome === "cancelled" || outcome === "open") {
            report[outcome] += 1;
        }
    }
    return report;
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `YYYY-MM` of an instant, in Baghdad time (UTC+3 all year). */
export function primeMonthKey(ms: number): string {
    const d = new Date(ms + 3 * 3_600_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The ISO instants a Baghdad month starts and ends at (end exclusive), or null for a bad key. */
export function primeMonthRange(key: string): { from: string; to: string } | null {
    const m = MONTH_KEY.exec(key);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const start = Date.UTC(year, month - 1, 1) - 3 * 3_600_000;
    const end = Date.UTC(year, month, 1) - 3 * 3_600_000;
    return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

/** The last `count` month keys, newest first, ending with the month of `now`. */
export function primeRecentMonths(now: number, count: number): string[] {
    const d = new Date(now + 3 * 3_600_000);
    const keys: string[] = [];
    let year = d.getUTCFullYear();
    let month = d.getUTCMonth();
    for (let i = 0; i < count; i++) {
        keys.push(`${year}-${String(month + 1).padStart(2, "0")}`);
        month -= 1;
        if (month < 0) {
            month = 11;
            year -= 1;
        }
    }
    return keys;
}
