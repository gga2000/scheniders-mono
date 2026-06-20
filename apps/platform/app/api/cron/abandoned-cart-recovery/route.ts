import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { env } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
    sendCartRecoveryMessage,
    type RecoverableCart,
} from "@/lib/abandoned-cart-sender";
import type { AbandonedCartItem } from "@scheniders/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Wait this long after the customer's last checkout activity before nudging —
// long enough that they've genuinely left, short enough to still recover.
const DELAY_MINUTES = 30;
const BATCH_SIZE = 20;

let _supabase: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabase = () => (_supabase ??= createSupabaseServiceClient());

interface SweepResult {
    processed: number;
    sent: number;
    failed: number;
}

/**
 * Find carts idle past the delay window that haven't been reminded or recovered,
 * send each a WhatsApp recovery nudge, and stamp reminded_at on success (failures
 * stay eligible for the next sweep). Service role → bypasses RLS.
 */
async function sweepAbandonedCarts(): Promise<SweepResult> {
    const cutoff = new Date(Date.now() - DELAY_MINUTES * 60_000).toISOString();

    const { data, error } = await supabase()
        .from("abandoned_carts")
        .select("id, phone, items, subtotal_iqd")
        .is("reminded_at", null)
        .is("recovered_at", null)
        .lte("updated_at", cutoff)
        .order("updated_at", { ascending: true })
        .limit(BATCH_SIZE);

    if (error) throw new Error(error.message);

    const carts = (data ?? []) as Array<{
        id: string;
        phone: string;
        items: AbandonedCartItem[];
        subtotal_iqd: number;
    }>;

    let sent = 0;
    let failed = 0;
    for (const c of carts) {
        const cart: RecoverableCart = {
            id: c.id,
            phone: c.phone,
            items: Array.isArray(c.items) ? c.items : [],
            subtotal_iqd: c.subtotal_iqd ?? 0,
        };
        const result = await sendCartRecoveryMessage(cart);
        if (result.success) {
            sent += 1;
            await supabase()
                .from("abandoned_carts")
                .update({ reminded_at: new Date().toISOString() })
                .eq("id", c.id);
        } else {
            failed += 1;
        }
    }

    return { processed: carts.length, sent, failed };
}

export async function GET(request: Request): Promise<NextResponse> {
    const authHeader = request.headers.get("authorization");
    if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const result = await sweepAbandonedCarts();
        return NextResponse.json({ success: true, ...result });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Sweep failed" },
            { status: 500 },
        );
    }
}

export async function POST(request: Request): Promise<NextResponse> {
    const currentSigningKey = env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = env.QSTASH_NEXT_SIGNING_KEY;
    if (!currentSigningKey || !nextSigningKey) {
        return NextResponse.json(
            { error: "QStash signing keys not configured" },
            { status: 401 },
        );
    }
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    const body = await request.text();
    const signature = request.headers.get("upstash-signature") || "";
    try {
        await receiver.verify({ signature, body });
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    try {
        const result = await sweepAbandonedCarts();
        return NextResponse.json({ success: true, ...result });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Sweep failed" },
            { status: 500 },
        );
    }
}
