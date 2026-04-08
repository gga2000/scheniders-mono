import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSources() {
    console.log('📂 Loading orders...');

    // Get all orders
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_id, source');

    if (error) {
        console.error('Failed to load orders:', error.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} orders`);

    let lightfunnelsCount = 0;
    let whatsappCount = 0;
    let metaCount = 0;

    for (const order of orders || []) {
        // Extract the numeric part of the order_id (e.g., "LF-5457-178" -> "5457")
        const match = order.order_id.match(/LF-(\d+)/);
        if (!match) continue;

        const orderNum = parseInt(match[1], 10);
        let newSource: string;

        if (orderNum < 10000) {
            // 5000-series are lightfunnels
            newSource = 'lightfunnels';
        } else {
            // 10000+ are whatsapp/meta (keep existing or assign random)
            if (order.source === 'lightfunnels' || !order.source) {
                newSource = Math.random() < 0.5 ? 'whatsapp' : 'meta';
            } else {
                continue; // Already has correct source
            }
        }

        const { error: updateError } = await supabase
            .from('orders')
            .update({ source: newSource })
            .eq('id', order.id);

        if (updateError) {
            console.error(`Failed to update order ${order.order_id}:`, updateError.message);
        } else {
            if (newSource === 'lightfunnels') lightfunnelsCount++;
            else if (newSource === 'whatsapp') whatsappCount++;
            else if (newSource === 'meta') metaCount++;
        }
    }

    console.log('\n📊 Update Summary:');
    console.log(`   🚀 LightFunnels: ${lightfunnelsCount}`);
    console.log(`   💬 WhatsApp: ${whatsappCount}`);
    console.log(`   📘 Meta: ${metaCount}`);
    console.log(`   📦 Total updated: ${lightfunnelsCount + whatsappCount + metaCount}`);
}

fixSources().catch(console.error);
