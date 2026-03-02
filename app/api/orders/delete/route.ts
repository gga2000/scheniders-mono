import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { env } from '@/lib/env';

/**
 * POST /api/orders/delete
 *
 * Delete orders by IDs using service role (bypasses RLS).
 * Requires authenticated admin user.
 * Body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
    try {
        // Verify the requesting user is authenticated and is an admin
        const supabaseUser = await createSupabaseServerClient();
        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { data: profile } = await supabaseUser
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return NextResponse.json(
                { success: false, error: 'Admin access required' },
                { status: 403 }
            );
        }

        const { ids } = await request.json();

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No order IDs provided' },
                { status: 400 }
            );
        }

        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json(
                { success: false, error: 'Service role key not configured' },
                { status: 500 }
            );
        }

        const supabaseAdmin = createClient(
            env.NEXT_PUBLIC_SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Unlink self-referencing FK first
        await supabaseAdmin
            .from('orders')
            .update({ original_order_id: null })
            .in('original_order_id', ids);

        // Delete the orders
        const { data: deletedRows, error: deleteError } = await supabaseAdmin
            .from('orders')
            .delete()
            .in('id', ids)
            .select('id');

        if (deleteError) {
            return NextResponse.json(
                { success: false, error: deleteError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            count: deletedRows?.length || 0,
            deletedIds: (deletedRows || []).map(r => r.id),
        });
    } catch (error) {
        console.error('Delete orders error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
