import { NextResponse } from 'next/server';
import { requireCronAuth } from "@/lib/cron-auth";
import { Receiver } from '@upstash/qstash';
import { env } from '@/lib/env';
import { fetchCheckoutById, getSavedAccessToken } from '@/lib/lightfunnels-api';
import { parseCheckoutToWebhook, createOrderFromWebhook } from '@/lib/webhook-handler';
import { createSupabaseServiceClient } from '@/lib/supabase-server';

let _supabase: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabase = () => (_supabase ??= createSupabaseServiceClient());

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10; // Process up to 10 checkouts per cron run

/**
 * Shared processing logic for both GET (manual/cron) and POST (QStash) handlers.
 */
async function processCheckoutQueue(): Promise<NextResponse> {
    try {
        const now = new Date().toISOString();

        // Fetch pending checkout IDs that are ready to process
        const { data: pending, error: fetchErr } = await supabase()
            .from('checkout_queue')
            .select('id, checkout_id, attempts')
            .is('processed_at', null)
            .lte('process_after', now)
            .lt('attempts', MAX_ATTEMPTS)
            .order('process_after', { ascending: true })
            .limit(BATCH_SIZE);

        if (fetchErr) {
            console.error('[Cron] Error fetching checkout queue:', fetchErr);
            return NextResponse.json({ error: fetchErr.message }, { status: 500 });
        }

        if (!pending || pending.length === 0) {
            return NextResponse.json({ success: true, processed: 0, message: 'No pending checkouts' });
        }

        console.log(`[Cron] Processing ${pending.length} queued checkout(s)`);

        // Get Lightfunnels access token once - pass the service role client
        const accessToken = await getSavedAccessToken(supabase());
        if (!accessToken) {
            console.error('[Cron] No Lightfunnels access token configured');
            return NextResponse.json({ error: 'No API token configured or internal permission error' }, { status: 500 });
        }

        let processed = 0;
        let failed = 0;

        for (const item of pending) {
            try {
                // Increment attempt count first and claim atomically
                const { data: claimed, error: claimErr } = await supabase()
                    .from('checkout_queue')
                    .update({ attempts: item.attempts + 1 })
                    .eq('id', item.id)
                    .eq('attempts', item.attempts)
                    .select('id');

                if (claimErr) {
                    throw new Error(`Failed to claim checkout: ${claimErr.message}`);
                }

                if (!claimed || claimed.length === 0) {
                    console.log(`[Cron] Checkout ${item.checkout_id} already claimed by another process. Skipping.`);
                    continue; // Skip this one, it's being handled by another invocation
                }

                // Fetch full checkout data from Lightfunnels
                const checkout = await fetchCheckoutById(item.checkout_id, accessToken);
                if (!checkout) {
                    throw new Error(`Could not fetch checkout ${item.checkout_id} from API`);
                }

                // Parse into webhook format
                const webhookData = parseCheckoutToWebhook(checkout);
                if (!webhookData) {
                    throw new Error(`Could not parse checkout ${item.checkout_id}`);
                }

                // Import the checkout. Must attribute to the same tenant the
                // live order webhook uses, else the order is created with a null
                // tenant_id and is invisible in the tenant-scoped app.
                const result = await createOrderFromWebhook(webhookData, env.LIGHTFUNNELS_TENANT_ID);

                if (result.success || result.duplicate) {
                    // Mark as processed (both success and duplicate are OK)
                    await supabase()
                        .from('checkout_queue')
                        .update({ processed_at: new Date().toISOString() })
                        .eq('id', item.id);

                    console.log(`[Cron] Checkout ${item.checkout_id}: ${result.duplicate ? 'duplicate (already exists)' : 'imported'}`);
                    processed++;
                } else {
                    throw new Error(result.error || 'Unknown import error');
                }
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`[Cron] Failed to process checkout ${item.checkout_id}:`, errorMsg);

                // Save error for debugging, but don't mark as processed (will retry)
                await supabase()
                    .from('checkout_queue')
                    .update({ last_error: errorMsg })
                    .eq('id', item.id);

                failed++;
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            failed,
            total: pending.length,
        });

    } catch (error) {
        console.error('[Cron] Unexpected error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/cron/process-checkouts
 *
 * Manual trigger (UI button) or Vercel Cron.
 */
export async function GET(request: Request) {
    // Verify cron secret (Vercel automatically sends this)
    const denied = requireCronAuth(request);
    if (denied) return denied;

    return processCheckoutQueue();
}

/**
 * POST /api/cron/process-checkouts
 *
 * Called by Upstash QStash after a scheduled delay.
 * Verifies the QStash signature before processing.
 */
export async function POST(request: Request) {
    const currentSigningKey = env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = env.QSTASH_NEXT_SIGNING_KEY;

    if (!currentSigningKey || !nextSigningKey) {
        return NextResponse.json({ error: 'QStash signing keys not configured' }, { status: 401 });
    }

    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    const body = await request.text();
    const signature = request.headers.get('upstash-signature') || '';

    try {
        await receiver.verify({ signature, body });
    } catch {
        console.error('[Cron] Invalid QStash signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    console.log('[Cron] Processing checkout queue via QStash callback');
    return processCheckoutQueue();
}
