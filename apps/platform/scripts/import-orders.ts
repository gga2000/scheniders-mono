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
    // Excel dates are days since 1900-01-01 (with a bug where 1900 is treated as leap year)
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
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
    };
    return statusMap[arabicStatus?.trim()] || 'new';
}

// Extract city from full address
function extractCity(address: string): string {
    if (!address) return 'بغداد';

    const cityPatterns = [
        'بغداد', 'البصره', 'البصرة', 'كربلاء', 'الموصل', 'اربيل', 'أربيل',
        'السليمانية', 'ديالى', 'صلاح الدين', 'تكريت', 'النجف', 'واسط',
        'المثنى', 'ميسان', 'ذي قار', 'الناصرية', 'كركوك', 'الأنبار', 'الانبار'
    ];

    for (const city of cityPatterns) {
        if (address.includes(city)) {
            return city;
        }
    }

    // Return first part before dash or space
    const firstPart = address.split(/[-–\s]/)[0];
    return firstPart || 'بغداد';
}

// Format phone number
function formatPhone(phone: number | string): string {
    let phoneStr = String(phone).replace(/\D/g, '');

    // Add Iraq country code if missing
    if (phoneStr.length === 10 && phoneStr.startsWith('7')) {
        phoneStr = '964' + phoneStr;
    }

    return '+' + phoneStr;
}

async function importOrders() {
    console.log('📂 Reading Excel file...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/resources/excel_imports/Copy of طلبات شنايدر.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📊 Found ${rawData.length} orders in Excel`);

    // Transform data
    const orders = rawData.map((row: any, index: number) => {
        // Make order_id unique by appending index
        const baseOrderId = row['رقم الوصل'] || 'IMP';
        const orderId = `LF-${String(baseOrderId)}-${String(index + 1).padStart(3, '0')}`;
        const dateValue = row['التاريخ'];
        const createdAt = typeof dateValue === 'number'
            ? excelDateToJSDate(dateValue).toISOString()
            : new Date().toISOString();

        const productName = row['اسم المنتج'] || 'Unknown Product';
        const quantity = Number(row['الكمية']) || 1;
        const price = Number(row['سعر المنتج']) || 0;
        const customerName = row['اسم الزبون'] || 'Unknown';
        const phone1 = row['رقم الهاتف الاول'];
        const phone2 = row['رقم الهاتف الثاني'];
        const fullAddress = row['العنوان'] || '';
        const arabicStatus = row['حالة التجهيز'] || 'new';
        const notes = row['ملاحظة'] || '';
        const source = row['مصدر'] || '';

        return {
            order_id: orderId,
            created_at: createdAt,
            customer_name: customerName.trim(),
            phone: formatPhone(phone1 || phone2),
            price: price,
            city: extractCity(fullAddress),
            status: mapStatus(arabicStatus),
            items: JSON.stringify([{
                name: productName.trim(),
                quantity: quantity,
                price: price
            }]),
            notes: notes + (source ? ` [${source}]` : '') + (fullAddress ? ` | ${fullAddress}` : ''),
            payment_status: 'cod' as const,
            priority: 'normal' as const,
        };
    });

    console.log('📤 Importing orders to Supabase...');

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
    console.log(`   📦 Total: ${orders.length}`);
}

// Run the import
importOrders().catch(console.error);
