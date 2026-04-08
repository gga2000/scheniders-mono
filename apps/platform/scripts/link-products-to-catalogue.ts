import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function linkProductsToCatalogue() {
    console.log('📂 Finding Perceviron product in catalogue...');

    // Find Perceviron product in catalogue
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, image_url, tag_color');

    if (prodError) {
        console.error('❌ Error fetching products:', prodError.message);
        return;
    }

    console.log('📦 Products in catalogue:');
    products?.forEach(p => console.log(`   - ${p.name} (ID: ${p.id})`));

    // Find the Perceviron product
    const perceviron = products?.find(p =>
        p.name.includes('بيرسيفيرون') ||
        p.name.toLowerCase().includes('perceviron') ||
        p.name.toLowerCase().includes('persiveron')
    );

    if (!perceviron) {
        console.error('❌ Perceviron product not found in catalogue');
        console.log('Available products:', products?.map(p => p.name).join(', '));
        return;
    }

    console.log(`✅ Found Perceviron: ${perceviron.name} (ID: ${perceviron.id})`);

    // Find all orders with بيرسيفيرون that don't have product_id
    const { data: orders, error: ordError } = await supabase
        .from('orders')
        .select('id, order_id, items');

    if (ordError) {
        console.error('❌ Error fetching orders:', ordError.message);
        return;
    }

    let updated = 0;

    for (const order of orders || []) {
        if (!order.items || order.items.length === 0) continue;

        let modified = false;
        const updatedItems = order.items.map((item: any) => {
            // Check if this item is Perceviron and doesn't have product_id
            if ((item.name.includes('بيرسيفيرون') ||
                item.name.toLowerCase().includes('perceviron')) &&
                !item.product_id) {
                modified = true;
                return {
                    ...item,
                    product_id: perceviron.id,
                    image_url: perceviron.image_url || item.image_url,
                    tag_color: perceviron.tag_color || item.tag_color,
                };
            }
            return item;
        });

        if (modified) {
            const { error: updateError } = await supabase
                .from('orders')
                .update({ items: updatedItems })
                .eq('id', order.id);

            if (updateError) {
                console.error(`❌ Error updating ${order.order_id}:`, updateError.message);
            } else {
                updated++;
                console.log(`✅ Linked ${order.order_id} items to catalogue`);
            }
        }
    }

    console.log(`\n📊 Summary: Updated ${updated} orders`);
}

linkProductsToCatalogue().catch(console.error);
