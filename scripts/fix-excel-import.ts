import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Supabase config
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

console.log('🔗 Connecting to Supabase:', supabaseUrl ? 'URL found' : 'URL missing');

const supabase = createClient(supabaseUrl, supabaseKey);

// Format phone number to standard format
function formatPhone(phone: number | string | undefined): string {
    if (!phone) return '';
    let phoneStr = String(phone).replace(/\D/g, '');

    // Add Iraq country code if missing
    if (phoneStr.length === 10 && phoneStr.startsWith('7')) {
        phoneStr = '964' + phoneStr;
    }

    return '+' + phoneStr;
}

// Parse multiple items separated by `/` or `\`
function parseItems(productName: string, quantity: number, price: number): any[] {
    if (!productName) return [{ name: 'Unknown Product', quantity: 1, price }];

    // Split by / or \ (common separators in the Excel)
    const products = productName.split(/[\/\\]/).map(p => p.trim()).filter(Boolean);

    if (products.length <= 1) {
        // Single product
        return [{ name: productName.trim(), quantity, price }];
    }

    // Multiple products - distribute quantity and price
    const pricePerItem = Math.round(price / products.length);
    const quantityPerItem = Math.max(1, Math.floor(quantity / products.length));

    return products.map((name, idx) => ({
        name: name.trim(),
        quantity: idx === 0 ? quantity - (quantityPerItem * (products.length - 1)) : quantityPerItem,
        price: idx === products.length - 1 ? price - (pricePerItem * (products.length - 1)) : pricePerItem
    }));
}

// Combine notes fields
function combineNotes(note1: string | undefined, note2: string | undefined, source: string | undefined, address: string | undefined): string {
    const parts: string[] = [];

    if (note1 && note1.trim()) parts.push(note1.trim());
    if (note2 && note2.trim()) parts.push(note2.trim());
    if (source && source.trim()) parts.push(`[${source.trim()}]`);
    if (address && address.trim()) parts.push(`| ${address.trim()}`);

    return parts.join(' ');
}

async function updateOrdersFromExcel() {
    console.log('📂 Reading Excel file...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/Copy of طلبات شنايدر.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${rawData.length} orders in Excel`);

    // Get existing orders from database
    const { data: existingOrders, error: fetchError } = await supabase
        .from('orders')
        .select('id, order_id, phone');

    if (fetchError) {
        console.error('❌ Failed to fetch existing orders:', fetchError.message);
        return;
    }

    console.log(`📦 Found ${existingOrders?.length || 0} orders in database`);

    // Create a map for quick lookup by order_id pattern
    const orderMap = new Map<string, any>();
    existingOrders?.forEach(order => {
        // Extract the base order ID from LF-XXXX-XXX format
        const match = order.order_id.match(/LF-(.+?)-\d{3}$/);
        if (match) {
            const baseId = match[1];
            if (!orderMap.has(baseId)) {
                orderMap.set(baseId, []);
            }
            orderMap.get(baseId).push(order);
        }
    });

    let updateCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rawData.length; i++) {
        const row: any = rawData[i];

        const baseOrderId = String(row['رقم الوصل'] || '');
        const phone1 = row['رقم الهاتف الاول'];
        const phone2 = row['رقم الهاتف الثاني'];
        const productName = row['اسم المنتج'] || '';
        const quantity = Number(row['الكمية']) || 1;
        const price = Number(row['سعر المنتج']) || 0;
        const note1 = row['ملاحظة'];
        const note2 = row['ملاحظة.1'];
        const source = row['مصدر'];
        const fullAddress = row['العنوان'] || '';

        // Find matching orders in database
        const ordersToUpdate = orderMap.get(baseOrderId) || [];

        if (ordersToUpdate.length === 0) {
            // Try to match by phone number
            const formattedPhone1 = formatPhone(phone1);
            const matchingByPhone = existingOrders?.filter(o => o.phone === formattedPhone1) || [];
            ordersToUpdate.push(...matchingByPhone.slice(0, 1)); // Only take first match
        }

        for (const order of ordersToUpdate) {
            // Prepare update data
            const updates: any = {};

            // Add secondary phone if available and different from primary
            const formattedPhone2 = formatPhone(phone2);
            if (formattedPhone2 && formattedPhone2 !== formatPhone(phone1)) {
                updates.secondary_phone = formattedPhone2;
            }

            // Parse and update items
            const items = parseItems(productName, quantity, price);
            if (items.length > 0) {
                updates.items = items;
            }

            // Combine notes
            const combinedNotes = combineNotes(note1, note2, source, fullAddress);
            if (combinedNotes) {
                updates.notes = combinedNotes;
            }

            // Update address_details
            if (fullAddress) {
                updates.address_details = fullAddress;
            }

            // Only update if there's something to update
            if (Object.keys(updates).length > 0) {
                const { error } = await supabase
                    .from('orders')
                    .update(updates)
                    .eq('id', order.id);

                if (error) {
                    console.error(`❌ Failed to update order ${order.order_id}:`, error.message);
                    errorCount++;
                } else {
                    updateCount++;
                    if (updateCount % 10 === 0) {
                        console.log(`✅ Updated ${updateCount} orders...`);
                    }
                }
            }
        }
    }

    console.log('\n📊 Update Summary:');
    console.log(`   ✅ Updated: ${updateCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
}

// Run the update
updateOrdersFromExcel().catch(console.error);
