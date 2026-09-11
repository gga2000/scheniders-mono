import { NextResponse } from 'next/server';
import { requireCronAuth } from "@/lib/cron-auth";
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

/**
 * A readable reason for a failed dataset.
 *
 * PostgREST errors arrive as plain objects, not Errors, so `String(err)` on one
 * produced "[object Object]" — which is what a future incident would have had to
 * be diagnosed from. Prefer the message, and keep the code that names the cause
 * (PGRST205 = the relation does not exist, which is this bug's own signature).
 */
function describeError(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
        const e = err as { message?: unknown; code?: unknown; hint?: unknown };
        const parts = [
            typeof e.code === 'string' ? `[${e.code}]` : null,
            typeof e.message === 'string' ? e.message : null,
            typeof e.hint === 'string' ? `(${e.hint})` : null,
        ].filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
        try { return JSON.stringify(err); } catch { return 'Unserializable error' }
    }
    return String(err);
}

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
    const denied = requireCronAuth(request);
    if (denied) return denied;

    try {
        if (!serviceRoleKey) {
            return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
        }
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // `customers` is not a table and never has been — the customer record is
        // derived, and `mv_customer_aggregates` is what the app itself reads.
        // Backing up a name that does not exist threw PGRST205 on every run.
        const DATASETS = [
            { file: 'orders.csv', source: 'orders' },
            { file: 'customers.csv', source: 'mv_customer_aggregates' },
            { file: 'products.csv', source: 'products' },
        ] as const;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const folderName = `auto_csv_${timestamp}`;

        const saved: Record<string, number> = {};
        const failures: { file: string; reason: string }[] = [];

        // Each dataset stands alone. Previously all three were fetched before
        // anything was uploaded, so one bad source meant nothing was written at
        // all — the reason this bucket is empty rather than merely incomplete.
        for (const { file, source } of DATASETS) {
            try {
                const rows = await fetchAllInBatches(supabase, source);
                const { error } = await supabase.storage
                    .from('vault_backups')
                    .upload(`${folderName}/${file}`, generateCsv(rows), {
                        contentType: 'text/csv',
                        upsert: true,
                    });
                if (error) throw error;
                saved[file] = rows.length;
            } catch (err) {
                // Not swallowed: recorded, logged, and turned into a non-200
                // below. Continuing means the datasets that ARE readable still
                // get written instead of being lost with the broken one.
                const reason = describeError(err);
                console.error(`[Cron:Backup] ${file} failed:`, reason);
                failures.push({ file, reason });
            }
        }

        // Written even on a partial run, so "when did a backup last work, and
        // what was in it" is answerable from the audit trail rather than by
        // listing the bucket.
        await supabase.from('security_logs').insert({
            action: 'automated_csv_backup',
            user_id: null,
            details: {
                folder: folderName,
                files: Object.keys(saved),
                counts: saved,
                failures,
            },
        });

        if (failures.length > 0) {
            // A partial backup must not report success — a green cron over a
            // half-written backup is how this went unnoticed for months.
            return NextResponse.json({
                success: false,
                partial: Object.keys(saved).length > 0,
                message: `Backup incomplete: ${failures.map(f => f.file).join(', ')} failed`,
                saved,
                failures,
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: `Automated CSV backup completed. Saved ${saved['orders.csv'] ?? 0} orders.`,
            saved,
        });

    } catch (error: unknown) {
        console.error('Background Backup Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Backup failed" }, { status: 500 });
    }
}
