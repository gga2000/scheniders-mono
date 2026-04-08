
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from current directory + .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    console.log('Tried loading form .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugRisk(phone: string) {
    console.log(`\n--- Debugging Phone: ${phone} ---`);

    // 1. Normalize Phone (Client Side for comparison)
    const normalized = phone.replace(/\D/g, '').replace(/^964/, '').replace(/^0/, '');
    console.log(`Normalized (Client): ${normalized}`);

    // 2. Fetch Customer Risk
    const { data: riskData, error: riskError } = await supabase
        .from('customer_risk')
        .select('*')
        .eq('phone', normalized)
        .single();

    if (riskError) {
        console.error('Error fetching customer_risk:', riskError.message);
    } else {
        console.log('Customer Risk Record:', JSON.stringify(riskData, null, 2));
    }

    // 3. Fetch All Orders for this phone
    console.log(`Fetching orders for phone like %${normalized}%...`);
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_id, status, phone, created_at')
        // We search closely for the phone
        .or(`phone.ilike.%${normalized}%,secondary_phone.ilike.%${normalized}%`)
        .order('created_at', { ascending: false });

    if (ordersError) {
        console.error('Error fetching orders:', ordersError.message);
    } else {
        console.log(`Found ${orders?.length} orders matching *${normalized}*:`);
        orders?.forEach(o => {
            console.log(`- #${o.order_id}: Status='${o.status}' Phone='${o.phone}' Date=${o.created_at}`);
        });
    }
}

// Phones from screenshot
const phones = ['07812346938', '07806449780'];

async function run() {
    for (const p of phones) {
        await debugRisk(p);
    }
}

run();
