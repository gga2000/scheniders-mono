
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrders() {
    console.log('Checking orders...');

    // IDs from the user's screenshot
    const originalOrderId = '1260217009';
    const returnOrderId = '1260217011';

    // Fetch Original Order
    const { data: original, error: origError } = await supabase
        .from('orders')
        .select('*')
        .eq('order_id', originalOrderId)
        .single();

    if (origError) {
        console.error('Error fetching original order:', origError.message);
    } else {
        console.log('\n--- Original Order ---');
        console.log(`ID: ${original.id}`);
        console.log(`Order ID: ${original.order_id}`);
        console.log(`Status: ${original.status}`);
        console.log(`Is Return: ${original.is_return}`);
        console.log(`Items:`, JSON.stringify(original.items, null, 2));
        console.log(`Updated At: ${original.updated_at}`);
    }

    // Fetch Return Order
    const { data: returnOrder, error: returnError } = await supabase
        .from('orders')
        .select('*')
        .eq('order_id', returnOrderId)
        .single();

    if (returnError) {
        console.error('Error fetching return order:', returnError.message);

        // Try finding by original_order_id if direct fetch fails
        if (original) {
            console.log('\nAttempting to find by original_order_id...');
            const { data: linkedOrders, error: linkError } = await supabase
                .from('orders')
                .select('*')
                .eq('original_order_id', original.id);

            if (linkError) {
                console.error('Error fetching linked orders:', linkError.message);
            } else {
                console.log(`Found ${linkedOrders.length} linked orders.`);
                linkedOrders.forEach(o => {
                    console.log(`- Order ID: ${o.order_id}, Status: ${o.status}, Is Return: ${o.is_return}`);
                });
            }
        }
    } else {
        console.log('\n--- Return Order ---');
        console.log(`ID: ${returnOrder.id}`);
        console.log(`Order ID: ${returnOrder.order_id}`);
        console.log(`Status: ${returnOrder.status}`);
        console.log(`Is Return: ${returnOrder.is_return}`);
        console.log(`Original Order ID: ${returnOrder.original_order_id}`);
        console.log(`Items:`, JSON.stringify(returnOrder.items, null, 2));
    }
}

checkOrders();
