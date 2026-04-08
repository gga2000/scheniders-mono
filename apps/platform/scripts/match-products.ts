import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Improved fuzzy matching for Arabic product names
function matchProduct(orderProductName: string, products: any[]): any | null {
    const normalized = orderProductName.toLowerCase().trim();

    // Product name synonyms/variations (keys match database product names)
    const synonyms: Record<string, string[]> = {
        'بستاشيو': ['بستاشيو', 'فستق', 'خير بستاشيو', 'خير فستق', 'pistachio', 'بستاشو'],
        'ايدنتتي': ['ايدنتتي', 'ايدينتتي', 'ادينتيتي', 'identity', 'ايدينتيتي', 'ادينتتي'],
        'بيرسيفيرون': ['بيرسيفيرون', 'برسيفيرون', 'perseveron', 'بيرسفيرون', 'بيرسيفرون'],
        'فيوجن': ['فيوجن', 'fusion', 'فيوجين'],
        'ايبسكو': ['ايبسكو', 'ابسكو', 'ipesco', 'ابيسكو'],
        'رفقات': ['رفقات', 'رفقات وايت', 'rafaqat', 'رفقة'],
    };

    // Try exact match first
    const exactMatch = products.find(p =>
        p.name.toLowerCase().trim() === normalized
    );
    if (exactMatch) return exactMatch;

    // Try if order item contains exact product name anywhere
    const containsMatch = products.find(p => {
        const productName = p.name.toLowerCase().trim();
        return normalized.includes(productName);
    });
    if (containsMatch) return containsMatch;

    // Try synonym matching
    for (const product of products) {
        const productName = product.name.toLowerCase().trim();
        const productSynonyms = synonyms[productName] || [productName];

        // Check if any synonym appears in the order item name
        const synonymMatch = productSynonyms.some(syn =>
            normalized.includes(syn.toLowerCase())
        );

        if (synonymMatch) return product;
    }

    // Try variations - remove common prefixes/suffixes  
    const cleanedOrder = normalized
        .replace(/^عطر\s*/i, '')           // Remove "عطر" prefix
        .replace(/\s*الفاخر.*/i, '')       // Remove "الفاخر" and anything after
        .replace(/\s*من باريس.*/i, '')    // Remove "من باريس" and anything after
        .replace(/\s*للرجال.*/i, '')      // Remove "للرجال" and anything after
        .replace(/\s*للنساء.*/i, '')      // Remove "للنساء" and anything after
        .replace(/\s*\d+$/, '')            // Remove trailing numbers
        .replace(/\s*\/.*/, '')            // Remove everything after /
        .trim();

    if (cleanedOrder) {
        // Check against all synonyms
        for (const product of products) {
            const productName = product.name.toLowerCase().trim();
            const productSynonyms = synonyms[productName] || [productName];

            const synMatch = productSynonyms.some(syn =>
                cleanedOrder.includes(syn.toLowerCase()) || syn.toLowerCase().includes(cleanedOrder)
            );

            if (synMatch) return product;
        }
    }

    return null;
}

async function matchOrdersToProducts() {
    console.log('📂 Fetching products...');

    const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, name, price, image_url, tag_color')
        .eq('is_archived', false);

    if (productsError) {
        console.error('❌ Error fetching products:', productsError.message);
        return;
    }

    if (!products || products.length === 0) {
        console.log('⚠️ No products found! Please add products to the Products page first.');
        console.log('   Then run this script again to match orders.');
        return;
    }

    console.log(`✅ Found ${products.length} products:`);
    products.forEach(p => console.log(`   - ${p.name}`));

    console.log('\n📂 Fetching orders...');

    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_id, items');

    if (ordersError) {
        console.error('❌ Error fetching orders:', ordersError.message);
        return;
    }

    console.log(`✅ Found ${orders?.length || 0} orders`);

    let matchedCount = 0;
    let unmatchedCount = 0;
    const unmatched: string[] = [];

    console.log('\n🔗 Matching products to orders...\n');

    for (const order of orders || []) {
        // Parse items if string
        let items = order.items;
        if (typeof items === 'string') {
            try {
                items = JSON.parse(items);
            } catch {
                items = [];
            }
        }

        if (!items || !Array.isArray(items)) continue;

        let updated = false;
        const newItems = items.map((item: any) => {
            const match = matchProduct(item.name, products);
            if (match) {
                matchedCount++;
                updated = true;
                return {
                    ...item,
                    name: match.name,           // Use product name instead of Excel name
                    product_id: match.id,
                    image_url: match.image_url, // Add product image
                    tag_color: match.tag_color, // Add product tag color
                    // Keep original price from order, or use product price:
                    // price: match.price
                };
            } else {
                unmatchedCount++;
                if (!unmatched.includes(item.name)) {
                    unmatched.push(item.name);
                }
                return item;
            }
        });

        if (updated) {
            const { error: updateError } = await supabase
                .from('orders')
                .update({ items: newItems })
                .eq('id', order.id);

            if (updateError) {
                console.error(`❌ Error updating order ${order.order_id}:`, updateError.message);
            }
        }
    }

    console.log('\n📊 Matching Summary:');
    console.log(`   ✅ Matched: ${matchedCount} items`);
    console.log(`   ⚠️ Unmatched: ${unmatchedCount} items`);

    if (unmatched.length > 0) {
        console.log('\n📋 Unmatched product names (add these to Products page):');
        unmatched.forEach(name => console.log(`   - "${name}"`));
    }
}

matchOrdersToProducts().catch(console.error);
