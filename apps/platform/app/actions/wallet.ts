"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requirePlatformAdmin } from "@/lib/auth/require-action-caller";

/**
 * Top up a tenant's wallet.
 * In production this would be called after payment verification (ZainCash/Qi Card webhook).
 * For now, it's a direct top-up action for admin/testing.
 */
export async function topUpWalletAction(
    tenantId: string,
    amountIqd: number,
    paymentMethod: string = "manual",
    idempotencyKey?: string,
    accessToken?: string,
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    // This credits real money with no payment verified and runs as
    // service-role, so only a platform admin may call it. A tenant admin check
    // is not enough: every self-serve signup is the admin of its own tenant and
    // could credit itself up to 10,000,000 IQD per call.
    const auth = await requirePlatformAdmin(accessToken);
    if (!auth.ok) return { success: false, error: auth.error };

    if (amountIqd <= 0) {
        return { success: false, error: "Amount must be positive" };
    }

    if (amountIqd > 10_000_000) {
        return { success: false, error: "Amount exceeds maximum top-up limit" };
    }

    const supabase = createSupabaseServiceClient();

    // One atomic RPC: wallet row lock, idempotency check on the key, balance update
    // and ledger insert in a single transaction.
    const { data, error } = await supabase.rpc("admin_topup_wallet", {
        _tenant_id: tenantId,
        _amount: amountIqd,
        _description: `Wallet top-up via ${paymentMethod}`,
        _payment_method: paymentMethod,
        ...(idempotencyKey ? { _reference_id: idempotencyKey } : {}),
    });

    if (error) {
        return { success: false, error: `Failed to top up wallet: ${error.message}` };
    }

    const result = data as { success: boolean; new_balance?: number; error?: string } | null;
    if (!result?.success) {
        return { success: false, error: result?.error ?? "Top-up failed" };
    }
    return { success: true, newBalance: result.new_balance };
}
