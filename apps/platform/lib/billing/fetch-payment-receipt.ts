import type { SupabaseClient } from "@supabase/supabase-js";
import type { TopupRequest } from "@/hooks/use-wallet-topup";
import type { PaymentReceipt } from "./payment-receipt";

/**
 * The receipt for one approved top-up: the request the shop already holds,
 * plus its store name (RLS limits the read to the caller's own store) and our
 * legal name from the payment details.
 */
export async function fetchPaymentReceipt(
    client: SupabaseClient,
    tenant: { id: string; displayId: number | null },
    request: TopupRequest,
    legalName: string | null,
): Promise<PaymentReceipt> {
    if (request.outcome !== "approved" || request.receipt_no === null) {
        throw new Error("Only an approved payment has a receipt");
    }
    const { data: store, error } = await client.from("tenants").select("business_name").eq("id", tenant.id).single();
    if (error) throw error;
    return {
        receiptNo: request.receipt_no,
        legalName,
        storeName: (store as { business_name: string | null }).business_name ?? "",
        displayId: tenant.displayId,
        method: request.method,
        sentIqd: request.amount_iqd,
        creditedIqd: request.credited_iqd ?? request.amount_iqd,
        sentAt: request.created_at,
        approvedAt: request.decided_at ?? request.created_at,
    };
}
