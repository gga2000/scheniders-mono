import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function deleteTestOrders() {
    // Find orders with test product names (English brand names)
    const testPatterns = ['Chanel', 'Tom Ford', 'Lancôme', 'Gucci', 'Versace', 'YSL', 'Miss Dior', 'Dior Sauvage', 'Paco Rabanne', 'Test Product'];

    console.log('📂 Fetching orders...');

    const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select('id, order_id, items');

    if (fetchError) {
        console.error('❌ Error fetching orders:', fetchError.message);
        return;
    }

    const toDelete: { id: string; orderId: string; reason: string }[] = [];

    for (const order of orders || []) {
        let items = order.items;
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch { continue; }
        }

        const testItem = items?.find((item: any) =>
            testPatterns.some(pattern => item.name?.includes(pattern))
        );

        if (testItem) {
            toDelete.push({
                id: order.id,
                orderId: order.order_id,
                reason: testItem.name
            });
        }
    }

    console.log(`🔍 Found ${toDelete.length} test orders to delete:`);
    toDelete.forEach(o => console.log(`   - ${o.orderId}: ${o.reason}`));

    if (toDelete.length > 0) {
        const ids = toDelete.map(o => o.id);
        const { error } = await supabase.from('orders').delete().in('id', ids);

        if (error) {
            console.error('❌ Error deleting:', error.message);
        } else {
            console.log(`✅ Deleted ${toDelete.length} test orders`);
        }
    }
}

deleteTestOrders().catch(console.error);
