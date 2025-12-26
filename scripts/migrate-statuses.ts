import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateStatuses() {
    console.log('🔄 Migrating order statuses...');

    // Change "delivered" to "in_transit"
    const { data: deliveredOrders, error: deliveredError } = await supabase
        .from('orders')
        .update({ status: 'in_transit' })
        .eq('status', 'delivered')
        .select('id, order_id');

    if (deliveredError) {
        console.error('Error updating delivered orders:', deliveredError.message);
    } else {
        console.log(`📦 Changed ${deliveredOrders?.length || 0} orders from "delivered" → "in_transit"`);
    }

    // Change "rejected" to "cancelled"
    const { data: rejectedOrders, error: rejectedError } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('status', 'rejected')
        .select('id, order_id');

    if (rejectedError) {
        console.error('Error updating rejected orders:', rejectedError.message);
    } else {
        console.log(`❌ Changed ${rejectedOrders?.length || 0} orders from "rejected" → "cancelled"`);
    }

    console.log('\n✅ Migration complete!');
}

migrateStatuses().catch(console.error);
