import { NextResponse } from 'next/server';
import { requireCronAuth } from "@/lib/cron-auth";
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { autoBackupFoldersToPrune } from '@/lib/vault-retention';

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
    tableName: string,
    tenantId: string,
    orderBy: string
): Promise<any[]> {
    let allRows: any[] = [];
    let hasMore = true;
    let pageIndex = 0;
    let retryCount = 0;

    while (hasMore) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('tenant_id', tenantId)
            .order(orderBy, { ascending: true })
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

/**
 * Deletes this store's automated folders beyond the retention window. A failure
 * is logged, not thrown: the new backup is already written, and the next run
 * retries the prune.
 */
async function pruneOldBackups(supabase: { storage: SupabaseClient['storage'] }, tenantId: string): Promise<void> {
    const { data: entries, error } = await supabase.storage.from('vault_backups').list(tenantId, { limit: 1000 });
    if (error) {
        console.error(`[Cron:Backup] ${tenantId} prune list failed:`, describeError(error));
        return;
    }
    for (const folder of autoBackupFoldersToPrune((entries ?? []).map((entry) => entry.name))) {
        const { data: files, error: listError } = await supabase.storage.from('vault_backups').list(`${tenantId}/${folder}`);
        if (listError) {
            console.error(`[Cron:Backup] ${tenantId}/${folder} prune list failed:`, describeError(listError));
            continue;
        }
        const paths = (files ?? []).map((file) => `${tenantId}/${folder}/${file.name}`);
        const { error: removeError } = await supabase.storage.from('vault_backups').remove(paths);
        if (removeError) console.error(`[Cron:Backup] ${tenantId}/${folder} prune failed:`, describeError(removeError));
    }
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
        // derived, and `mv_customer_metrics` is what the app itself reads.
        const DATASETS = [
            { file: 'orders.csv', source: 'orders', orderBy: 'id' },
            { file: 'customers.csv', source: 'mv_customer_metrics', orderBy: 'customer_phone' },
            { file: 'products.csv', source: 'products', orderBy: 'id' },
        ] as const;

        const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id');
        if (tenantsError) throw tenantsError;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const saved: Record<string, number> = {};
        const failures: { file: string; reason: string }[] = [];

        // One folder per store, one table at a time: a store's backup holds only
        // its own rows, and one bad source or store does not stop the rest.
        for (const { id: tenantId } of tenants ?? []) {
            const folderName = `${tenantId}/auto_csv_${timestamp}`;
            const storeSaved: Record<string, number> = {};
            const storeFailures: { file: string; reason: string }[] = [];

            for (const { file, source, orderBy } of DATASETS) {
                try {
                    const rows = await fetchAllInBatches(supabase, source, tenantId, orderBy);
                    const { error } = await supabase.storage
                        .from('vault_backups')
                        .upload(`${folderName}/${file}`, generateCsv(rows), {
                            contentType: 'text/csv',
                            upsert: true,
                        });
                    if (error) throw error;
                    storeSaved[file] = rows.length;
                    saved[`${tenantId}/${file}`] = rows.length;
                } catch (err) {
                    const reason = describeError(err);
                    console.error(`[Cron:Backup] ${tenantId}/${file} failed:`, reason);
                    storeFailures.push({ file, reason });
                    failures.push({ file: `${tenantId}/${file}`, reason });
                }
            }

            await pruneOldBackups(supabase, tenantId);

            // Written even on a partial run, so "when did a backup last work, and
            // what was in it" is answerable per store from the audit trail.
            await supabase.from('security_logs').insert({
                action: 'automated_csv_backup',
                user_id: null,
                tenant_id: tenantId,
                details: {
                    folder: folderName,
                    files: Object.keys(storeSaved),
                    counts: storeSaved,
                    failures: storeFailures,
                },
            });
        }

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
            message: `Automated CSV backup completed for ${(tenants ?? []).length} store(s).`,
            saved,
        });

    } catch (error: unknown) {
        console.error('Background Backup Error:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Backup failed" }, { status: 500 });
    }
}
