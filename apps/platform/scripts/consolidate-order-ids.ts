import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Extract base ID from any order ID format
function getBaseId(orderId: string): string {
    const lfMatch = orderId.match(/LF-(\d+)-\d+$/);
    if (lfMatch) return lfMatch[1];
    if (orderId.startsWith('DLV-')) return orderId.replace('DLV-', '');
    if (orderId.startsWith('RTN-')) {
        const match = orderId.match(/RTN-(\d+)/);
        if (match) return match[1];
    }
    const digits = orderId.match(/^\d+$/);
    return digits ? digits[0] : orderId;
}

async function consolidateOrderIds() {
    console.log('📂 Fetching all orders...');

    const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} total orders`);

    // Group orders by base ID
    const ordersByBaseId = new Map<string, any[]>();

    for (const order of orders || []) {
        const baseId = getBaseId(order.order_id);
        if (!ordersByBaseId.has(baseId)) {
            ordersByBaseId.set(baseId, []);
        }
        ordersByBaseId.get(baseId)!.push(order);
    }

    // Find duplicates (same base ID, multiple entries)
    let duplicateGroups = 0;
    const ordersToDelete: string[] = [];

    for (const [baseId, groupOrders] of ordersByBaseId.entries()) {
        if (groupOrders.length > 1) {
            duplicateGroups++;
            console.log(`\n🔍 Duplicate group for base ID ${baseId}:`);

            // Sort by: prefer LF- format, then by created_at (keep older)
            groupOrders.sort((a, b) => {
                // Prefer LF- format
                const aIsLF = a.order_id.startsWith('LF-');
                const bIsLF = b.order_id.startsWith('LF-');
                if (aIsLF && !bIsLF) return -1;
                if (!aIsLF && bIsLF) return 1;
                // Otherwise keep the one with more data
                const aDataScore = (a.items?.length || 0) + (a.customer_name !== 'Manual Order' ? 1 : 0) + (a.price > 0 ? 1 : 0);
                const bDataScore = (b.items?.length || 0) + (b.customer_name !== 'Manual Order' ? 1 : 0) + (b.price > 0 ? 1 : 0);
                return bDataScore - aDataScore;
            });

            const keep = groupOrders[0];
            const duplicates = groupOrders.slice(1);

            console.log(`   ✅ Keep: ${keep.order_id} (${keep.customer_name}, ${keep.price} IQD)`);

            for (const dup of duplicates) {
                console.log(`   🗑️ Delete: ${dup.order_id} (${dup.customer_name}, ${dup.price} IQD)`);
                ordersToDelete.push(dup.id);
            }
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Duplicate groups found: ${duplicateGroups}`);
    console.log(`   Orders to delete: ${ordersToDelete.length}`);

    if (ordersToDelete.length > 0) {
        console.log('\n🗑️ Deleting duplicates...');

        for (const id of ordersToDelete) {
            const { error: deleteError } = await supabase
                .from('orders')
                .delete()
                .eq('id', id);

            if (deleteError) {
                console.error(`❌ Error deleting ${id}:`, deleteError.message);
            }
        }

        console.log(`✅ Deleted ${ordersToDelete.length} duplicate orders`);
    } else {
        console.log('✅ No duplicates to delete');
    }
}

consolidateOrderIds().catch(console.error);
