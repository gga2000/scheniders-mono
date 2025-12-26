import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Parse price that can be in various formats:
// - Plain number: 44750
// - Formatted: "د.ع 44,750"
// - Formatted with currency: "44,750 IQD"
function parsePrice(price: any): number {
    if (!price) return 0;
    if (typeof price === 'number') return price;

    const priceStr = String(price);
    // Remove Arabic currency symbols and commas
    const cleaned = priceStr
        .replace(/د\.ع/g, '')
        .replace(/IQD/gi, '')
        .replace(/,/g, '')
        .replace(/\s/g, '')
        .trim();

    const parsed = Number(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

async function fixAllPrices() {
    console.log('📂 Reading Excel file...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/تصليح طلبات.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelData = XLSX.utils.sheet_to_json(sheet) as any[];

    console.log(`📊 Found ${excelData.length} rows in Excel`);

    // Build lookup with parsed prices
    const priceLookup = new Map<string, number>();
    excelData.forEach((row: any) => {
        const orderId = String(row['رقم الوصل'] || '').trim();
        const price = parsePrice(row['سعر المنتج']);
        if (orderId) {
            priceLookup.set(orderId, price);
            console.log(`Excel: ${orderId} -> ${price} IQD`);
        }
    });

    console.log(`\n📋 Price lookup created for ${priceLookup.size} orders`);

    // Get all orders with 0 price
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_id, price')
        .eq('price', 0);

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} orders with 0 price`);

    let fixedCount = 0;

    for (const order of orders || []) {
        // Extract base ID from order_id
        // Formats: LF-5490-047 -> 5490, LF-10042-037 -> 10042
        let baseId: string | null = null;

        const lfMatch = order.order_id.match(/LF-(\d+)-\d+$/);
        if (lfMatch) {
            baseId = lfMatch[1];
        } else if (/^\d+$/.test(order.order_id)) {
            baseId = order.order_id;
        }

        if (baseId) {
            const price = priceLookup.get(baseId);
            if (price && price > 0) {
                const { error: updateError } = await supabase
                    .from('orders')
                    .update({ price })
                    .eq('id', order.id);

                if (updateError) {
                    console.error(`❌ Error updating ${order.order_id}:`, updateError.message);
                } else {
                    fixedCount++;
                    console.log(`✅ Fixed ${order.order_id} -> ${price} IQD`);
                }
            } else {
                console.log(`⚠️ No price found for ${order.order_id} (base: ${baseId})`);
            }
        }
    }

    console.log(`\n📊 Summary: Fixed ${fixedCount} order prices`);
}

fixAllPrices().catch(console.error);
