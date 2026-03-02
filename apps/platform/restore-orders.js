const ExcelJS = require('exceljs');
const fs = require('fs');

// Load env
const envFile = fs.readFileSync('/Users/ali/Scheniders/.env.local', 'utf8');
const urlMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=([^\n]+)/);
const keyMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\n]+)/);
const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

// Fields that should be parsed as JSON
const JSON_FIELDS = ['items', 'risk_metadata'];
// Fields that are arrays (stored as PostgreSQL text[])
const ARRAY_FIELDS = ['address_issues', 'attention_reasons'];
// Fields that should be boolean
const BOOL_FIELDS = ['is_return', 'is_archived', 'is_pinned', 'is_gift', 'is_shop_order', 'needs_attention', 'is_reviewed', 'is_verified_customer'];
// Fields that should be numeric
const NUMERIC_FIELDS = ['price', 'delivery_fee', 'discount_amount', 'delivery_cost', 'print_count', 'contact_count', 'sequence_number', 'version'];

async function restore() {
    // 1. Load deleted IDs
    const deletedIds = JSON.parse(fs.readFileSync('/tmp/deleted_order_ids.json', 'utf8'));
    const idSet = new Set(deletedIds);
    console.log(`Loaded ${deletedIds.length} deleted order IDs to restore.`);

    // 2. Read old Excel backup
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('/Users/ali/Scheniders/scheniders_backup_2026-02-28.xlsx');
    const worksheet = workbook.worksheets[0];

    // 3. Extract headers
    const headers = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value?.toString();
    });
    console.log(`Found ${headers.filter(Boolean).length} columns:`, headers.filter(Boolean).join(', '));

    // 4. Find the 'id' column index
    const idColIdx = headers.findIndex(h => h === 'id');
    if (idColIdx === -1) {
        console.error('ERROR: Could not find "id" column in headers!');
        process.exit(1);
    }

    // 5. Extract rows matching deleted IDs
    const ordersToRestore = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header

        const rowId = row.getCell(idColIdx).value?.toString();
        if (rowId && idSet.has(rowId)) {
            const order = {};
            headers.forEach((header, colIdx) => {
                if (!header) return;
                let value = row.getCell(colIdx).value;

                // Handle ExcelJS rich text / objects
                if (value && typeof value === 'object' && value.text) {
                    value = value.text;
                }
                if (value && typeof value === 'object' && value.result !== undefined) {
                    value = value.result;
                }

                // Convert to string for processing (except null/undefined)
                if (value === null || value === undefined || value === '') {
                    order[header] = null;
                    return;
                }

                const strValue = value.toString();

                // Parse JSON fields
                if (JSON_FIELDS.includes(header)) {
                    try {
                        order[header] = JSON.parse(strValue);
                    } catch {
                        order[header] = strValue;
                    }
                    return;
                }

                // Parse array fields
                if (ARRAY_FIELDS.includes(header)) {
                    try {
                        order[header] = JSON.parse(strValue);
                    } catch {
                        // Could be PostgreSQL array format {val1,val2}
                        if (strValue.startsWith('{') && strValue.endsWith('}')) {
                            order[header] = strValue.slice(1, -1).split(',').map(s => s.trim());
                        } else {
                            order[header] = null;
                        }
                    }
                    return;
                }

                // Parse boolean fields
                if (BOOL_FIELDS.includes(header)) {
                    order[header] = strValue === 'true' || strValue === '1' || strValue === 'TRUE';
                    return;
                }

                // Parse numeric fields
                if (NUMERIC_FIELDS.includes(header)) {
                    const num = Number(strValue);
                    order[header] = isNaN(num) ? null : num;
                    return;
                }

                // Handle dates (keep as-is, they should be ISO strings)
                if (header.endsWith('_at') || header === 'scheduled_date') {
                    // ExcelJS may return Date objects
                    if (value instanceof Date) {
                        order[header] = value.toISOString();
                    } else {
                        order[header] = strValue;
                    }
                    return;
                }

                // Default: string
                order[header] = strValue;
            });

            ordersToRestore.push(order);
        }
    });

    console.log(`Found ${ordersToRestore.length} orders in Excel matching deleted IDs.`);

    if (ordersToRestore.length === 0) {
        console.log('No orders to restore. Exiting.');
        return;
    }

    // Show status breakdown
    const statusCounts = {};
    ordersToRestore.forEach(o => {
        statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });
    console.log('Status breakdown:', statusCounts);

    // 6. Upsert in batches of 20
    const BATCH_SIZE = 20;
    let totalInserted = 0;
    let errors = [];

    for (let i = 0; i < ordersToRestore.length; i += BATCH_SIZE) {
        const batch = ordersToRestore.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(ordersToRestore.length / BATCH_SIZE);

        try {
            const res = await fetch(`${url}/rest/v1/orders`, {
                method: 'POST',
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates',
                },
                body: JSON.stringify(batch),
            });

            if (!res.ok) {
                const errorText = await res.text();
                console.error(`Batch ${batchNum}/${totalBatches} FAILED (${res.status}):`, errorText);
                errors.push({ batch: batchNum, status: res.status, error: errorText });
            } else {
                totalInserted += batch.length;
                console.log(`Batch ${batchNum}/${totalBatches}: ${batch.length} orders upserted successfully.`);
            }
        } catch (err) {
            console.error(`Batch ${batchNum}/${totalBatches} network error:`, err.message);
            errors.push({ batch: batchNum, error: err.message });
        }
    }

    console.log(`\n=== RESTORE COMPLETE ===`);
    console.log(`Successfully restored: ${totalInserted}/${ordersToRestore.length} orders`);
    if (errors.length > 0) {
        console.log(`Errors: ${errors.length} batches failed`);
        console.log(JSON.stringify(errors, null, 2));
    }

    // 7. Verify
    console.log('\nVerifying...');
    const verifyRes = await fetch(
        `${url}/rest/v1/orders?select=id,status&id=in.(${deletedIds.join(',')})`,
        {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
            },
        }
    );
    const verifyData = await verifyRes.json();
    const verifyCounts = {};
    verifyData.forEach(o => {
        verifyCounts[o.status] = (verifyCounts[o.status] || 0) + 1;
    });
    console.log(`Verified: ${verifyData.length}/${deletedIds.length} orders now exist in DB`);
    console.log('Status distribution:', verifyCounts);

    // Total count
    const countRes = await fetch(
        `${url}/rest/v1/orders?select=id&limit=1`,
        {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Prefer': 'count=exact',
            },
        }
    );
    const totalCount = countRes.headers.get('content-range');
    console.log(`Total orders in DB: ${totalCount}`);
}

restore().catch(console.error);
