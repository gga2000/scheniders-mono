"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireTenantAdminFor } from "@/lib/auth/require-action-caller";

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
    // This credits real money to a caller-supplied account id and runs as
    // service-role. Without this check any caller could mint up to 10,000,000
    // IQD into any tenant's wallet: a Server Action is a public endpoint.
    const auth = await requireTenantAdminFor(accessToken, tenantId);
    if (!auth.ok) return { success: false, error: auth.error };

    if (amountIqd <= 0) {
        return { success: false, error: "Amount must be positive" };
    }

    if (amountIqd > 10_000_000) {
        return { success: false, error: "Amount exceeds maximum top-up limit" };
    }

    const supabase = createSupabaseServiceClient();

    try {
        // Idempotency check: if a key is provided, see if this top-up was already processed
        if (idempotencyKey) {
            const { data: existingTx } = await supabase
                .from("wallet_transactions")
                .select("balance_after_iqd")
                .eq("tenant_id", tenantId)
                .eq("reference_id", idempotencyKey)
                .maybeSingle();

            if (existingTx) {
                // Already processed — return existing balance without double-crediting
                return { success: true, newBalance: existingTx.balance_after_iqd };
            }
        }

        // Get current wallet
        const { data: wallet, error: walletError } = await supabase
            .from("wallet")
            .select("balance_iqd, total_topped_up_iqd")
            .eq("tenant_id", tenantId)
            .single();

        if (walletError || !wallet) {
            return { success: false, error: "Wallet not found" };
        }

        const newBalance = wallet.balance_iqd + amountIqd;

        // Update wallet
        const { error: updateError } = await supabase
            .from("wallet")
            .update({
                balance_iqd: newBalance,
                total_topped_up_iqd: wallet.total_topped_up_iqd + amountIqd,
                updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", tenantId);

        if (updateError) {
            return { success: false, error: `Failed to update wallet: ${updateError.message}` };
        }

        // Log transaction (include reference_id for idempotency tracking)
        const { error: txError } = await supabase.from("wallet_transactions").insert({
            tenant_id: tenantId,
            type: "topup",
            amount_iqd: amountIqd,
            balance_after_iqd: newBalance,
            description: `Wallet top-up via ${paymentMethod}`,
            payment_method: paymentMethod,
            ...(idempotencyKey ? { reference_id: idempotencyKey } : {}),
        });

        if (txError) {
            console.error("[Wallet] Transaction log failed:", txError.message);
        }

        return { success: true, newBalance };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: msg };
    }
}
