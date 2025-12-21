import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateNotes() {
    console.log('📂 Reading updated Excel file...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/Copy of طلبات شنايدر.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${rawData.length} orders in Excel`);

    // Get all orders from database
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_id');

    if (ordersError || !orders) {
        console.error('Failed to load orders:', ordersError?.message);
        return;
    }

    // Create lookup map
    const orderMap = new Map<string, any>();
    orders.forEach(order => {
        // Extract base ID from LF-XXXX-XXX format  
        const match = order.order_id.match(/^(?:LF-)?([^-]+)/);
        if (match) {
            const baseId = match[1];
            if (!orderMap.has(baseId)) {
                orderMap.set(baseId, []);
            }
            orderMap.get(baseId).push(order);
        }
        // Also add by full order_id for exact matches
        orderMap.set(order.order_id, [order]);
    });

    let updateCount = 0;
    let noNotesCount = 0;

    for (const row of rawData as any[]) {
        const baseOrderId = String(row['رقم الوصل'] || '');
        const notes = row['ملاحظة']; // Column M - actual notes
        const address = row['العنوان'] || '';

        // Only update if there are notes
        if (!notes || String(notes).trim() === '') {
            noNotesCount++;
            continue;
        }

        const noteStr = String(notes).trim();

        // Find matching orders
        const matchingOrders = orderMap.get(baseOrderId) || [];

        for (const order of matchingOrders) {
            // Update notes - combine with address for display
            const fullNotes = noteStr + (address ? ` | ${address}` : '');

            const { error } = await supabase
                .from('orders')
                .update({ notes: fullNotes })
                .eq('id', order.id);

            if (!error) {
                updateCount++;
                console.log(`✅ Updated notes for ${order.order_id}: "${noteStr}"`);
            } else {
                console.error(`❌ Failed to update ${order.order_id}:`, error.message);
            }
        }
    }

    console.log('\n📊 Notes Update Summary:');
    console.log(`   ✅ Updated: ${updateCount}`);
    console.log(`   ⏭️ No notes: ${noNotesCount}`);
}

updateNotes().catch(console.error);
