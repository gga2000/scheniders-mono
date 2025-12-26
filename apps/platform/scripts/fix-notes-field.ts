import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Format phone for matching
function formatPhone(phone: number | string | undefined): string {
    if (!phone) return '';
    let phoneStr = String(phone).replace(/\D/g, '');
    if (phoneStr.length === 10 && phoneStr.startsWith('7')) {
        phoneStr = '964' + phoneStr;
    }
    return '+' + phoneStr;
}

async function fixNotes() {
    console.log('📂 Reading Excel file for original notes...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/تصليح طلبات.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelData = XLSX.utils.sheet_to_json(sheet) as any[];

    console.log(`📊 Found ${excelData.length} rows in Excel`);

    // Build lookup by order ID (رقم الوصل)
    const excelLookup = new Map<string, { notes: string; address: string }>();
    excelData.forEach((row: any) => {
        const orderId = String(row['رقم الوصل'] || '').trim();
        // ملاحظة is the actual notes field
        const notes = String(row['ملاحظة'] || '').trim();
        // العنوان_1 is the address - should NOT be in notes
        const address = String(row['العنوان_1'] || '').trim();

        if (orderId) {
            excelLookup.set(orderId, { notes, address });
        }
    });

    console.log(`📋 Created lookup for ${excelLookup.size} orders`);

    // Get all LF- orders that might have been affected
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_id, notes, address_details')
        .like('order_id', 'LF-%');

    if (error) {
        console.error('❌ Error fetching orders:', error.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} orders with LF- prefix`);

    let fixedCount = 0;

    for (const order of orders || []) {
        // Extract base ID: LF-5458-001 -> 5458
        const match = order.order_id.match(/LF-(.+?)-\d{3}$/);
        if (!match) continue;

        const baseId = match[1];
        const excelRow = excelLookup.get(baseId);

        if (excelRow) {
            const updates: any = {};

            // Set notes to only the actual notes (without address)
            if (excelRow.notes !== order.notes) {
                updates.notes = excelRow.notes || null;
            }

            // Make sure address_details has the address
            if (excelRow.address && excelRow.address !== order.address_details) {
                updates.address_details = excelRow.address;
            }

            if (Object.keys(updates).length > 0) {
                const { error: updateError } = await supabase
                    .from('orders')
                    .update(updates)
                    .eq('id', order.id);

                if (updateError) {
                    console.error(`❌ Error updating ${order.order_id}:`, updateError.message);
                } else {
                    fixedCount++;
                    console.log(`✅ Fixed ${order.order_id}`);
                    if (updates.notes !== undefined) {
                        console.log(`   Notes: "${updates.notes || '(empty)'}"`);
                    }
                    if (updates.address_details) {
                        console.log(`   Address: "${updates.address_details}"`);
                    }
                }
            }
        }
    }

    console.log(`\n📊 Summary: Fixed notes on ${fixedCount} orders`);
}

fixNotes().catch(console.error);
