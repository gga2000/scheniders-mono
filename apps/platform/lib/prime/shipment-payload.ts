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
import type { PrimeShipmentPayload } from "@/lib/prime/client";

/** The Prime merchant + shop a tenant ships as (prime_connections). */
export interface PrimeMerchant {
    merchantLoginId: string;
    shopId: number;
}

/** Why an order cannot go through the API; it then goes in the Excel file as before. */
export type PrimeSkipReason = "after_sale" | "no_governorate" | "bad_phone" | "no_value";

export type PrimePayloadResult =
    | { ok: true; payload: PrimeShipmentPayload }
    | { ok: false; reason: PrimeSkipReason };

/** Prime's 18 state codes (GET /general/states), the same set as our governorates' OMS codes. */
const PRIME_STATES = new Set([
    "BGD", "BAS", "NJF", "KRB", "BBL", "DWN", "DYL", "AMA", "SAH",
    "ANB", "NAS", "KOT", "SAM", "KRK", "SMH", "ARB", "DOH", "MOS",
]);

/** 07xxxxxxxxx, the 11 digits Prime requires, or null. */
export function primePhone(phone: string | null | undefined): string | null {
    const local = cleanPhoneForExport(phone ?? "");
    return /^7\d{9}$/.test(local) ? `0${local}` : null;
}

/**
 * One order as a Prime shipment: the same receipt number, amount, notes and
 * product text as the label and the Prime Excel file, so Prime's scanner and
 * statement match the order exactly as they do today.
 *
 * Refund and replacement orders are left to the Excel file for now: their
 * pickup and cash direction have no tested mapping to the API yet.
 */
export function buildPrimeShipment(order: CourierSheetOrder, merchant: PrimeMerchant): PrimePayloadResult {
    if (order.is_return || order.is_replacement) return { ok: false, reason: "after_sale" };

    const state = toOmsGovernorateCode(courierGovernorateCode(order));
    if (!state || !PRIME_STATES.has(state)) return { ok: false, reason: "no_governorate" };

    const phone = primePhone(order.phone);
    if (!phone) return { ok: false, reason: "bad_phone" };

    const cod = computeCodAmount(order);
    // A shipment with nothing to collect must declare the goods' value instead.
    const goodsValue = Math.round(Number(order.price) || 0);
    if (cod === 0 && goodsValue <= 0) return { ok: false, reason: "no_value" };

    const secondPhone = primePhone(order.secondary_phone);
    return {
        ok: true,
        payload: {
            merchantLoginId: merchant.merchantLoginId,
            senderId: merchant.shopId,
            custReceiptNoOri: labelReceiptNumber(order.order_id),
            senderSystemCaseIdWithCharacters: order.order_id,
            receiverName: order.customer_name || "",
            receiverHp1: phone,
            ...(secondPhone && secondPhone !== phone ? { receiverHp2: secondPhone } : {}),
            state,
            locationDetails: order.address_details || order.city || "",
            receiptAmtIqd: cod,
            ...(cod === 0 ? { undeclaredShipmentValue: goodsValue } : {}),
            qty: totalQuantity(order),
            productInfo: productType(order),
            rmk: courierNotes(order),
            haveReturnItems: "N",
        },
    };
}
