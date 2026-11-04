import { buildPrimeShipment, primeUpdateFields, type PrimeSkipReason } from "@/lib/prime/shipment-payload";
import { readPrimeDistrict } from "@/lib/prime/district";
import type { PrimeShipmentUpdate } from "@/lib/prime/client";
import type { CourierSheetOrder } from "@/lib/shipping/courier-sheets";

/** What staff see change at Prime, in the order they read a parcel. */
export type PrimeEditField = "name" | "phone" | "secondPhone" | "governorate" | "area" | "address" | "amount" | "goodsValue" | "pieces" | "products" | "notes";

export interface PrimeEditChange {
    field: PrimeEditField;
    /** Display value before the edit; "" when Prime held nothing. */
    before: string;
    after: string;
}

export type PrimeEditDiff =
    /** Prime will get these changes (the queue sends exactly these fields). */
    | { kind: "changes"; changes: PrimeEditChange[]; amountBefore: number; amountAfter: number; stateAfter: string; districtAfter: number | null }
    /** The edited order cannot go to Prime as it is: the queue would flag it instead of sending. */
    | { kind: "blocked"; reason: PrimeSkipReason };

/** Fields the diff compares; the merchant's own ids are the same on both sides and are left out. */
const FIELDS: readonly [keyof PrimeShipmentUpdate, PrimeEditField][] = [
    ["receiverName", "name"],
    ["receiverHp1", "phone"],
    ["receiverHp2", "secondPhone"],
    ["state", "governorate"],
    ["district", "area"],
    ["locationDetails", "address"],
    ["receiptAmtIqd", "amount"],
    ["undeclaredShipmentValue", "goodsValue"],
    ["qty", "pieces"],
    ["productInfo", "products"],
    ["rmk", "notes"],
];

/** The diff never reads the merchant: any value works as long as both sides share it. */
const SAME_MERCHANT = { merchantLoginId: "", shopId: 0 };

/**
 * What an edit of a sent order changes at Prime: both versions built the way
 * the edit queue builds them (buildPrimeShipment → primeUpdateFields), then
 * compared field by field. Null when Prime holds nothing that changed (an
 * internal note, a tag), so the save needs no review. Money is whole IQD;
 * the governorate and area read as the order's own names.
 */
export function primeEditDiff(before: CourierSheetOrder, after: CourierSheetOrder): PrimeEditDiff | null {
    const next = buildPrimeShipment(after, SAME_MERCHANT);
    if (!next.ok) return { kind: "blocked", reason: next.reason };
    const prev = buildPrimeShipment(before, SAME_MERCHANT);
    const was: Partial<PrimeShipmentUpdate> = prev.ok ? primeUpdateFields(prev.payload) : {};
    const now = primeUpdateFields(next.payload);

    const changes: PrimeEditChange[] = [];
    for (const [key, field] of FIELDS) {
        if ((was[key] ?? null) === (now[key] ?? null)) continue;
        changes.push({ field, before: shown(field, was[key], before), after: shown(field, now[key], after) });
    }
    if (changes.length === 0) return null;
    return {
        kind: "changes",
        changes,
        amountBefore: was.receiptAmtIqd ?? 0,
        amountAfter: now.receiptAmtIqd,
        stateAfter: now.state,
        districtAfter: now.district ?? null,
    };
}

const iqd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function shown(field: PrimeEditField, value: PrimeShipmentUpdate[keyof PrimeShipmentUpdate] | undefined, order: CourierSheetOrder): string {
    if (value === undefined || value === null || value === "") return "";
    if (field === "governorate") return order.city?.trim() || String(value);
    if (field === "area") return readPrimeDistrict(order.prime_district)?.name ?? String(value);
    if (field === "amount" || field === "goodsValue") return iqd.format(Number(value));
    return String(value);
}
