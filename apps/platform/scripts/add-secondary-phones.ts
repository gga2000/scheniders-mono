import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// Load environment variables from .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Format phone number
function formatPhone(phone: number | string): string {
    if (!phone) return '';
    let phoneStr = String(phone).replace(/\D/g, '');
    if (phoneStr.length === 10 && phoneStr.startsWith('7')) {
        phoneStr = '964' + phoneStr;
    }
    return '+' + phoneStr;
}

async function addSecondaryPhones() {
    console.log('📂 Reading Excel file to extract secondary phone numbers...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/Copy of طلبات شنايدر.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${rawData.length} rows in Excel`);

    // Build a map of phone1 -> phone2
    const phoneMap: Record<string, string> = {};

    rawData.forEach((row: any) => {
        const phone1 = row['رقم الهاتف الاول'];
        const phone2 = row['رقم الهاتف الثاني'];

        if (phone1 && phone2) {
            const formattedPhone1 = formatPhone(phone1);
            const formattedPhone2 = formatPhone(phone2);

            if (formattedPhone1 && formattedPhone2 && formattedPhone1 !== formattedPhone2) {
                phoneMap[formattedPhone1] = formattedPhone2;
            }
        }
    });

    console.log(`📱 Found ${Object.keys(phoneMap).length} customers with secondary phones`);

    // Fetch all orders
    const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select('id, phone, secondary_phone')
        .is('secondary_phone', null);

    if (fetchError) {
        console.error('❌ Error fetching orders:', fetchError.message);
        return;
    }

    console.log(`📦 Found ${orders?.length || 0} orders without secondary phone`);

    // Update orders with secondary phones
    let updateCount = 0;
    for (const order of orders || []) {
        const secondaryPhone = phoneMap[order.phone];
        if (secondaryPhone) {
            const { error: updateError } = await supabase
                .from('orders')
                .update({ secondary_phone: secondaryPhone })
                .eq('id', order.id);

            if (!updateError) {
                updateCount++;
            }
        }
    }

    console.log(`\n✅ Updated ${updateCount} orders with secondary phone numbers`);
}

addSecondaryPhones().catch(console.error);
