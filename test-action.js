import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    const { data: originalOrder } = await supabase.from('orders').select('*').eq('id', 'e5c43097-187f-4c1b-93a7-e2d6f3ad0e93').single();

    const returnOrderData = {
        ...originalOrder,
        id: undefined,
        created_at: undefined,
        updated_at: undefined,
        order_id: undefined,
        items: [{ name: "Test Return Item", price: 10000, quantity: 1, sku: "TEST" }],
        price: 10000,
        discount_amount: 0,
        status: 'rejected',
        is_return: true,
        original_order_id: originalOrder.id,
        rejection_reason: 'Partial Return',
        notes: (originalOrder.notes || "") + `\n[Partial Return] Items returned from original order.`,
        internal_notes: `Split from order ${originalOrder.order_id}`,
        last_batch_id: undefined,
        delivery_order_id: undefined,
        sequence_number: undefined,
        delivered_at: undefined,
        cancelled_at: undefined,
        printed_at: undefined,
        print_count: 0,
    };

    const returnOrderDataAny = returnOrderData;
    delete returnOrderDataAny.id;
    delete returnOrderDataAny.created_at;
    delete returnOrderDataAny.updated_at;

    const now = new Date();
    const dateStr = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const { count, error: countError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfDay)
        .lt('created_at', endOfDay)
        .like('order_id', `4${dateStr}%`);

    const sequence = ((count || 0) + 1).toString().padStart(3, '0');
    const generatedOrderId = `4${dateStr}${sequence}`;

    const { data: maxSeqData } = await supabase
        .from('orders')
        .select('sequence_number')
        .not('sequence_number', 'is', null)
        .order('sequence_number', { ascending: false })
        .limit(1)
        .maybeSingle();

    const nextSequenceNumber = (maxSeqData?.sequence_number ?? 0) + 1;

    const fullOrderData = {
        ...returnOrderDataAny,
        order_id: generatedOrderId,
        sequence_number: nextSequenceNumber,
        status: returnOrderDataAny.status || "confirmed",
        priority: returnOrderDataAny.priority || "normal",
        payment_status: returnOrderDataAny.payment_status || "cod",
        is_return: returnOrderDataAny.is_return || false,
        is_archived: false,
    };

    const { data, error: insertError } = await supabase
        .from("orders")
        .insert([fullOrderData])
        .select()
        .single();

    if (insertError) {
        console.error("FAIL:", JSON.stringify(insertError, null, 2));
    } else {
        console.log("SUCCESS:", data.id);
    }
}
run();
