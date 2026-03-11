import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// We need to bypass RLS for a background cron job using the Service Role Key
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
    console.error('[Cron:Backup] SUPABASE_SERVICE_ROLE_KEY is not configured — backup cron will not function');
}

const BATCH_CHUNK_SIZE = 1000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Reusable CSV Generator
function generateCsv(data: any[]): string {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    for (const row of data) {
        const values = headers.map(header => {
            const cellValue = row[header];
            if (cellValue === null || cellValue === undefined) return '';
            const stringValue = typeof cellValue === 'object' ? JSON.stringify(cellValue) : String(cellValue);
            return `"${stringValue.replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
}

// Fetches all rows from a table using chunked pagination with retry logic
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllInBatches(
    supabase: any,
    tableName: string
): Promise<any[]> {
    let allRows: any[] = [];
    let hasMore = true;
    let pageIndex = 0;
    let retryCount = 0;

    while (hasMore) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(pageIndex * BATCH_CHUNK_SIZE, (pageIndex + 1) * BATCH_CHUNK_SIZE - 1);

        if (error) {
            if (retryCount < MAX_RETRY_ATTEMPTS) {
                console.warn(`Retry ${retryCount + 1} for ${tableName} chunk ${pageIndex}`);
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * retryCount));
                continue;
            }
            throw error;
        }

        retryCount = 0;
        if (data && data.length > 0) {
            allRows = [...allRows, ...data];
            pageIndex++;
        } else {
            hasMore = false;
        }
    }

    return allRows;
}

export async function GET(request: Request) {
    // Check Authorization if a cron secret is set, to prevent unauthorized triggering
    const authHeader = request.headers.get('authorization');
    if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        if (!serviceRoleKey) {
            return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
        }
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // Fetch all data using chunked pagination with retry
        const allOrders = await fetchAllInBatches(supabase, 'orders');
        const allCustomers = await fetchAllInBatches(supabase, 'customers');

        const { data: allProducts, error: prodErr } = await supabase.from('products').select('*');
        if (prodErr) throw prodErr;

        // 4. Convert to CSV
        const ordersCsv = generateCsv(allOrders);
        const customersCsv = generateCsv(allCustomers);
        const productsCsv = generateCsv(allProducts || []);

        // 5. Upload to `vault_backups` storage bucket
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const folderName = `auto_csv_${timestamp}`;

        async function uploadCsv(filename: string, content: string) {
            const path = `${folderName}/${filename}`;
            const { error } = await supabase.storage.from('vault_backups').upload(path, content, {
                contentType: 'text/csv',
                upsert: true
            });
            if (error) throw error;
        }

        await uploadCsv('orders.csv', ordersCsv);
        await uploadCsv('customers.csv', customersCsv);
        await uploadCsv('products.csv', productsCsv);

        // 6. Log the automated backup event
        await supabase.from('security_logs').insert({
            action: 'automated_csv_backup',
            user_id: null,
            details: {
                files: ['orders.csv', 'customers.csv', 'products.csv'],
                counts: {
                    orders: allOrders.length,
                    customers: allCustomers.length,
                    products: (allProducts || []).length
                }
            }
        });

        return NextResponse.json({
            success: true,
            message: `Automated CSV backup completed. Saved ${allOrders.length} orders.`
        });

    } catch (error: unknown) {
        console.error('Background Backup Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Backup failed" }, { status: 500 });
    }
}
