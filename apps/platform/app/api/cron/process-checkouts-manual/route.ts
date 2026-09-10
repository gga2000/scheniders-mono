import { NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/supabase-server';
import { env } from '@/lib/env';
import { fetchCheckoutById, getSavedAccessToken } from '@/lib/lightfunnels-api';
import { parseCheckoutToWebhook, createOrderFromWebhook } from '@/lib/webhook-handler';
import { createSupabaseServiceClient } from '@/lib/supabase-server';

let _supabase: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabase = () => (_supabase ??= createSupabaseServiceClient());

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 50; // Process all pending checkouts

/**
 * GET /api/cron/process-checkouts-manual
 *
 * Manual trigger to process ALL pending checkouts in the queue, from the /debug
 * screen.
 *
 * This used to say "No authentication required - useful for debugging", and it
 * meant it. The middleware matcher excludes `/api`, so nothing else was checking
 * either: anyone who knew the URL could make the production app drain the
 * checkout queue and create orders under the service role. It now requires a
 * signed-in user, like every other operator endpoint.
 */
export async function GET(request: Request) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
        }
        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[Manual] Processing all pending checkouts...');

        // Fetch ALL pending checkout IDs (no time limit)
        const { data: pending, error: fetchErr } = await supabase()
            .from('checkout_queue')
            .select('id, checkout_id, attempts, queued_at, process_after')
            .is('processed_at', null)
            .lt('attempts', MAX_ATTEMPTS)
            .order('queued_at', { ascending: true })
            .limit(BATCH_SIZE);

        if (fetchErr) {
            console.error('[Manual] Error fetching checkout queue:', fetchErr);
            return NextResponse.json({ error: fetchErr.message }, { status: 500 });
        }

        if (!pending || pending.length === 0) {
            return NextResponse.json({
                success: true,
                processed: 0,
                message: 'No pending checkouts in queue',
            });
        }

        console.log(`[Manual] Found ${pending.length} pending checkout(s)`);

        // Get Lightfunnels access token
        const accessToken = await getSavedAccessToken(supabase());
        if (!accessToken) {
            console.error('[Manual] No Lightfunnels access token configured');
            return NextResponse.json({
                error: 'No Lightfunnels API token configured. Please configure it in Settings.',
                pendingCount: pending.length,
                pendingCheckouts: pending.map(p => ({
                    checkoutId: p.checkout_id,
                    queuedAt: p.queued_at,
                    processAfter: p.process_after,
                    attempts: p.attempts,
                })),
            }, { status: 500 });
        }

        let processed = 0;
        let failed = 0;
        const results: Array<{
            checkoutId: string;
            status: 'success' | 'duplicate' | 'failed';
            error?: string;
        }> = [];

        for (const item of pending) {
            try {
                console.log(`[Manual] Processing checkout ${item.checkout_id}...`);

                // Increment attempt count and claim atomically
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
                    console.log(`[Manual] Checkout ${item.checkout_id} already claimed. Skipping.`);
                    continue;
                }

                // Fetch full checkout data from Lightfunnels
                const checkout = await fetchCheckoutById(item.checkout_id, accessToken);
                if (!checkout) {
                    throw new Error(`Could not fetch checkout from Lightfunnels API`);
                }

                // Parse into webhook format
                const webhookData = parseCheckoutToWebhook(checkout);
                if (!webhookData) {
                    throw new Error(`Could not parse checkout data`);
                }

                // Import the checkout
                const result = await createOrderFromWebhook(webhookData, env.LIGHTFUNNELS_TENANT_ID);

                if (result.success || result.duplicate) {
                    // Mark as processed
                    await supabase()
                        .from('checkout_queue')
                        .update({ processed_at: new Date().toISOString() })
                        .eq('id', item.id);

                    console.log(`[Manual] ✅ Checkout ${item.checkout_id}: ${result.duplicate ? 'duplicate' : 'imported'}`);
                    processed++;
                    results.push({
                        checkoutId: item.checkout_id,
                        status: result.duplicate ? 'duplicate' : 'success',
                    });
                } else {
                    throw new Error(result.error || 'Unknown import error');
                }
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`[Manual] ❌ Failed to process checkout ${item.checkout_id}:`, errorMsg);

                // Save error for debugging
                await supabase()
                    .from('checkout_queue')
                    .update({ last_error: errorMsg })
                    .eq('id', item.id);

                failed++;
                results.push({
                    checkoutId: item.checkout_id,
                    status: 'failed',
                    error: errorMsg,
                });
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            failed,
            total: pending.length,
            results,
            message: `Processed ${processed} checkout(s), ${failed} failed`,
        });

    } catch (error) {
        console.error('[Manual] Unexpected error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
