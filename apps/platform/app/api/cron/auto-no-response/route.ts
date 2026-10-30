import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { requireCronAuth } from '@/lib/cron-auth';

// Create admin client for server-side operations
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 seconds max

/**
 * Cron job: Auto-move contacted orders to no_response after 2 days
 * Runs daily at 6 AM via Vercel Cron
 */
export async function GET(request: Request) {
    try {
        // Fails closed. The `x-vercel-cron: 1` fallback that used to sit here
        // let anyone who sent that header run a service-role status sweep
        // (NEW-P1-14); Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
        const denied = requireCronAuth(request);
        if (denied) return denied;

        // Create Supabase client
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Call the database function to update stale contacted orders
        const { data, error } = await supabase.rpc('auto_move_to_no_response', {
            days_threshold: 2
        });

        if (error) {
            console.error('[Auto No Response] Database error:', error);
            return NextResponse.json(
                { error: 'Database error', details: error.message },
                { status: 500 }
            );
        }

        const affectedCount = data ?? 0;

        console.log(`[Auto No Response] Moved ${affectedCount} orders to no_response`);

        return NextResponse.json({
            success: true,
            message: `Moved ${affectedCount} orders to no_response`,
            affectedCount,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('[Auto No Response] Unexpected error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
