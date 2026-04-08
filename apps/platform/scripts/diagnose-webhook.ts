#!/usr/bin/env ts-node
/**
 * Lightfunnels Webhook Diagnostic Tool
 *
 * This script helps diagnose issues with Lightfunnels order imports.
 * Run it to check:
 * 1. Environment configuration
 * 2. Database connectivity
 * 3. Webhook endpoint accessibility
 * 4. Checkout queue status
 * 5. Recent webhook activity
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function diagnose() {
    console.log('🔍 Lightfunnels Webhook Diagnostics\n');
    console.log('='.repeat(60));

    // 1. Check environment variables
    console.log('\n📋 Environment Configuration:');
    const envVars = {
        'NEXT_PUBLIC_SUPABASE_URL': !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        'SUPABASE_SERVICE_ROLE_KEY': !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        'LIGHTFUNNELS_WEBHOOK_SECRET': !!process.env.LIGHTFUNNELS_WEBHOOK_SECRET,
        'QSTASH_TOKEN': !!process.env.QSTASH_TOKEN,
        'QSTASH_CURRENT_SIGNING_KEY': !!process.env.QSTASH_CURRENT_SIGNING_KEY,
        'QSTASH_NEXT_SIGNING_KEY': !!process.env.QSTASH_NEXT_SIGNING_KEY,
        'NEXT_PUBLIC_SITE_URL': process.env.NEXT_PUBLIC_SITE_URL || 'NOT SET',
        'WEBHOOK_LOGGING_ENABLED': process.env.WEBHOOK_LOGGING_ENABLED || 'false',
    };

    for (const [key, value] of Object.entries(envVars)) {
        const status = typeof value === 'boolean'
            ? (value ? '✅ SET' : '❌ MISSING')
            : `ℹ️  ${value}`;
        console.log(`  ${key}: ${status}`);
    }

    // 2. Check Lightfunnels access token in database
    console.log('\n🔑 Lightfunnels Access Token:');
    try {
        const { data: tokenData, error: tokenError } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'lightfunnels_access_token')
            .single();

        if (tokenError) {
            console.log('  ❌ Not configured in database');
            console.log(`     Error: ${tokenError.message}`);
        } else if (tokenData?.value) {
            console.log('  ✅ Configured');
            console.log(`     Token: ${tokenData.value.substring(0, 20)}...`);
        } else {
            console.log('  ❌ Not found in settings table');
        }
    } catch (err) {
        console.log(`  ❌ Error checking token: ${err}`);
    }

    // 3. Check checkout queue
    console.log('\n📦 Checkout Queue Status:');
    try {
        const { data: queuedCheckouts, error: queueError } = await supabase
            .from('checkout_queue')
            .select('*')
            .is('processed_at', null)
            .order('queued_at', { ascending: false })
            .limit(10);

        if (queueError) {
            console.log(`  ❌ Error querying queue: ${queueError.message}`);
        } else if (!queuedCheckouts || queuedCheckouts.length === 0) {
            console.log('  ✅ No pending checkouts in queue');
        } else {
            console.log(`  ⚠️  ${queuedCheckouts.length} pending checkout(s):`);
            for (const checkout of queuedCheckouts) {
                const processAfter = new Date(checkout.process_after);
                const isReady = processAfter <= new Date();
                const status = isReady ? '🔴 READY' : '⏳ WAITING';
                console.log(`     ${status} ${checkout.checkout_id} (attempts: ${checkout.attempts})`);
                console.log(`         Queued: ${checkout.queued_at}`);
                console.log(`         Process after: ${checkout.process_after}`);
                if (checkout.last_error) {
                    console.log(`         Last error: ${checkout.last_error}`);
                }
            }
        }

        // Check processed checkouts in last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentProcessed } = await supabase
            .from('checkout_queue')
            .select('*')
            .not('processed_at', 'is', null)
            .gte('processed_at', oneHourAgo);

        if (recentProcessed && recentProcessed.length > 0) {
            console.log(`\n  ℹ️  ${recentProcessed.length} checkout(s) processed in last hour`);
        }
    } catch (err) {
        console.log(`  ❌ Error checking queue: ${err}`);
    }

    // 4. Check recent orders from Lightfunnels
    console.log('\n📊 Recent Lightfunnels Orders:');
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentOrders, error: ordersError } = await supabase
            .from('orders')
            .select('id, order_id, customer_name, status, created_at')
            .eq('source', 'lightfunnels')
            .gte('created_at', oneHourAgo)
            .order('created_at', { ascending: false })
            .limit(5);

        if (ordersError) {
            console.log(`  ❌ Error querying orders: ${ordersError.message}`);
        } else if (!recentOrders || recentOrders.length === 0) {
            console.log('  ⚠️  No orders imported in the last hour');
        } else {
            console.log(`  ✅ ${recentOrders.length} order(s) imported in last hour:`);
            for (const order of recentOrders) {
                console.log(`     ${order.order_id} - ${order.customer_name} (${order.status})`);
                console.log(`       Created: ${order.created_at}`);
            }
        }

        // Check for pending_checkout orders
        const { data: pendingCheckouts } = await supabase
            .from('orders')
            .select('id, order_id, customer_name, created_at')
            .eq('source', 'lightfunnels')
            .eq('status', 'pending_checkout')
            .order('created_at', { ascending: false })
            .limit(5);

        if (pendingCheckouts && pendingCheckouts.length > 0) {
            console.log(`\n  ⚠️  ${pendingCheckouts.length} pending checkout order(s):`);
            for (const order of pendingCheckouts) {
                console.log(`     ${order.order_id} - ${order.customer_name}`);
                console.log(`       Created: ${order.created_at}`);
            }
        }
    } catch (err) {
        console.log(`  ❌ Error checking orders: ${err}`);
    }

    // 5. Webhook endpoint test
    console.log('\n🌐 Webhook Endpoint:');
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
    if (!siteUrl) {
        console.log('  ⚠️  NEXT_PUBLIC_SITE_URL not set - cannot test endpoint');
    } else {
        const webhookUrl = siteUrl.startsWith('http')
            ? `${siteUrl}/api/webhooks/lightfunnels`
            : `https://${siteUrl}/api/webhooks/lightfunnels`;
        console.log(`  URL: ${webhookUrl}`);

        try {
            const response = await fetch(webhookUrl, { method: 'GET' });
            if (response.ok) {
                const data = await response.json();
                console.log('  ✅ Endpoint is accessible');
                console.log(`     Status: ${data.status || 'active'}`);
            } else {
                console.log(`  ❌ Endpoint returned ${response.status}`);
            }
        } catch (err) {
            console.log(`  ❌ Cannot reach endpoint: ${err}`);
        }
    }

    // 6. Recommendations
    console.log('\n💡 Recommendations:');

    if (!process.env.LIGHTFUNNELS_WEBHOOK_SECRET) {
        console.log('  ⚠️  Set LIGHTFUNNELS_WEBHOOK_SECRET in your environment');
    }

    if (!process.env.QSTASH_TOKEN || !process.env.QSTASH_CURRENT_SIGNING_KEY) {
        console.log('  ⚠️  QStash not configured - checkout queue processing may fail');
        console.log('     Sign up at https://upstash.com/qstash');
    }

    if (!process.env.NEXT_PUBLIC_SITE_URL && !process.env.VERCEL_URL) {
        console.log('  ⚠️  Set NEXT_PUBLIC_SITE_URL for webhook URLs');
    }

    console.log('\n📝 Next Steps:');
    console.log('  1. Check Lightfunnels webhook configuration');
    console.log('     - URL: https://yourdomain.com/api/webhooks/lightfunnels');
    console.log('     - Events: order/created, checkout/created');
    console.log('     - Secret header: x-webhook-secret');
    console.log('  2. Test webhook locally:');
    console.log('     - Visit: https://yourdomain.com/api/debug/test-webhook');
    console.log('  3. Check comprehensive status:');
    console.log('     - Visit: https://yourdomain.com/api/debug/webhook-status');
    console.log('  4. Process pending checkouts:');
    console.log('     - Visit: https://yourdomain.com/api/cron/process-checkouts-manual');
    console.log('  5. Check server logs for webhook attempts');

    console.log('\n🔗 Quick Links (replace yourdomain.com):');
    console.log('  • Webhook Status: https://yourdomain.com/api/debug/webhook-status');
    console.log('  • Test Webhook: https://yourdomain.com/api/debug/test-webhook');
    console.log('  • Process Queue: https://yourdomain.com/api/cron/process-checkouts-manual');

    console.log('\n='.repeat(60));
}

diagnose().catch(console.error);
