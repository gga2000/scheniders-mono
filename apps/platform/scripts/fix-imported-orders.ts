import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

console.log('🔗 Connecting to Supabase:', supabaseUrl ? 'URL found' : 'URL missing');

const supabase = createClient(supabaseUrl, supabaseKey);

// Format phone number for matching
function formatPhone(phone: number | string | undefined): string {
    if (!phone) return '';
    let phoneStr = String(phone).replace(/\D/g, '');

    if (phoneStr.length === 10 && phoneStr.startsWith('7')) {
        phoneStr = '964' + phoneStr;
    }

    return '+' + phoneStr;
}

async function fixImportedOrders() {
    console.log('📂 Reading Excel file for price data...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/تصليح طلبات.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelData = XLSX.utils.sheet_to_json(sheet) as any[];

    console.log(`📊 Found ${excelData.length} rows in Excel`);

    // Create a lookup map by phone number and رقم الوصل for price data
    const excelLookup = new Map<string, { price: number; orderId: string }>();
    excelData.forEach((row: any) => {
        const phone = formatPhone(row['رقم الهاتف الاول']);
        const price = Number(row['سعر المنتج']) || 0;
        const orderId = String(row['رقم الوصل'] || '');
        if (phone && price > 0) {
            excelLookup.set(phone, { price, orderId });
        }
    });

    console.log(`📋 Created price lookup for ${excelLookup.size} phone numbers`);

    // Get all orders that need fixing (imported orders with LF- prefix and low/zero price)
    const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select('id, order_id, phone, price, sequence_number')
        .order('created_at', { ascending: true });

    if (fetchError) {
        console.error('❌ Error fetching orders:', fetchError.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} orders in database`);

    // Find the max sequence number
    const maxSeq = Math.max(0, ...(orders || []).map(o => o.sequence_number || 0));
    console.log(`🔢 Current max sequence number: ${maxSeq}`);

    // Find orders that need fixing (LF- prefix imported orders)
    const ordersToFix = (orders || []).filter(o =>
        o.order_id?.startsWith('LF-') &&
        (!o.sequence_number || o.price === 0 || o.price === null)
    );

    console.log(`🔧 Found ${ordersToFix.length} imported orders needing fixes`);

    if (ordersToFix.length === 0) {
        console.log('✅ No orders need fixing!');
        return;
    }

    let nextSeqNum = maxSeq + 1;
    let fixedCount = 0;
    let priceFixedCount = 0;
    let seqFixedCount = 0;

    for (const order of ordersToFix) {
        const updates: any = {};

        // Fix sequence number if missing
        if (!order.sequence_number) {
            updates.sequence_number = nextSeqNum;
            nextSeqNum++;
            seqFixedCount++;
        }

        // Fix price if zero or null
        if (order.price === 0 || order.price === null) {
            const excelRow = excelLookup.get(order.phone);
            if (excelRow && excelRow.price > 0) {
                updates.price = excelRow.price;
                priceFixedCount++;
            }
        }

        // Generate proper order_id based on the sequence number
        const seqNum = updates.sequence_number || order.sequence_number;
        if (order.order_id?.startsWith('LF-')) {
            // Keep the order_id but we'll display with sequence_number
            // The order_id format SYYMMDD### is for new orders
            // For imported orders, we just ensure sequence_number is set
        }

        if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
                .from('orders')
                .update(updates)
                .eq('id', order.id);

            if (updateError) {
                console.error(`❌ Error updating order ${order.order_id}:`, updateError.message);
            } else {
                fixedCount++;
                if (fixedCount % 10 === 0) {
                    console.log(`✅ Fixed ${fixedCount} orders...`);
                }
            }
        }
    }

    console.log('\n📊 Fix Summary:');
    console.log(`   ✅ Total orders fixed: ${fixedCount}`);
    console.log(`   🔢 Sequence numbers assigned: ${seqFixedCount}`);
    console.log(`   💰 Prices updated: ${priceFixedCount}`);
    console.log(`   📦 Next sequence number: ${nextSeqNum}`);
}

fixImportedOrders().catch(console.error);
