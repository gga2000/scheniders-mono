import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';

// Opt out of caching
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * GET /api/cron/cleanup-deleted-orders
 * 
 * Scheduled job to permanently delete orders that have been soft-deleted
 * for more than 30 days. Uses the service_role key to bypass RLS.
 */
export async function GET(request: Request) {
    try {
        // Verify authorization if it's hitting the endpoint directly (optional depending on your Vercel setup,
        // but it's good practice. Vercel Cron sends a Bearer token matching CRON_SECRET)
        const authHeader = request.headers.get('authorization');
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createSupabaseServiceClient();
        
        // Calculate the threshold date (30 days ago)
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - 30);
        const thresholdIso = thresholdDate.toISOString();

        console.log(`[Cron: cleanup-deleted-orders] Starting cleanup for orders soft-deleted before ${thresholdIso}`);

        // We delete in batches to avoid overwhelming the database or hitting timeouts
        // Delete up to 1000 orders per cron execution
        const { data: deletedOrders, error } = await supabase
            .from('orders')
            .delete()
            .not('deleted_at', 'is', null)
            .lt('deleted_at', thresholdIso)
            .select('id');

        if (error) {
            console.error('[Cron: cleanup-deleted-orders] Error deleting orders:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const count = deletedOrders?.length || 0;
        console.log(`[Cron: cleanup-deleted-orders] Successfully deleted ${count} orders.`);

        return NextResponse.json({
            success: true,
            deletedCount: count,
            threshold: thresholdIso
        });
    } catch (error) {
        console.error('[Cron: cleanup-deleted-orders] Unhandled error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
