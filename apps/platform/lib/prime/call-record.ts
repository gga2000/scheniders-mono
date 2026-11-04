/**
 * The customer's record with Prime as the confirmation call sees it: every
 * earlier parcel this store sent them through Prime, how each ended, and the
 * newest few in order. Read from our own prime_shipments rows, so it is the
 * customer's history with this store only.
 */

/** How one earlier parcel ended (or that it is still out). */
export type PrimeCallParcelKind = "delivered" | "returned" | "moving";

export interface PrimeCallParcel {
    kind: PrimeCallParcelKind;
    /** When it was handed to Prime (ISO). */
    at: string;
}

export interface PrimeCallRecord {
    /** Earlier parcels, cancelled ones left out. */
    parcels: number;
    delivered: number;
    returned: number;
    moving: number;
    /** The newest parcels, oldest first (at most RECENT_MAX). */
    recent: PrimeCallParcel[];
    /** How many of the newest finished parcels came back in a row (0 when the last one was delivered). */
    returnedInARow: number;
}

export interface PrimeCallShipmentRow {
    orderId: string;
    status: string | null;
    sentAt: string;
}

/** Tiles the call shows. */
export const PRIME_CALL_RECENT_MAX = 6;

const DELIVERED: ReadonlySet<string> = new Set(["DELIVERED", "PART_DELIVERED", "DELIVERED_CHANGE_PRICE"]);
const RETURNED = "FAILED_DELIVER_RETURNED_TO_SENDER";
/** Prime cancelled the parcel itself: says nothing about the customer. */
const PRIME_CANCELLED = "CNCL";

function kindOf(status: string | null): PrimeCallParcelKind | null {
    if (status === PRIME_CANCELLED) return null;
    if (status !== null && DELIVERED.has(status)) return "delivered";
    if (status === RETURNED) return "returned";
    return "moving";
}

/**
 * The record from the customer's other parcels (the order on the call is
 * left out by id). Rows may come in any order.
 */
export function primeCallRecord(rows: readonly PrimeCallShipmentRow[], currentOrderId: string): PrimeCallRecord {
    const parcels = rows
        .filter((r) => r.orderId !== currentOrderId)
        .flatMap((r): PrimeCallParcel[] => {
            const kind = kindOf(r.status);
            return kind === null ? [] : [{ kind, at: r.sentAt }];
        })
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    let returnedInARow = 0;
    for (let i = parcels.length - 1; i >= 0; i--) {
        const kind = parcels[i]?.kind;
        if (kind === "moving") continue;
        if (kind !== "returned") break;
        returnedInARow++;
    }

    return {
        parcels: parcels.length,
        delivered: parcels.filter((p) => p.kind === "delivered").length,
        returned: parcels.filter((p) => p.kind === "returned").length,
        moving: parcels.filter((p) => p.kind === "moving").length,
        recent: parcels.slice(-PRIME_CALL_RECENT_MAX),
        returnedInARow,
    };
}

/**
 * One phone as a comparable key: digits only, without Iraq's 964 or the
 * leading 0 ("0770 455 2318", "+9647704552318" → "7704552318"). Empty when
 * there are no digits.
 */
export function primePhoneKey(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("964")) return digits.slice(3);
    if (digits.startsWith("0")) return digits.slice(1);
    return digits;
}

/** The spellings one phone may be stored under, to find the customer's earlier orders by any of them. */
export function primePhoneVariants(raw: string): string[] {
    const key = primePhoneKey(raw);
    if (!key) return [];
    return [...new Set([raw.trim(), `0${key}`, `964${key}`, `+964${key}`, key])];
}
