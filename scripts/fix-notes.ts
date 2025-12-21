import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Wrong values that were imported as notes (these are confirmation statuses, not notes)
const wrongNotePatterns = [
    'تم التثبيت',
    'تم ارسال رسالة',
    'تم التصدير',
    '[ig]',
    '[fb]',
    'مكرر',
];

async function fixNotes() {
    console.log('📂 Reading updated Excel file...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/Copy of طلبات شنايدر.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${rawData.length} orders in Excel`);

    // Create a map of order IDs to their correct notes
    const correctNotes = new Map<string, string>();
    for (const row of rawData as any[]) {
        const orderId = String(row['رقم الوصل'] || '');
        const notes = row['ملاحظة']; // Column M - actual notes
        const address = row['العنوان'] || '';

        if (notes && String(notes).trim() !== '') {
            // Has actual notes - combine with address
            correctNotes.set(orderId, String(notes).trim() + (address ? ` | ${address}` : ''));
        } else {
            // No notes - just store address if available
            correctNotes.set(orderId, address ? `| ${address}` : '');
        }
    }

    // Get all orders from database
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_id, notes');

    if (ordersError || !orders) {
        console.error('Failed to load orders:', ordersError?.message);
        return;
    }

    console.log(`📦 Found ${orders.length} orders in database`);

    let fixedCount = 0;
    let clearedCount = 0;

    for (const order of orders) {
        // Extract base ID
        const match = order.order_id.match(/^(?:LF-)?([^-]+)/);
        const baseId = match ? match[1] : order.order_id;

        // Get correct notes from Excel
        const correctNote = correctNotes.get(baseId);

        // Check if current notes contain wrong values
        const currentNotes = order.notes || '';
        const hasWrongNote = wrongNotePatterns.some(pattern => currentNotes.includes(pattern));

        if (hasWrongNote || (correctNote !== undefined && currentNotes !== correctNote)) {
            // Update to correct value
            const newNotes = correctNote || '';

            const { error } = await supabase
                .from('orders')
                .update({ notes: newNotes })
                .eq('id', order.id);

            if (!error) {
                if (newNotes.startsWith('|') || newNotes === '') {
                    clearedCount++;
                } else {
                    fixedCount++;
                    console.log(`✅ Fixed notes for ${order.order_id}`);
                }
            }
        }
    }

    console.log('\n📊 Notes Fix Summary:');
    console.log(`   ✅ Fixed with correct notes: ${fixedCount}`);
    console.log(`   🧹 Cleared wrong notes: ${clearedCount}`);
}

fixNotes().catch(console.error);
