import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";

const topupSchema = z.object({
  tenant_id: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = topupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { tenant_id, amount, description } = parsed.data;
    const supabase = createAdminClient();

    // Fetch current wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallet")
      .select("balance_iqd, total_topped_up_iqd")
      .eq("tenant_id", tenant_id)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: "Wallet not found for this tenant" },
        { status: 400 }
      );
    }

    const currentBalance = Number(wallet.balance_iqd) || 0;
    const currentToppedUp = Number(wallet.total_topped_up_iqd) || 0;
    const newBalance = currentBalance + amount;
    const newToppedUp = currentToppedUp + amount;

    // Update wallet balance and total topped up
    const { error: updateError } = await supabase
      .from("wallet")
      .update({
        balance_iqd: newBalance,
        total_topped_up_iqd: newToppedUp,
      })
      .eq("tenant_id", tenant_id);

    if (updateError) {
      console.error("Wallet update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update wallet" },
        { status: 500 }
      );
    }

    // Insert transaction record
    const { error: txError } = await supabase
      .from("wallet_transactions")
      .insert({
        tenant_id,
        type: "topup",
        amount_iqd: amount,
        balance_after_iqd: newBalance,
        description: description || "Admin top-up",
      });

    if (txError) {
      console.error("Transaction insert error:", txError);
      return NextResponse.json(
        { error: "Wallet updated but failed to record transaction" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, newBalance });
  } catch (error) {
    console.error("Top-up API error:", error);
    return NextResponse.json(
      { error: "Failed to process top-up" },
      { status: 500 }
    );
  }
}
