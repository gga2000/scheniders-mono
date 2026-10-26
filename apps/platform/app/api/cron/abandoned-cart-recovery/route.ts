import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { Receiver } from "@upstash/qstash";
import { env } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
    sendCartRecoveryMessage,
    type RecoverableCart,
} from "@/lib/abandoned-cart-sender";
import { resolveCartRecovery } from "@scheniders/shared";
import type { AbandonedCartItem, StoreConfigV2 } from "@scheniders/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Floor: never consider a cart younger than this. Each tenant's own delay (from
// its config) is applied on top, so this is just the cheapest pre-filter.
const MIN_DELAY_MINUTES = 5;
const BATCH_SIZE = 50;

interface SweepResult {
    processed: number;
    sent: number;
    failed: number;
    /** Skipped because the tenant opted out or the cart isn't past its delay. */
    skipped: number;
}

/**
 * Sweep abandoned carts and send WhatsApp recovery nudges. Recovery is OPT-IN
 * per tenant: a cart is only nudged if its tenant enabled recovery AND the cart
 * has been idle past that tenant's configured delay. Sends stamp reminded_at;
 * failures stay eligible for the next sweep. Service role → bypasses RLS.
 */
async function sweepAbandonedCarts(): Promise<SweepResult> {
    const db = createSupabaseServiceClient();
    const floorCutoff = new Date(
        Date.now() - MIN_DELAY_MINUTES * 60_000,
    ).toISOString();

    const { data, error } = await db
        .from("abandoned_carts")
        .select("id, tenant_id, phone, items, subtotal_iqd, updated_at")
        .is("reminded_at", null)
        .is("recovered_at", null)
        // Consent: only a shopper who typed their phone with the consent line
        // on screen may get an automatic WhatsApp. A capture without it is a
        // lead for staff to call, never a send.
        .not("consent_at", "is", null)
        .lte("updated_at", floorCutoff)
        .order("updated_at", { ascending: true })
        .limit(BATCH_SIZE);

    if (error) throw new Error(error.message);

    const carts = (data ?? []) as Array<{
        id: string;
        tenant_id: string;
        phone: string;
        items: AbandonedCartItem[];
        subtotal_iqd: number;
        updated_at: string;
    }>;
    if (carts.length === 0) {
        return { processed: 0, sent: 0, failed: 0, skipped: 0 };
    }

    // Load each involved tenant's recovery config once.
    const tenantIds = [...new Set(carts.map((c) => c.tenant_id))];
    const { data: tenants } = await db
        .from("tenants")
        .select("id, store_config_v2")
        .in("id", tenantIds);

    const cfgByTenant = new Map<
        string,
        ReturnType<typeof resolveCartRecovery>
    >();
    for (const t of (tenants ?? []) as Array<{
        id: string;
        store_config_v2: StoreConfigV2 | null;
    }>) {
        cfgByTenant.set(
            t.id,
            resolveCartRecovery(t.store_config_v2?.commerce?.cart_recovery),
        );
    }

    const now = Date.now();
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const c of carts) {
        const cfg = cfgByTenant.get(c.tenant_id);
        // Opted out, or not yet idle past this tenant's delay → leave for later.
        if (!cfg || !cfg.enabled) {
            skipped += 1;
            continue;
        }
        const dueAt =
            new Date(c.updated_at).getTime() + cfg.delayMinutes * 60_000;
        if (now < dueAt) {
            skipped += 1;
            continue;
        }

        const cart: RecoverableCart = {
            id: c.id,
            phone: c.phone,
            items: Array.isArray(c.items) ? c.items : [],
            subtotal_iqd: c.subtotal_iqd ?? 0,
        };
        const result = await sendCartRecoveryMessage(cart);
        if (result.success) {
            sent += 1;
            await db
                .from("abandoned_carts")
                .update({ reminded_at: new Date().toISOString() })
                .eq("id", c.id);
        } else {
            failed += 1;
        }
    }

    return { processed: carts.length, sent, failed, skipped };
}

export async function GET(request: Request): Promise<NextResponse> {
    const denied = requireCronAuth(request);
    if (denied) return denied;
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
