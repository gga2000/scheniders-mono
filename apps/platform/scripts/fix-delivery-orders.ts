import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function fixDeliveryOrders() {
    console.log('📂 Fetching orders to fix...');

    // Get orders that need fixing (delivery imports or placeholder names)
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_id, customer_name, price, items, notes');

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} total orders`);

    let nameFixed = 0;
    let productFixed = 0;

    for (const order of orders || []) {
        const updates: any = {};
        const price = Number(order.price);

        // Fix customer name if it's a placeholder
        if (order.customer_name?.startsWith('Customer ')) {
            updates.customer_name = 'Manual Order';
            nameFixed++;
        }

        // Fix products for 44750 price if no items
        if (price === 44750 && (!order.items || order.items.length === 0)) {
            updates.items = [{
                name: 'بيرسيفيرون',
                quantity: 1,
                price: 44750,
                image_url: null
            }];
            productFixed++;
        }

        // Apply updates if any
        if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
                .from('orders')
                .update(updates)
                .eq('id', order.id);

            if (updateError) {
                console.error(`❌ Error updating ${order.order_id}:`, updateError.message);
            } else {
                const changes = [];
                if (updates.customer_name) changes.push(`Name → "Manual Order"`);
                if (updates.items) changes.push(`Product → بيرسيفيرون`);
                console.log(`✅ Fixed ${order.order_id}: ${changes.join(', ')}`);
            }
        }
    }

    console.log('\n📊 Summary:');
    console.log(`   🏷️ Names fixed: ${nameFixed}`);
    console.log(`   📦 Products added: ${productFixed}`);
}

fixDeliveryOrders().catch(console.error);
