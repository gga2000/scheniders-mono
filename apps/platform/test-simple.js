import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    const { data: originalOrder, error: err } = await supabase.from('orders').select('*').eq('id', 'e5c43097-187f-4c1b-93a7-e2d6f3ad0e93').single();

    if (err || !originalOrder) {
        console.error("Fetch failed", err);
        return;
    }

    const returnOrderData = {
        ...originalOrder,
        id: undefined,
        created_at: undefined,
        updated_at: undefined,
        order_id: String(Math.floor(Math.random() * 1000000000)), // dummy
        items: [{ name: 'Test', price: 10000, quantity: 1, sku: 'TEST' }],
        status: 'rejected',
        is_return: true,
        original_order_id: originalOrder.id,
        rejection_reason: 'Partial Return'
    };

    delete returnOrderData.id;
    delete returnOrderData.created_at;
    delete returnOrderData.updated_at;

    const { data, error } = await supabase.from('orders').insert(returnOrderData).select();

    if (error) {
        console.error("Simple insert failed:", JSON.stringify(error, null, 2));
    } else {
        console.log("Success! ID:", data[0].id);
    }
}
run();
