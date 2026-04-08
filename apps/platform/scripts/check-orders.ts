import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkOrders() {
    // Get all orders sorted by creation time
    const { data } = await supabase
        .from('orders')
        .select('order_id, sequence_number, price, customer_name, created_at')
        .order('created_at', { ascending: false })
        .limit(60);

    console.log('Latest 60 orders by creation time:');
    data?.forEach(o => {
        console.log(
            o.created_at?.substring(0, 16),
            '|', o.order_id,
            '|', o.price, 'IQD |',
            o.customer_name
        );
    });
}

checkOrders().catch(console.error);
