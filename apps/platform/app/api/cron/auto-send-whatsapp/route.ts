import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { sendTemplateMessage } from '@/lib/interakt';
import { type Order } from '@/types/order';

// Create admin client for server-side operations
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Max execution time

/**
 * Cron job: Auto-send WhatsApp confirmation to new orders
 * Runs frequently (e.g., every 5 mins)
 */
export async function GET(request: Request) {
    try {
        // Verify cron secret for security (optional but recommended)
        const authHeader = request.headers.get('authorization');
        const cronSecret = env.CRON_SECRET;

        // If CRON_SECRET is set, validate the request
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            // Allow Vercel's internal cron requests
            const isVercelCron = request.headers.get('x-vercel-cron') === '1';
            if (!isVercelCron) {
                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 }
                );
            }
        }

        // Create Supabase client
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Check if auto-send is enabled
        const { data: settingsData, error: settingsError } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'whatsapp_auto_send')
            .single();

        if (settingsError && settingsError.code !== 'PGRST116') {
            console.error('[Auto-Send] Error fetching settings:', settingsError);
            return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
        }

        const autoSendConfig = settingsData?.value as { enabled?: boolean } | undefined;

        if (!autoSendConfig?.enabled) {
            return NextResponse.json({
                success: true,
                message: 'Auto-send is disabled in settings. Skipping.',
                processedCount: 0
            });
        }

        // 2. Query eligible orders (new, no contact yet, within last 24h)
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);

        const { data: eligibleOrders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('status', 'new')
            .gt('created_at', yesterday.toISOString())
            .or('contact_count.eq.0,contact_count.is.null')
            .order('created_at', { ascending: true })
            .limit(10); // Batch limit to respect API rate limits

        if (ordersError) {
            console.error('[Auto-Send] Error fetching eligible orders:', ordersError);
            return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
        }

        if (!eligibleOrders || eligibleOrders.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No eligible orders found to process.',
                processedCount: 0
            });
        }

        console.log(`[Auto-Send] Found ${eligibleOrders.length} orders to process.`);

        let processedCount = 0;
        let successCount = 0;

        // 3. Process orders
        for (const order of eligibleOrders as Order[]) {
            try {
                // Must have a phone number to send
                if (!order.phone) {
                    console.log(`[Auto-Send] Skipping order ${order.order_id} - no phone number`);
                    continue;
                }

                // Call interakt API to send the confirmation template
                const result = await sendTemplateMessage(order, 'confirmation');

                if (result.success) {
                    // Update order status and increment contact count
                    // We can use the RPC function first, or regular update
                    const { error: updateError } = await supabase
                        .from('orders')
                        .update({
                            status: 'contacted',
                            contact_count: 1,
                            last_contacted_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', order.id);

                    if (updateError) {
                        console.error(`[Auto-Send] Failed to update DB for order ${order.order_id}:`, updateError);
                    } else {
                        // Log activity
                        await supabase.from('whatsapp_logs').insert([{
                            order_id: order.id,
                            template_name: 'cod_order_confirm',
                            status: 'sent',
                            message_id: result.messageId || null,
                            sent_by: 'system_auto'
                        }]);

                        successCount++;
                    }
                } else {
                    console.error(`[Auto-Send] Interakt error for order ${order.order_id}:`, result.error);
                }
            } catch (err) {
                console.error(`[Auto-Send] Exception processing order ${order.order_id}:`, err);
            }

            processedCount++;

            // Artificial delay to prevent aggressive rate limiting
            if (processedCount < eligibleOrders.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${processedCount} orders. Sent ${successCount} confirmations successfully.`,
            processedCount,
            successCount,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('[Auto-Send] Unexpected error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
