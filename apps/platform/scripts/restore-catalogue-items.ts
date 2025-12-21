import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Mapping from Excel product names to catalogue names
const productMapping: Record<string, string> = {
    'برسيفيرون': 'بيرسيفيرون',
    'بيرسيفيرون': 'بيرسيفيرون',
    'عطر برسيفيرون': 'بيرسيفيرون',
    'عطر برسيفيرون الفاخر من باريس كورنر للرجال': 'بيرسيفيرون',
    'عطر برسيفيرون الفاخر': 'بيرسيفيرون',
    'فيوجن': 'فيوجن',
    'عطر فيوجن': 'فيوجن',
    'عطر فيوجن الفاخر للرجال والنساء': 'فيوجن',
    'خير فيوجن': 'فيوجن',
    'ايبسكو': 'ايبسكو',
    'ايدينتتي': 'ايدنتتي',
    'ايدنتتي': 'ايدنتتي',
    'عطر ادينتيتي': 'ايدنتتي',
    'رفقات': 'رفقات',
    'رفقات وايت': 'رفقات',
    'بستاشيو': 'بستاشيو',
    'فستق': 'بستاشيو',
};

// Normalize product name to catalogue name
function normalizeProductName(rawName: string): string {
    const trimmed = rawName.trim();

    // Direct match
    if (productMapping[trimmed]) {
        return productMapping[trimmed];
    }

    // Partial match
    for (const [key, value] of Object.entries(productMapping)) {
        if (trimmed.includes(key) || key.includes(trimmed)) {
            return value;
        }
    }

    // Fuzzy match for common patterns
    if (trimmed.includes('برسيفيرون') || trimmed.includes('بيرسيفيرون')) return 'بيرسيفيرون';
    if (trimmed.includes('فيوجن')) return 'فيوجن';
    if (trimmed.includes('ايبسكو')) return 'ايبسكو';
    if (trimmed.includes('ايدينتتي') || trimmed.includes('ادينتيتي') || trimmed.includes('ايدنتتي')) return 'ايدنتتي';
    if (trimmed.includes('رفقات')) return 'رفقات';
    if (trimmed.includes('فستق') || trimmed.includes('بستاشيو')) return 'بستاشيو';

    return trimmed; // Return original if no match
}

async function restoreItems() {
    console.log('📂 Loading products from database...');

    // Get all products with their data
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('*');

    if (prodError || !products) {
        console.error('Failed to load products:', prodError?.message);
        return;
    }

    console.log(`📦 Found ${products.length} products in catalogue`);

    // Create product lookup by name
    const productLookup = new Map<string, any>();
    products.forEach(p => {
        productLookup.set(p.name, p);
    });

    // Read Excel to find multi-item orders
    console.log('📂 Reading Excel file...');
    const workbook = XLSX.readFile('/Users/ali/Scheniders/Copy of طلبات شنايدر.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    // Find orders that have multiple items (contain / or +)
    const multiItemOrders = new Set<string>();
    rawData.forEach((row: any) => {
        const productName = row['اسم المنتج'] || '';
        if (productName.includes('/') || productName.includes('+')) {
            multiItemOrders.add(String(row['رقم الوصل']));
        }
    });

    console.log(`🔍 Found ${multiItemOrders.size} orders with multiple items in Excel`);

    // Get all orders from database
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_id, items, price');

    if (ordersError || !orders) {
        console.error('Failed to load orders:', ordersError?.message);
        return;
    }

    console.log(`📦 Found ${orders.length} orders in database`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
        const items = order.items || [];

        // Skip if items already have product_id (properly connected)
        if (items.length > 0 && items[0].product_id) {
            skippedCount++;
            continue;
        }

        // Check if this is a multi-item order from Excel
        const baseOrderId = order.order_id.replace(/^LF-/, '').split('-')[0];
        const isMultiItem = multiItemOrders.has(baseOrderId);

        // For multi-item orders, find the Excel row and parse items
        if (isMultiItem) {
            const excelRow = rawData.find((r: any) => String(r['رقم الوصل']) === baseOrderId) as any;
            if (excelRow) {
                const productName = excelRow['اسم المنتج'] || '';
                const totalPrice = Number(order.price) || 0;
                const quantity = Number(excelRow['الكمية']) || 1;

                // Split by / or +
                const productNames = productName.split(/[\/\+]/).map((p: string) => p.trim()).filter(Boolean);

                const newItems = productNames.map((name: string, idx: number) => {
                    const catalogueName = normalizeProductName(name);
                    const product = productLookup.get(catalogueName);

                    const itemPrice = Math.round(totalPrice / productNames.length);
                    const itemQuantity = idx === 0 ? quantity - (productNames.length - 1) : 1;

                    if (product) {
                        return {
                            name: catalogueName,
                            price: itemPrice,
                            quantity: Math.max(1, itemQuantity),
                            image_url: product.image_url,
                            tag_color: product.tag_color,
                            product_id: product.id
                        };
                    } else {
                        return {
                            name: catalogueName,
                            price: itemPrice,
                            quantity: Math.max(1, itemQuantity)
                        };
                    }
                });

                const { error } = await supabase
                    .from('orders')
                    .update({ items: newItems })
                    .eq('id', order.id);

                if (!error) {
                    fixedCount++;
                    console.log(`✅ Fixed multi-item order ${order.order_id}: ${newItems.map((i: any) => i.name).join(' + ')}`);
                }
            }
        } else {
            // Single item order - just map to catalogue
            if (items.length > 0) {
                const catalogueName = normalizeProductName(items[0].name);
                const product = productLookup.get(catalogueName);

                if (product) {
                    const newItem = {
                        name: catalogueName,
                        price: items[0].price,
                        quantity: items[0].quantity || 1,
                        image_url: product.image_url,
                        tag_color: product.tag_color,
                        product_id: product.id
                    };

                    const { error } = await supabase
                        .from('orders')
                        .update({ items: [newItem] })
                        .eq('id', order.id);

                    if (!error) {
                        fixedCount++;
                    }
                }
            }
        }
    }

    console.log('\n📊 Restore Summary:');
    console.log(`   ✅ Fixed: ${fixedCount}`);
    console.log(`   ⏭️ Already correct: ${skippedCount}`);
}

restoreItems().catch(console.error);
