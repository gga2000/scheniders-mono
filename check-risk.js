const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRisk() {
    const phone = '07721117414'; // customer phone from image
    const normalizedPhone = phone.replace(/^0+/, ''); // simplify depending on normalize_phone
    console.log("Checking for phone:", phone, "and normalized:", normalizedPhone);

    // Check orders
    const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('id, status, created_at, phone')
        .eq('phone', phone);

    console.log("Orders Error:", ordersErr);
    console.log("Orders Data:", orders);

    // Check risk
    const { data: risk, error: riskErr } = await supabase
        .from('customer_risk')
        .select('*');
    // .eq('phone', '7721117414'); // check all to ensure we find it if normalization differs

    console.log("Risk Error:", riskErr);
    const matchingRisk = risk?.filter(r => r.phone.includes('7721117414'));
    console.log("Matching Risk Data:", matchingRisk);

    // Check the view
    const { data: viewData, error: viewErr } = await supabase
        .from('v_orders_with_risk')
        .select('id, risk_data')
        .eq('phone', phone);

    console.log("View Error:", viewErr);
    console.log("View Data:", JSON.stringify(viewData, null, 2));
}

checkRisk();
