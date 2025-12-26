import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Supabase config
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

console.log('🔗 Connecting to Supabase:', supabaseUrl ? 'URL found' : 'URL missing');

const supabase = createClient(supabaseUrl, supabaseKey);

// Excel date serial to JS Date
function excelDateToJSDate(excelDate: number): Date {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + excelDate * millisecondsPerDay);
}

// Map Arabic status to app status
function mapStatus(arabicStatus: string): string {
    const statusMap: Record<string, string> = {
        'تم التثبيت': 'confirmed',
        'تم التثبيت ': 'confirmed',
        'تم التصدير': 'delivered',
        'تم ارسال رسالة': 'contacted',
        'تم ارسال رسالة ': 'contacted',
        'طلب من استفهام': 'new',
        'مكرر': 'rejected',
        'تصدير معدل': 'delivered',
        'بالطريق': 'in_transit',
        'جديد': 'new',
        'ملغي': 'cancelled',
        'مرفوض': 'rejected',
    };
    return statusMap[arabicStatus?.trim()] || 'new';
}

// Extract city from full address
function extractCity(address: string | number | undefined): string {
    if (!address) return 'بغداد';

    // Ensure address is a string
    const addressStr = String(address);

    const cityPatterns = [
        'بغداد', 'البصره', 'البصرة', 'كربلاء', 'الموصل', 'اربيل', 'أربيل',
        'السليمانية', 'ديالى', 'صلاح الدين', 'تكريت', 'النجف', 'واسط',
        'المثنى', 'ميسان', 'ذي قار', 'الناصرية', 'كركوك', 'الأنبار', 'الانبار',
        'بابل', 'الحلة', 'الكوت', 'العمارة', 'الديوانية', 'السماوة', 'الكفل'
    ];

    for (const city of cityPatterns) {
        if (addressStr.includes(city)) {
            return city;
        }
    }

    const firstPart = addressStr.split(/[-–\s]/)[0];
    return firstPart || 'بغداد';
}

// Format phone number
function formatPhone(phone: number | string | undefined): string {
    if (!phone) return '';
    let phoneStr = String(phone).replace(/\D/g, '');

    if (phoneStr.length === 10 && phoneStr.startsWith('7')) {
        phoneStr = '964' + phoneStr;
    }

    return '+' + phoneStr;
}

// Parse multiple items separated by `/` or `\`
function parseItems(productName: string, quantity: number, price: number): any[] {
    if (!productName) return [{ name: 'Unknown Product', quantity: 1, price }];

    const products = productName.split(/[\/\\]/).map(p => p.trim()).filter(Boolean);

    if (products.length <= 1) {
        return [{ name: productName.trim(), quantity, price }];
    }

    const pricePerItem = Math.round(price / products.length);
    const quantityPerItem = Math.max(1, Math.floor(quantity / products.length));

    return products.map((name, idx) => ({
        name: name.trim(),
        quantity: idx === 0 ? quantity - (quantityPerItem * (products.length - 1)) : quantityPerItem,
        price: idx === products.length - 1 ? price - (pricePerItem * (products.length - 1)) : pricePerItem
    }));
}

async function analyzeAndImport() {
    console.log('📂 Reading Excel file تصليح طلبات.xlsx...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/تصليح طلبات.xlsx');

    console.log('📋 Available sheets:', workbook.SheetNames);

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${rawData.length} rows in Excel`);

    // Show first row columns to understand structure
    if (rawData.length > 0) {
        console.log('\n📑 Column headers found:');
        console.log(Object.keys(rawData[0] as any).join('\n'));
        console.log('\n📦 Sample data (first 3 rows):');
        console.log(JSON.stringify(rawData.slice(0, 3), null, 2));
    }

    // Ask user if they want to continue with import
    console.log('\n🔄 Starting import process...');

    // Get existing orders to check for duplicates
    const { data: existingOrders, error: fetchError } = await supabase
        .from('orders')
        .select('order_id, phone');

    if (fetchError) {
        console.error('❌ Failed to fetch existing orders:', fetchError.message);
        return;
    }

    const existingOrderIds = new Set(existingOrders?.map(o => o.order_id) || []);
    const existingPhones = new Set(existingOrders?.map(o => o.phone) || []);

    console.log(`📦 Found ${existingOrders?.length || 0} existing orders in database`);

    // Transform data
    const orders: any[] = [];
    let duplicateCount = 0;

    for (let index = 0; index < rawData.length; index++) {
        const row: any = rawData[index];

        // Detect column names (handle variations)
        const baseOrderId = row['رقم الوصل'] || row['رقم الطلب'] || row['Order ID'] || '';
        const orderId = `LF-${String(baseOrderId || 'IMP')}-${String(index + 1).padStart(3, '0')}`;

        // Skip if this order ID pattern exists
        if (existingOrderIds.has(orderId)) {
            duplicateCount++;
            continue;
        }

        const dateValue = row['التاريخ'] || row['Date'];
        const createdAt = typeof dateValue === 'number'
            ? excelDateToJSDate(dateValue).toISOString()
            : new Date().toISOString();

        const productName = row['اسم المنتج'] || row['Product'] || 'Unknown Product';
        const quantity = Number(row['الكمية'] || row['Quantity']) || 1;
        const price = Number(row['سعر المنتج'] || row['Price'] || row['السعر']) || 0;
        const customerName = row['اسم الزبون'] || row['Customer Name'] || 'Unknown';
        const phone1 = row['رقم الهاتف الاول'] || row['رقم الهاتف'] || row['Phone'];
        const phone2 = row['رقم الهاتف الثاني'];
        // Use العنوان_1 for actual address (العنوان contains phone number duplicate in this file)
        const fullAddress = row['العنوان_1'] || row['العنوان'] || row['Address'] || '';
        const addressStr = String(fullAddress || '');
        const arabicStatus = row['حالة التجهيز'] || row['Status'] || 'new';
        const notes = String(row['ملاحظة'] || row['Notes'] || '');
        const source = row['مصدر'] || row['Source'] || '';
        const city = row['المحافظة'] || row['City'] || extractCity(addressStr);

        const formattedPhone = formatPhone(phone1 || phone2);

        // Parse items
        const items = parseItems(productName, quantity, price);

        orders.push({
            order_id: orderId,
            created_at: createdAt,
            customer_name: String(customerName).trim(),
            phone: formattedPhone,
            secondary_phone: phone2 ? formatPhone(phone2) : null,
            price: price,
            city: city,
            status: mapStatus(arabicStatus),
            items: items,
            notes: notes + (source ? ` [${source}]` : '') + (addressStr && !notes.includes(addressStr) ? ` | ${addressStr}` : ''),
            address_details: addressStr,
            payment_status: 'cod' as const,
            priority: 'normal' as const,
        });
    }

    console.log(`\n📊 Import Preview:`);
    console.log(`   📦 New orders to import: ${orders.length}`);
    console.log(`   ⏭️  Duplicates skipped: ${duplicateCount}`);

    if (orders.length === 0) {
        console.log('ℹ️  No new orders to import.');
        return;
    }

    // Insert in batches of 50
    const batchSize = 50;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < orders.length; i += batchSize) {
        const batch = orders.slice(i, i + batchSize);

        const { data, error } = await supabase
            .from('orders')
            .insert(batch);

        if (error) {
            console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
            errorCount += batch.length;
        } else {
            successCount += batch.length;
            console.log(`✅ Imported batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(orders.length / batchSize)}`);
        }
    }

    console.log('\n📊 Import Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📦 Total processed: ${orders.length}`);
}

// Run the import
analyzeAndImport().catch(console.error);
