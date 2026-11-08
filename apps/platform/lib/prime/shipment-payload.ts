import { createHash } from "node:crypto";
import { toOmsGovernorateCode } from "@scheniders/shared/governorates";
import { computeCodAmount, computeRefundPayout, courierAmount } from "@/lib/order-money";
import { labelReceiptNumber } from "@/lib/dispatch-label";
import {
    courierGovernorateCode,
    courierNotes,
    productType,
    totalQuantity,
    type CourierSheetOrder,
} from "@/lib/shipping/courier-sheets";
import { PRIME_LIMITS, type PrimeShipmentPayload, type PrimeShipmentUpdate } from "@/lib/prime/client";
import { primePhone } from "@/lib/prime/phone";
import { primeDistrictIdFor } from "@/lib/prime/district";

/** The Prime merchant + shop a tenant ships as (prime_connections). */
export interface PrimeMerchant {
    merchantLoginId: string;
    shopId: number;
}

/** Why an order cannot go through the API: a data problem a person must fix on the order. */
export type PrimeSkipReason = "no_governorate" | "bad_phone" | "no_value" | "bad_receipt" | "amount_out_of_range";

export type PrimePayloadResult =
    | { ok: true; payload: PrimeShipmentPayload }
    | { ok: false; reason: PrimeSkipReason };

/** Text cut to what Prime's column holds (a longer value is refused with no message). */
function clip(text: string | null | undefined, max: number): string {
    const clean = (text ?? "").trim();
    return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
}

/** The city and the street details together, unless the details already name the city. */
export function primeAddress(order: Pick<CourierSheetOrder, "city" | "address_details">): string {
    const city = (order.city ?? "").trim();
    const details = (order.address_details ?? "").trim();
    if (!details) return city;
    if (!city || details.includes(city)) return details;
    return `${city} - ${details}`;
}

/** Prime's int column for our id: only a plain number that fits in 32 bits. */
function numericCaseId(orderId: string): number | undefined {
    if (!/^\d{1,10}$/.test(orderId)) return undefined;
    const n = Number(orderId);
    return n > 0 && n <= 2_147_483_647 ? n : undefined;
}

/**
 * The status an order waits in for the desk to hand it to Prime: a refund is
 * created as return_pending, every other order (replacements too) as confirmed.
 * Taking a parcel back from Prime returns the order to it.
 */
export function primeReadyStatus(order: { is_return?: boolean | null }): "return_pending" | "confirmed" {
    return order.is_return ? "return_pending" : "confirmed";
}

/**
 * What Prime's receipt carries when the driver pays the customer. Prime takes
 * no negative amount (it refuses the parcel), so such a parcel goes as 1 IQD
 * and the money to hand over leads the note (primePayNote).
 */
export const PRIME_PAY_PLACEHOLDER_IQD = 1;

const iqd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** The note's first line on a parcel where the driver pays the customer: the amount, collect nothing, bring the item back. */
export function primePayNote(payIqd: number, items: string): string {
    const back = items ? ` · استلم من الزبون: ${items}` : "";
    return `تنبيه: ادفع للزبون ${iqd.format(payIqd)} د.ع · لا تستلم أي مبلغ${back}`;
}

/**
 * The cash at the door, signed: positive
 * when the driver collects it, negative when the driver pays the customer.
 * A refund pays the customer back (the label's «ادفع للزبون»); a replacement
 * collects the difference, or pays it when the new item is cheaper.
 */
export function primeReceiptAmount(order: CourierSheetOrder): number {
    if (order.is_return) return 0 - computeRefundPayout(order);
    if (order.is_replacement) return courierAmount(order);
    return computeCodAmount(order);
}

/**
 * One order as a Prime shipment: the same receipt number, amount, notes and
 * product text as the label and the Prime Excel file, so Prime's scanner and
 * statement match the order exactly as they do today. The state code is our
 * governorate's OMS code; Prime's 18 state codes are the same set.
 *
 * Refunds and replacements go the same way, marked as carrying items back
 * (the old item the driver picks up). When the driver pays the customer, the
 * receipt says 1 IQD and the note opens with the amount to pay.
 */
export function buildPrimeShipment(order: CourierSheetOrder, merchant: PrimeMerchant): PrimePayloadResult {
    const afterSale = Boolean(order.is_return || order.is_replacement);

    const state = toOmsGovernorateCode(courierGovernorateCode(order));
    if (!state) return { ok: false, reason: "no_governorate" };

    const phone = primePhone(order.phone);
    if (!phone) return { ok: false, reason: "bad_phone" };

    const receipt = labelReceiptNumber(order.order_id);
    if (!receipt || receipt.length > PRIME_LIMITS.reference || order.order_id.length > PRIME_LIMITS.reference) {
        return { ok: false, reason: "bad_receipt" };
    }

    const doorCash = primeReceiptAmount(order);
    const pays = doorCash < 0;
    const cod = pays ? PRIME_PAY_PLACEHOLDER_IQD : doorCash;
    // A shipment with nothing to collect must declare the goods' value instead
    // (an after-sale order's price is negative when it pays the customer).
    const goodsValue = Math.abs(Math.round(Number(order.price) || 0));
    if (cod === 0 && goodsValue <= 0) return { ok: false, reason: "no_value" };
    if (Math.abs(doorCash) > PRIME_LIMITS.maxAmountIqd) return { ok: false, reason: "amount_out_of_range" };
    const items = productType(order);
    const notes = courierNotes(order);

    const secondPhone = primePhone(order.secondary_phone);
    const numericId = numericCaseId(order.order_id);
    const district = primeDistrictIdFor(order.prime_district, state);
    return {
        ok: true,
        payload: {
            merchantLoginId: merchant.merchantLoginId,
            senderId: merchant.shopId,
            custReceiptNoOri: receipt,
            senderSystemCaseIdWithCharacters: order.order_id,
            ...(numericId ? { senderSystemCaseId: numericId } : {}),
            receiverName: clip(order.customer_name, PRIME_LIMITS.receiverName),
            receiverHp1: phone,
            ...(secondPhone && secondPhone !== phone ? { receiverHp2: secondPhone } : {}),
            state,
            ...(district ? { district } : {}),
            locationDetails: clip(primeAddress(order), PRIME_LIMITS.locationDetails),
            receiptAmtIqd: cod,
            ...(cod === 0 ? { undeclaredShipmentValue: goodsValue } : {}),
            qty: totalQuantity(order),
            productInfo: clip(items, PRIME_LIMITS.productInfo),
            rmk: clip(pays ? [primePayNote(-doorCash, items), notes].filter(Boolean).join(" - ") : notes, PRIME_LIMITS.rmk),
            haveReturnItems: afterSale ? "Y" : "N",
            ...(afterSale ? { haveReturnItemsDesc: clip(items, PRIME_LIMITS.productInfo) } : {}),
        },
    };
}

/**
 * The shipment as update-shipment takes it: every field it replaces, in a
 * fixed order (the hash below depends on it). The receipt number and our ids
 * are not editable at Prime and stay out.
 */
export function primeUpdateFields(payload: PrimeShipmentPayload): PrimeShipmentUpdate {
    return {
        senderId: payload.senderId,
        receiverName: payload.receiverName,
        receiverHp1: payload.receiverHp1,
        ...(payload.receiverHp2 ? { receiverHp2: payload.receiverHp2 } : {}),
        state: payload.state,
        ...(payload.district ? { district: payload.district } : {}),
        locationDetails: payload.locationDetails,
        receiptAmtIqd: payload.receiptAmtIqd,
        ...(payload.undeclaredShipmentValue !== undefined ? { undeclaredShipmentValue: payload.undeclaredShipmentValue } : {}),
        qty: payload.qty,
        productInfo: payload.productInfo,
        rmk: payload.rmk,
        haveReturnItems: payload.haveReturnItems,
        ...(payload.haveReturnItemsDesc ? { haveReturnItemsDesc: payload.haveReturnItemsDesc } : {}),
    };
}

/** What Prime holds for a shipment, as a short fingerprint: equal fingerprints need no update call. */
export function primeShipmentHash(fields: PrimeShipmentUpdate): string {
    return createHash("sha256").update(JSON.stringify(fields)).digest("hex").slice(0, 32);
}
