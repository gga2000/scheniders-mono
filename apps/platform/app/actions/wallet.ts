"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * Top up a tenant's wallet.
 * In production this would be called after payment verification (ZainCash/Qi Card webhook).
 * For now, it's a direct top-up action for admin/testing.
 */
export async function topUpWalletAction(
    tenantId: string,
    amountIqd: number,
    paymentMethod: string = "manual"
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    if (amountIqd <= 0) {
        return { success: false, error: "Amount must be positive" };
    }

    if (amountIqd > 10_000_000) {
        return { success: false, error: "Amount exceeds maximum top-up limit" };
    }

    const supabase = createSupabaseServiceClient();

    try {
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

        // Log transaction
        await supabase.from("wallet_transactions").insert({
            tenant_id: tenantId,
            type: "top_up",
            amount_iqd: amountIqd,
            balance_after_iqd: newBalance,
            description: `Wallet top-up via ${paymentMethod}`,
            payment_method: paymentMethod,
        });

        return { success: true, newBalance };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: msg };
    }
}
