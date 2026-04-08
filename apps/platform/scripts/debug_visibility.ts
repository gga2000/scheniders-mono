
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkVisibility() {
    const returnOrderId = '1260217011';
    console.log(`Checking visibility for order ${returnOrderId}...`);

    const { data: order, error } = await supabase
        .from('orders')
        .select('id, status, is_archived, created_at')
        .eq('order_id', returnOrderId)
        .single();

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    console.log('Order Details:');
    console.log(`- Status: ${order.status}`);
    console.log(`- Is Archived: ${order.is_archived} (Type: ${typeof order.is_archived})`);
    console.log(`- Created At: ${order.created_at}`);

    // Test the filter used in use-orders.ts explicitly
    const { count, error: countError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('order_id', returnOrderId)
        .eq('is_archived', false);

    if (countError) console.error('Filter check error:', countError.message);

    console.log(`\nMatches .eq('is_archived', false) filter? ${count === 1 ? 'YES' : 'NO'}`);
}

checkVisibility();
