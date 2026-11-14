import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { verifyQstashCallback } from "@/lib/qstash-verify";
import { env } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
    sendCartRecoveryMessage,
    type RecoverableCart,
} from "@/lib/abandoned-cart-sender";
import { resolveCartRecovery } from "@scheniders/shared";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sharedSenderAllows } from "@/lib/interakt";
import type { AbandonedCartItem, StoreConfigV2 } from "@scheniders/shared";
import { CRON_MONITORS, withCronMonitor, withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Floor: never consider a cart younger than this. Each tenant's own delay (from
// its config) is applied on top, so this is just the cheapest pre-filter.
const MIN_DELAY_MINUTES = 5;
// Runs every 10 minutes (vercel.json), so a cart is nudged within 10 minutes of its delay.
const BATCH_SIZE = 50;
// Carts read per store per run, so every opted-in store gets a turn.
const PER_STORE_BATCH = 10;
// A nudge more than a day after the latest possible delay (24 h) reaches a shopper who
// has moved on; such carts, and the backlog from before a store turned recovery on,
// are never sent.
const STALE_AFTER_MINUTES = 2 * 24 * 60;
// Owner decision 2026-10-27: an abandoned checkout nobody contacted for 14 days goes to the trash.
const CHECKOUT_EXPIRE_AFTER = "14 days";
// Consent on a capture is the shopper's claim (any caller can send the line),
// so a store's paid recovery sends are capped per day: a flood of fake phones
// costs at most this many messages, and a real store rarely has more.
const RECOVERY_SENDS_PER_STORE_PER_DAY = 40;

interface SweepResult {
    processed: number;
    sent: number;
    failed: number;
    /** Not sent because the store's daily budget is spent or the limiter is down. */
    skipped: number;
}

/**
 * Sweep storefront phone captures (abandoned_carts) and send WhatsApp recovery nudges. Recovery is OPT-IN
 * per tenant: a cart is only nudged if its tenant enabled recovery AND the cart
 * has been idle past that tenant's configured delay. A cart is claimed
 * (reminded_at) before its send; a send Interakt refused releases the claim so
 * the next sweep retries it. Service role → bypasses RLS.
 */
async function sweepAbandonedCarts(): Promise<SweepResult> {
    const db = createSupabaseServiceClient();
    const now = Date.now();
    const staleCutoff = new Date(now - STALE_AFTER_MINUTES * 60_000).toISOString();

    // Recovery is opt-in, so only opted-in stores' carts are read: carts of stores
    // that never turned it on used to fill the batch and starve the ones that did.
    const { data: tenants, error: tenantsError } = await db
        .from("tenants")
        .select("id, store_config_v2")
        .eq("store_config_v2->commerce->cart_recovery->>enabled", "true");
    if (tenantsError) throw new Error(tenantsError.message);

    // Only stores that can actually send (on the shared number), each with its
    // own delay, in a fresh order every run so no store is always last.
    const stores = (tenants ?? [])
        .map((t) => ({
            id: (t as { id: string }).id,
            cfg: resolveCartRecovery((t as { store_config_v2: StoreConfigV2 | null }).store_config_v2?.commerce?.cart_recovery),
        }))
        .filter((t) => t.cfg.enabled && sharedSenderAllows(t.id));
    for (let i = stores.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [stores[i], stores[j]] = [stores[j], stores[i]];
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    // Each store reads its own due carts with its own small batch. One store's
    // flood of captures (consent is the shopper's claim) or its spent daily
    // budget can then only hold up that store, never another one.
    for (const store of stores) {
        if (processed >= BATCH_SIZE) break;
        const dueCutoff = new Date(now - Math.max(MIN_DELAY_MINUTES, store.cfg.delayMinutes) * 60_000).toISOString();
        const { data, error } = await db
            .from("abandoned_carts")
            .select("id, tenant_id, phone, items, subtotal_iqd, updated_at")
            .eq("tenant_id", store.id)
            .is("reminded_at", null)
            .is("recovered_at", null)
            // Consent: only a shopper who typed their phone with the consent line
            // on screen may get an automatic WhatsApp. A capture without it is a
            // lead for staff to call, never a send.
            .not("consent_at", "is", null)
            .lte("updated_at", dueCutoff)
            .gte("updated_at", staleCutoff)
            .order("updated_at", { ascending: true })
            .limit(Math.min(PER_STORE_BATCH, BATCH_SIZE - processed));
        if (error) throw new Error(error.message);

        const carts = (data ?? []) as Array<{
            id: string;
            tenant_id: string;
            phone: string;
            items: AbandonedCartItem[];
            subtotal_iqd: number;
            updated_at: string;
        }>;
        for (const c of carts) {
            processed += 1;
            const budget = await consumeRateLimit(
                `cart-recovery:${store.id}`,
                RECOVERY_SENDS_PER_STORE_PER_DAY,
                86_400,
            );
            if (budget.error || !budget.allowed) {
                // Fail closed: a send costs money and reaches a stranger's phone.
                if (budget.error) console.error(`[abandoned-cart-recovery] limiter unavailable: ${budget.error}`);
                skipped += 1;
                // This store is done for now; the rest of its carts wait.
                break;
            }

            const cart: RecoverableCart = {
                id: c.id,
                tenant_id: c.tenant_id,
                phone: c.phone,
                items: Array.isArray(c.items) ? c.items : [],
                subtotal_iqd: c.subtotal_iqd ?? 0,
            };
            // Claim before sending: stamping after the send let a failed stamp,
            // or Vercel killing the run between send and stamp, resend the
            // same paid message 10 minutes later. Only the run whose claim
            // lands may send.
            const { data: claimed, error: claimError } = await db
                .from("abandoned_carts")
                .update({ reminded_at: new Date().toISOString() })
                .eq("id", c.id)
                .is("reminded_at", null)
                .select("id");
            if (claimError) throw new Error(claimError.message);
            if (!claimed || claimed.length === 0) continue;

            const result = await sendCartRecoveryMessage(cart);
            if (result.success) {
                sent += 1;
                continue;
            }
            failed += 1;
            console.error(`[abandoned-cart-recovery] cart ${c.id} not sent: ${result.error ?? "unknown"}`);
            if (result.delivery === "unknown") continue; // may have reached the phone: keep the claim
            // Interakt refused it: nothing was sent, so the next run may try again.
            const { error: releaseError } = await db
                .from("abandoned_carts")
                .update({ reminded_at: null })
                .eq("id", c.id);
            if (releaseError) console.error(`[abandoned-cart-recovery] cart ${c.id} claim not released: ${releaseError.message}`);
        }
    }

    return { processed, sent, failed, skipped };
}

/** Abandoned checkouts (orders in pending_checkout) moved to the trash by this run, per reason. */
type CheckoutSweepResult = Record<string, number>;

/**
 * Move junk and stale abandoned checkouts to the 30-day trash. The rules
 * (bad phone, no location, untouched for EXPIRE_AFTER) live in
 * sweep_abandoned_carts so every caller applies the same ones.
 */
async function sweepAbandonedCheckouts(): Promise<CheckoutSweepResult> {
    const db = createSupabaseServiceClient();
    const { data, error } = await db.rpc("sweep_abandoned_carts", {
        _expire_after: CHECKOUT_EXPIRE_AFTER,
    });
    if (error) throw new Error(error.message);
    const removed: CheckoutSweepResult = {};
    for (const row of data ?? []) {
        removed[row.outcome] = (removed[row.outcome] ?? 0) + row.removed;
    }
    return removed;
}

async function runSweeps() {
    const checkouts = await sweepAbandonedCheckouts();
    const reminders = await sweepAbandonedCarts();
    return { ...reminders, checkoutsRemoved: checkouts };
}

/**
 * A run where sends were attempted and none went out answers 500, so the
 * Sentry monitor goes red (a revoked Interakt key used to look like a quiet
 * night).
 */
function sweepResponse(result: Awaited<ReturnType<typeof runSweeps>>): NextResponse {
    if (result.failed > 0 && result.sent === 0) {
        return NextResponse.json(
            { success: false, error: `All ${result.failed} recovery sends failed`, ...result },
            { status: 500 },
        );
    }
    return NextResponse.json({ success: true, ...result });
}

async function runScheduled(request: Request): Promise<NextResponse> {
    const denied = requireCronAuth(request);
    if (denied) return denied;
    try {
        const result = await runSweeps();
        return sweepResponse(result);
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Sweep failed" },
            { status: 500 },
        );
    }
}

async function runQueued(request: Request): Promise<NextResponse> {
    const currentSigningKey = env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = env.QSTASH_NEXT_SIGNING_KEY;
    if (!currentSigningKey || !nextSigningKey) {
        return NextResponse.json(
            { error: "QStash signing keys not configured" },
            { status: 401 },
        );
    }
    const body = await request.text();
    const signature = request.headers.get("upstash-signature") || "";
    try {
        await verifyQstashCallback({ currentSigningKey, nextSigningKey, signature, body, requestUrl: request.url });
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    try {
        const result = await runSweeps();
        return sweepResponse(result);
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Sweep failed" },
            { status: 500 },
        );
    }
}

export const GET = withCronMonitor(CRON_MONITORS.abandonedCartRecovery, runScheduled);
export const POST = withFailureReport("abandoned-cart-recovery-qstash", runQueued);
