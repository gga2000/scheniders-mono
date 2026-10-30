"use server";

import { resolveCaller } from "@/lib/auth/resolve-order-caller";
import {
    createAfterSaleOrder,
    receiveAfterSaleItem,
    type AfterSaleInput,
    type AfterSaleResult,
    type ReceiveAfterSaleInput,
} from "@/lib/after-sale/create";

export type { AfterSaleInput, AfterSaleResult, ReceiveAfterSaleInput } from "@/lib/after-sale/create";

/** The refund and replacement sheets: a refund (RTN-) or replacement (RPL-) order. */
export async function createAfterSaleOrderAction(input: AfterSaleInput, accessToken: string): Promise<AfterSaleResult> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    return createAfterSaleOrder(resolved.caller, input);
}

/** The receive-back inbox: what came back on one after-sale line. */
export async function receiveAfterSaleItemAction(
    input: ReceiveAfterSaleInput,
    accessToken: string,
): Promise<{ success: true } | { success: false; error: string }> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    return receiveAfterSaleItem(resolved.caller, input);
}
