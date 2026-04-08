import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function removeDlvPrefix() {
    console.log('🔍 Finding orders with DLV- prefix...');

    // Get all orders with DLV- prefix
    const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select('id, order_id')
        .like('order_id', 'DLV-%');

    if (fetchError) {
        console.error('❌ Error fetching orders:', fetchError.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} orders with DLV- prefix`);

    if (!orders || orders.length === 0) {
        console.log('✅ No orders to update');
        return;
    }

    let updated = 0;
    let errors = 0;

    for (const order of orders) {
        // Remove the DLV- prefix
        const newOrderId = order.order_id.replace(/^DLV-/, '');

        const { error: updateError } = await supabase
            .from('orders')
            .update({ order_id: newOrderId })
            .eq('id', order.id);

        if (updateError) {
            console.error(`❌ Error updating ${order.order_id}:`, updateError.message);
            errors++;
        } else {
            console.log(`✅ ${order.order_id} → ${newOrderId}`);
            updated++;
        }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ❌ Errors: ${errors}`);
}

removeDlvPrefix().catch(console.error);
