import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * GET /api/debug/webhook-status
 *
 * Comprehensive diagnostic endpoint for Lightfunnels integration
 */
export async function GET(request: Request) {
    const report: any = {
        timestamp: new Date().toISOString(),
        status: 'checking',
        issues: [],
        warnings: [],
        info: [],
    };

    // 1. Environment Check
    report.environment = {
        supabaseUrl: !!env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseServiceKey: !!env.SUPABASE_SERVICE_ROLE_KEY,
        webhookSecret: !!env.LIGHTFUNNELS_WEBHOOK_SECRET,
        qstashToken: !!env.QSTASH_TOKEN,
        qstashCurrentKey: !!env.QSTASH_CURRENT_SIGNING_KEY,
        qstashNextKey: !!env.QSTASH_NEXT_SIGNING_KEY,
        siteUrl: env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'NOT_SET',
        webhookLogging: env.WEBHOOK_LOGGING_ENABLED || 'false',
    };

    if (!env.LIGHTFUNNELS_WEBHOOK_SECRET) {
        report.warnings.push('LIGHTFUNNELS_WEBHOOK_SECRET not set - webhooks will accept any request (security risk)');
    }

    if (!env.QSTASH_TOKEN) {
        report.issues.push('QSTASH_TOKEN not set - abandoned checkout processing will fail');
    }

    // 2. Lightfunnels API Token Check
    try {
        const { data: tokenData, error: tokenError } = await supabase
            .from('settings')
            .select('value, updated_at')
            .eq('key', 'lightfunnels_access_token')
            .single();

        if (tokenError || !tokenData?.value) {
            report.issues.push('Lightfunnels API token not configured in database (Settings page)');
            report.lightfunnelsToken = { configured: false };
        } else {
            report.lightfunnelsToken = {
                configured: true,
                lastUpdated: tokenData.updated_at,
                tokenPreview: tokenData.value.substring(0, 20) + '...',
            };
            report.info.push('Lightfunnels API token is configured');
        }
    } catch (err) {
        report.issues.push(`Error checking Lightfunnels token: ${err}`);
    }

    // 3. Recent Orders Check (last 24 hours)
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // All orders
        const { data: allOrders, count: totalCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: false })
            .gte('created_at', oneDayAgo);

        // Lightfunnels orders
        const { data: lfOrders, count: lfCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: false })
            .eq('source', 'lightfunnels')
            .gte('created_at', oneDayAgo);

        // Completed orders (not checkouts)
        const { data: completedOrders, count: completedCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: false })
            .eq('source', 'lightfunnels')
            .neq('status', 'pending_checkout')
            .gte('created_at', oneDayAgo);

        // Pending checkouts
        const { data: checkouts, count: checkoutCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: false })
            .eq('source', 'lightfunnels')
            .eq('status', 'pending_checkout')
            .gte('created_at', oneDayAgo);

        report.ordersLast24h = {
            total: totalCount || 0,
            fromLightfunnels: lfCount || 0,
            completedOrders: completedCount || 0,
            abandonedCheckouts: checkoutCount || 0,
        };

        if ((lfCount || 0) === 0) {
            report.warnings.push('No orders imported from Lightfunnels in last 24 hours');
        } else {
            report.info.push(`${lfCount} order(s) imported from Lightfunnels in last 24 hours`);
        }

        // Show latest 3 orders
        if (lfOrders && lfOrders.length > 0) {
            report.recentOrders = lfOrders.slice(0, 3).map((o: any) => ({
                orderId: o.order_id,
                customer: o.customer_name,
                status: o.status,
                createdAt: o.created_at,
            }));
        }
    } catch (err) {
        report.issues.push(`Error checking orders: ${err}`);
    }

    // 4. Checkout Queue Check
    try {
        const { data: pending, count: pendingCount } = await supabase
            .from('checkout_queue')
            .select('*', { count: 'exact', head: false })
            .is('processed_at', null);

        const { data: failed } = await supabase
            .from('checkout_queue')
            .select('*')
            .is('processed_at', null)
            .gte('attempts', 3); // Max attempts reached

        report.checkoutQueue = {
            pending: pendingCount || 0,
            failed: failed?.length || 0,
        };

        if ((pendingCount || 0) > 0) {
            report.warnings.push(`${pendingCount} checkout(s) pending in queue`);

            // Show details of pending checkouts
            if (pending && pending.length > 0) {
                report.pendingCheckouts = pending.map((c: any) => ({
                    checkoutId: c.checkout_id,
                    queuedAt: c.queued_at,
                    processAfter: c.process_after,
                    attempts: c.attempts,
                    lastError: c.last_error,
                    isReady: new Date(c.process_after) <= new Date(),
                }));
            }
        }

        if ((failed?.length || 0) > 0) {
            report.issues.push(`${failed?.length} checkout(s) failed after max attempts`);
        }

        // Check recently processed
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentProcessed } = await supabase
            .from('checkout_queue')
            .select('*')
            .not('processed_at', 'is', null)
            .gte('processed_at', oneHourAgo);

        if (recentProcessed && recentProcessed.length > 0) {
            report.info.push(`${recentProcessed.length} checkout(s) processed in last hour`);
        }
    } catch (err) {
        report.issues.push(`Error checking checkout queue: ${err}`);
    }

    // 5. Webhook Endpoint Test
    let siteUrl = env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;

    // In development, use the request origin
    if (!siteUrl) {
        const url = new URL(request.url);
        siteUrl = url.origin;
    }

    if (siteUrl) {
        const webhookUrl = siteUrl.startsWith('http')
            ? `${siteUrl}/api/webhooks/lightfunnels`
            : `https://${siteUrl}/api/webhooks/lightfunnels`;

        report.webhookEndpoint = {
            url: webhookUrl,
            accessible: false,
        };

        try {
            const response = await fetch(webhookUrl, { method: 'GET' });
            if (response.ok) {
                const data = await response.json();
                report.webhookEndpoint.accessible = true;
                report.webhookEndpoint.status = data.status;
                report.info.push('Webhook endpoint is accessible');
            } else {
                report.issues.push(`Webhook endpoint returned ${response.status}`);
            }
        } catch (err) {
            report.issues.push(`Cannot reach webhook endpoint: ${err}`);
        }
    } else {
        report.warnings.push('NEXT_PUBLIC_SITE_URL not set - cannot test webhook endpoint');
    }

    // 6. Overall Status
    if (report.issues.length > 0) {
        report.status = 'error';
    } else if (report.warnings.length > 0) {
        report.status = 'warning';
    } else {
        report.status = 'ok';
    }

    // 7. Recommendations
    report.recommendations = [];

    if (!env.LIGHTFUNNELS_WEBHOOK_SECRET) {
        report.recommendations.push({
            priority: 'medium',
            action: 'Set LIGHTFUNNELS_WEBHOOK_SECRET environment variable',
            reason: 'Improve webhook security',
        });
    }

    if (!env.QSTASH_TOKEN) {
        report.recommendations.push({
            priority: 'high',
            action: 'Configure QStash (https://upstash.com/qstash)',
            reason: 'Required for abandoned checkout processing',
        });
    }

    if (!report.lightfunnelsToken?.configured) {
        report.recommendations.push({
            priority: 'high',
            action: 'Configure Lightfunnels API token in Settings',
            reason: 'Required for checkout data fetching and manual sync',
        });
    }

    if ((report.checkoutQueue?.pending || 0) > 0) {
        report.recommendations.push({
            priority: 'high',
            action: 'Visit /api/cron/process-checkouts-manual to process pending checkouts',
            reason: `${report.checkoutQueue.pending} checkout(s) waiting to be processed`,
        });
    }

    if ((report.ordersLast24h?.fromLightfunnels || 0) === 0) {
        report.recommendations.push({
            priority: 'high',
            action: 'Check Lightfunnels webhook configuration',
            reason: 'No orders imported in last 24 hours - webhook may not be configured or may be failing',
            steps: [
                'Go to Lightfunnels dashboard → Settings → Webhooks',
                `Add webhook: ${report.webhookEndpoint?.url || 'https://yourdomain.com/api/webhooks/lightfunnels'}`,
                'Enable events: order/created, checkout/created',
                'Add secret header: x-webhook-secret',
                'Test webhook delivery',
            ],
        });
    }

    return NextResponse.json(report, {
        status: 200,
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}
