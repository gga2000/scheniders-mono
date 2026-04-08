import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkOldFormatOrders() {
    console.log('📂 Checking database for orders with old format IDs...\n');

    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_id, customer_name, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    console.log('📦 Total orders in database:', orders?.length);

    // Find orders that DON'T start with LF-, RTN-, CLN-, DLV-
    const oldFormat = orders?.filter(o =>
        !o.order_id.startsWith('LF-') &&
        !o.order_id.startsWith('RTN-') &&
        !o.order_id.startsWith('CLN-') &&
        !o.order_id.startsWith('DLV-')
    ) || [];

    console.log('\n⚠️ Orders with OLD format (non-prefixed):', oldFormat.length);
    if (oldFormat.length > 0) {
        oldFormat.slice(0, 20).forEach(o => console.log(`   - ${o.order_id} | ${o.customer_name}`));
        if (oldFormat.length > 20) {
            console.log(`   ... and ${oldFormat.length - 20} more`);
        }
    } else {
        console.log('   ✅ None found - all orders use new format!');
    }

    // Count by prefix
    console.log('\n📊 Orders by format:');
    console.log('   LF-*:', orders?.filter(o => o.order_id.startsWith('LF-')).length || 0);
    console.log('   RTN-*:', orders?.filter(o => o.order_id.startsWith('RTN-')).length || 0);
    console.log('   CLN-*:', orders?.filter(o => o.order_id.startsWith('CLN-')).length || 0);
    console.log('   DLV-*:', orders?.filter(o => o.order_id.startsWith('DLV-')).length || 0);
    console.log('   OLD (no prefix):', oldFormat.length);
}

checkOldFormatOrders().catch(console.error);
