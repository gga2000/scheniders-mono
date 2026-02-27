import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// We need to bypass RLS for a background cron job using the Service Role Key
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Reusable CSV Generator
function generateCsv(data: any[]): string {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    for (const row of data) {
        const values = headers.map(header => {
            const val = row[header];
            if (val === null || val === undefined) return '';
            // Escape quotes and wrap in quotes to handle commas/newlines
            const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
            return `"${stringVal.replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
}

export async function GET(request: Request) {
    // Check Authorization if a cron secret is set, to prevent unauthorized triggering
    const authHeader = request.headers.get('authorization');
    if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // 1. Fetch Orders (Max 50,000 via chunking to guarantee we get everything without timeout)
        let allOrders: any[] = [];
        let hasMoreOrders = true;
        let p = 0;
        while (hasMoreOrders) {
            const { data, error } = await supabase.from('orders').select('*').range(p * 1000, (p + 1) * 1000 - 1);
            if (error) throw error;
            if (data && data.length > 0) {
                allOrders = [...allOrders, ...data];
                p++;
            } else {
                hasMoreOrders = false;
            }
        }

        // 2. Fetch Customers
        let allCustomers: any[] = [];
        let hasMoreCustomers = true;
        let c = 0;
        while (hasMoreCustomers) {
            const { data, error } = await supabase.from('customers').select('*').range(c * 1000, (c + 1) * 1000 - 1);
            if (error) throw error;
            if (data && data.length > 0) {
                allCustomers = [...allCustomers, ...data];
                c++;
            } else {
                hasMoreCustomers = false;
            }
        }

        // 3. Fetch Products
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

    } catch (error: any) {
        console.error('Background Backup Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
