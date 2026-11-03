import { toOmsGovernorateCode } from "@scheniders/shared/governorates";
import { computeCodAmount } from "@/lib/order-money";
import { labelReceiptNumber } from "@/lib/dispatch-label";
import {
    cleanPhoneForExport,
    courierGovernorateCode,
    courierNotes,
    productType,
    totalQuantity,
    type CourierSheetOrder,
} from "@/lib/shipping/courier-sheets";
import { PRIME_LIMITS, type PrimeShipmentPayload } from "@/lib/prime/client";

/** The Prime merchant + shop a tenant ships as (prime_connections). */
export interface PrimeMerchant {
    merchantLoginId: string;
    shopId: number;
}

/**
 * Why an order cannot go through the API; it then goes in the Excel file as before.
 *  - after_sale: refunds and replacements, by design for now (see below).
 *  - the rest are data problems a person must fix on the order.
 */
export type PrimeSkipReason = "after_sale" | "no_governorate" | "bad_phone" | "no_value" | "bad_receipt" | "amount_out_of_range";

export type PrimePayloadResult =
    | { ok: true; payload: PrimeShipmentPayload }
    | { ok: false; reason: PrimeSkipReason };

/** 07xxxxxxxxx, the 11 digits Prime requires, or null. */
export function primePhone(phone: string | null | undefined): string | null {
    const local = cleanPhoneForExport(phone ?? "");
    return /^7\d{9}$/.test(local) ? `0${local}` : null;
}

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
 * One order as a Prime shipment: the same receipt number, amount, notes and
 * product text as the label and the Prime Excel file, so Prime's scanner and
 * statement match the order exactly as they do today. The state code is our
 * governorate's OMS code; Prime's 18 state codes are the same set.
 *
 * Refund and replacement orders are left to the Excel file for now: their
 * pickup and cash direction have no tested mapping to the API yet.
 */
export function buildPrimeShipment(order: CourierSheetOrder, merchant: PrimeMerchant): PrimePayloadResult {
    if (order.is_return || order.is_replacement) return { ok: false, reason: "after_sale" };

    const state = toOmsGovernorateCode(courierGovernorateCode(order));
    if (!state) return { ok: false, reason: "no_governorate" };

    const phone = primePhone(order.phone);
    if (!phone) return { ok: false, reason: "bad_phone" };

    const receipt = labelReceiptNumber(order.order_id);
    if (!receipt || receipt.length > PRIME_LIMITS.reference || order.order_id.length > PRIME_LIMITS.reference) {
        return { ok: false, reason: "bad_receipt" };
    }

    const cod = computeCodAmount(order);
    // A shipment with nothing to collect must declare the goods' value instead.
    const goodsValue = Math.round(Number(order.price) || 0);
    if (cod === 0 && goodsValue <= 0) return { ok: false, reason: "no_value" };
    if (cod < 0 || cod > PRIME_LIMITS.maxAmountIqd) return { ok: false, reason: "amount_out_of_range" };

    const secondPhone = primePhone(order.secondary_phone);
    const numericId = numericCaseId(order.order_id);
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
            locationDetails: clip(primeAddress(order), PRIME_LIMITS.locationDetails),
            receiptAmtIqd: cod,
            ...(cod === 0 ? { undeclaredShipmentValue: goodsValue } : {}),
            qty: totalQuantity(order),
            productInfo: clip(productType(order), PRIME_LIMITS.productInfo),
            rmk: clip(courierNotes(order), PRIME_LIMITS.rmk),
            haveReturnItems: "N",
        },
    };
}
