import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Flags to clear from notes
const FLAGS_TO_CLEAR = [
    '⚠️ RETURN',
    '⚠️ NEEDS CHECK',
    '⚠️ PRICE CHANGED',
    '⚠️ NEEDS REVIEW',
    'اعادة طلب',
    '[Delivery Import]',
];

async function clearAttentionFlags() {
    console.log('📂 Finding orders with attention flags...');

    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_id, notes, customer_name, price, items, status');

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} total orders`);

    let cleaned = 0;

    for (const order of orders || []) {
        if (!order.notes) continue;

        let cleanedNotes = order.notes;
        let wasModified = false;

        // Remove all attention flags
        for (const flag of FLAGS_TO_CLEAR) {
            if (cleanedNotes.includes(flag)) {
                cleanedNotes = cleanedNotes
                    .split('|')
                    .map((part: string) => part.trim())
                    .filter((part: string) => !FLAGS_TO_CLEAR.some(f => part.includes(f)))
                    .join(' | ')
                    .trim();
                wasModified = true;
            }
        }

        // Clean up formatting
        cleanedNotes = cleanedNotes
            .replace(/\s*\|\s*\|\s*/g, ' | ')
            .replace(/^\s*\|\s*/g, '')
            .replace(/\s*\|\s*$/g, '')
            .replace(/Shipment:\s*\d+\s*\|?\s*Notes:\s*/gi, '')
            .trim();

        // If only delivery import info remains, clear it
        if (cleanedNotes.match(/^\[?Delivery Import\]?\s*$/i) ||
            cleanedNotes.match(/^Shipment:\s*\d+$/i)) {
            cleanedNotes = '';
        }

        if (wasModified || cleanedNotes !== order.notes) {
            const { error: updateError } = await supabase
                .from('orders')
                .update({ notes: cleanedNotes || null })
                .eq('id', order.id);

            if (updateError) {
                console.error(`❌ Error updating ${order.order_id}:`, updateError.message);
            } else {
                cleaned++;
                console.log(`✅ Cleaned ${order.order_id}: "${cleanedNotes || '(cleared)'}"`);
            }
        }
    }

    console.log(`\n📊 Summary: Cleaned ${cleaned} orders`);
}

clearAttentionFlags().catch(console.error);
