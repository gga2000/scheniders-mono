import { supabase } from "@/lib/supabase";
import { encryptVaultData, decryptVaultData } from "./crypto-utils";
import * as XLSX from "xlsx";

export type ExportFormat = "vault" | "excel" | "csv";

export interface VaultMetadata {
    version: string;
    timestamp: string;
    counts: {
        orders: number;
        products: number;
        customers: number;
    };
}

export interface VaultData {
    metadata: VaultMetadata;
    data: {
        orders: any[];
        products: any[];
        customers: any[];
    };
}

export interface VaultBackupOptions {
    includeOrders: boolean;
    includeProducts: boolean;
    includeCustomers: boolean;
}

/**
 * Fetches data from Supabase in chunks of 1000 to bypass API limits and scale to massive datasets.
 */
async function fetchTableData(tableName: string) {
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    let keepFetching = true;

    while (keepFetching) {
        const { data, error } = await supabase
            .from(tableName)
            .select("*")
            .range(from, from + step - 1);

        if (error) throw new Error(`Failed to fetch ${tableName}: ${error.message}`);

        if (data && data.length > 0) {
            allData = [...allData, ...data];
            from += step;
        } else {
            keepFetching = false;
        }
    }
    return allData;
}

/**
 * Orchestrates fetching all requested core data.
 */
async function fetchAllData(options: VaultBackupOptions, onProgress?: (msg: string) => void): Promise<VaultData> {
    if (onProgress) onProgress("Fetching Database...");

    const [orders, products, customers] = await Promise.all([
        options.includeOrders ? fetchTableData("orders") : Promise.resolve([]),
        options.includeProducts ? fetchTableData("products") : Promise.resolve([]),
        options.includeCustomers ? fetchTableData("customer_metadata") : Promise.resolve([])
    ]);

    return {
        metadata: {
            version: "1.0.0",
            timestamp: new Date().toISOString(),
            counts: {
                orders: orders.length,
                products: products.length,
                customers: customers.length,
            }
        },
        data: {
            orders,
            products,
            customers
        }
    };
}

/**
 * Generates the backup in the specified format and triggers a browser download.
 */
export async function generateVaultBackup(
    format: ExportFormat,
    password?: string,
    options?: VaultBackupOptions,
    onProgress?: (msg: string) => void
): Promise<void> {
    const opts = options || { includeOrders: true, includeProducts: true, includeCustomers: true };
    const vaultData = await fetchAllData(opts, onProgress);
    const timestamp = new Date().toISOString().split("T")[0];

    if (format === "vault") {
        if (!password) throw new Error("Password required for encrypted vault export");

        if (onProgress) onProgress("Encrypting with Vault Key...");
        const blob = await encryptVaultData(vaultData, password);

        if (onProgress) onProgress("Finalizing Download...");
        downloadBlob(blob, `scheniders_vault_${timestamp}.scheniders`);
    } else if (format === "excel") {
        if (onProgress) onProgress("Compressing Excel Workbook...");
        exportToExcel(vaultData, `scheniders_backup_${timestamp}.xlsx`);
    } else if (format === "csv") {
        if (onProgress) onProgress("Generating CSV Formats...");
        exportToCSV(vaultData, `scheniders_backup_${timestamp}`);
    }
}

/**
 * Helper to download a Blob object in the browser
 */
function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Exports data to an Excel file with multiple sheets
 */
function exportToExcel(vaultData: VaultData, filename: string) {
    const wb = XLSX.utils.book_new();

    // Orders Sheet
    const wsOrders = XLSX.utils.json_to_sheet(vaultData.data.orders.map(order => ({
        ...order,
        items: order.items ? JSON.stringify(order.items) : "[]",
        risk_metadata: order.risk_metadata ? JSON.stringify(order.risk_metadata) : "{}"
    })));
    XLSX.utils.book_append_sheet(wb, wsOrders, "Orders");

    // Products Sheet
    const wsProducts = XLSX.utils.json_to_sheet(vaultData.data.products);
    XLSX.utils.book_append_sheet(wb, wsProducts, "Products");

    // Customers Sheet
    const wsCustomers = XLSX.utils.json_to_sheet(vaultData.data.customers);
    XLSX.utils.book_append_sheet(wb, wsCustomers, "Customers");

    // Write file
    XLSX.writeFile(wb, filename);
}

/**
 * Exports data to CSV logic. We will put them in a zip, or trigger multiple downloads.
 * Multiple downloads is easier without adding JSZip dependency.
 */
function exportToCSV(vaultData: VaultData, prefix: string) {
    const wsOrders = XLSX.utils.json_to_sheet(vaultData.data.orders.map(order => ({
        ...order,
        items: order.items ? JSON.stringify(order.items) : "[]"
    })));
    const wsProducts = XLSX.utils.json_to_sheet(vaultData.data.products);
    const wsCustomers = XLSX.utils.json_to_sheet(vaultData.data.customers);

    // Export each as CSV
    const csvOrders = XLSX.utils.sheet_to_csv(wsOrders);
    const csvProducts = XLSX.utils.sheet_to_csv(wsProducts);
    const csvCustomers = XLSX.utils.sheet_to_csv(wsCustomers);

    downloadBlob(new Blob(["\ufeff" + csvOrders], { type: "text/csv;charset=utf-8;" }), `${prefix}_orders.csv`);

    setTimeout(() => {
        downloadBlob(new Blob(["\ufeff" + csvProducts], { type: "text/csv;charset=utf-8;" }), `${prefix}_products.csv`);
    }, 300);

    setTimeout(() => {
        downloadBlob(new Blob(["\ufeff" + csvCustomers], { type: "text/csv;charset=utf-8;" }), `${prefix}_customers.csv`);
    }, 600);
}

/**
 * Parses and decrypts a .scheniders vault file
 */
export async function parseVaultFile(file: File, password?: string): Promise<VaultData> {
    if (file.name.endsWith(".scheniders")) {
        if (!password) throw new Error("Vault Key required to unlock this file");
        const decryptedData = await decryptVaultData(file, password);

        // Basic validation
        if (!decryptedData || !decryptedData.metadata || !decryptedData.data) {
            throw new Error("Invalid vault file structure");
        }
        return decryptedData as VaultData;
    } else if (file.name.endsWith(".xlsx")) {
        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: "array" });

        const ordersRaw = wb.Sheets["Orders"] ? XLSX.utils.sheet_to_json(wb.Sheets["Orders"]) : [];
        const productsRaw = wb.Sheets["Products"] ? XLSX.utils.sheet_to_json(wb.Sheets["Products"]) : [];
        const customersRaw = wb.Sheets["Customers"] ? XLSX.utils.sheet_to_json(wb.Sheets["Customers"]) : [];

        // Parse JSON strings back to objects where needed
        const parsedOrders = ordersRaw.map((o: any) => ({
            ...o,
            items: typeof o.items === "string" ? JSON.parse(o.items) : (o.items || []),
            risk_metadata: typeof o.risk_metadata === "string" ? JSON.parse(o.risk_metadata) : (o.risk_metadata || {})
        }));

        const isNotEmpty = parsedOrders.length > 0 || productsRaw.length > 0 || customersRaw.length > 0;
        if (!isNotEmpty) {
             throw new Error("Excel file doesn't contain valid backup sheets (Orders, Products, Customers).");
        }

        return {
            metadata: {
                version: "1.0.0",
                timestamp: new Date().toISOString(),
                counts: {
                    orders: parsedOrders.length,
                    products: productsRaw.length,
                    customers: customersRaw.length
                }
            },
            data: {
                orders: parsedOrders,
                products: productsRaw as any[],
                customers: customersRaw as any[]
            }
        };
    } else {
        throw new Error("Unsupported file format for restore. Please use a .scheniders or .xlsx file.");
    }
}

/**
 * Calculates a summary diff between a backup and live data (dry-run).
 */
export async function calculateVaultDiff(parsedVault: VaultData) {
    // A simplified visual diff for the user interface
    return {
        ordersToRestore: parsedVault.data.orders?.length || 0,
        productsToRestore: parsedVault.data.products?.length || 0,
        customersToRestore: parsedVault.data.customers?.length || 0,
        timestamp: parsedVault.metadata.timestamp,
        version: parsedVault.metadata.version
    };
}

/**
 * -------------------------------------------------------------
 * PHASE 2: CORE ENGINE UPSERTS & CLOUD STORAGE 
 * -------------------------------------------------------------
 */

/**
 * Executes a safe, destructive bulk upsert of the parsed vault data back into Supabase.
 * Order matters because of foreign keys (Customers -> Products -> Orders).
 */
export async function executeVaultRestore(vaultData: VaultData, onProgress?: (msg: string) => void): Promise<void> {
    try {
        let { customers, products, orders } = vaultData.data;

        if (onProgress) onProgress("Initializing security context...");
        const { data: tenantId, error: tenantError } = await supabase.rpc('get_current_tenant_id');

        if (!tenantError && tenantId) {
            // Inject the active tenant_id into all records to satisfy strict Row Level Security
            // This is required especially for Excel file uploads or legacy backups.
            const injectTenant = (items: any[]) => items?.map(item => ({ ...item, tenant_id: tenantId })) || [];
            customers = injectTenant(customers);
            products = injectTenant(products);
            orders = injectTenant(orders);
        }

        // 1. Restore Customers
        if (customers && customers.length > 0) {
            if (onProgress) onProgress(`Restoring ${customers.length} Customers...`);
            const { error: customerError } = await supabase
                .from('customer_metadata')
                .upsert(customers, { onConflict: 'customer_phone' });
            if (customerError) throw new Error(`Customers Restore Failed: ${customerError.message}`);
        }

        // 2. Restore Products 
        if (products && products.length > 0) {
            if (onProgress) onProgress(`Restoring ${products.length} Products...`);
            const { error: productError } = await supabase
                .from('products')
                .upsert(products, { onConflict: 'id' });
            if (productError) throw new Error(`Products Restore Failed: ${productError.message}`);
        }

        // 3. Restore Orders (Dependent on Products)
        if (orders && orders.length > 0) {
            if (onProgress) onProgress(`Restoring ${orders.length} Orders...`);
            const { error: orderError } = await supabase
                .from('orders')
                .upsert(orders, { onConflict: 'id' });
            if (orderError) throw new Error(`Orders Restore Failed: ${orderError.message}`);
        }

        // Log the security event
        await supabase.from('security_logs').insert([{
            action: 'VAULT_RESTORE',
            details: vaultData.metadata.counts,
            tenant_id: typeof tenantId === 'string' ? tenantId : undefined
        }]);

    } catch (e: any) {
        throw new Error(e.message || "An unexpected error occurred during database restoration.");
    }
}

/**
 * Encrypts and uploads the Vault directly to the secure Cloud Bucket (Time Machine Sync)
 */
export async function uploadVaultToCloud(password: string, options?: VaultBackupOptions, onProgress?: (msg: string) => void): Promise<void> {
    const opts = options || { includeOrders: true, includeProducts: true, includeCustomers: true };
    const vaultData = await fetchAllData(opts, onProgress);

    if (onProgress) onProgress("Encrypting payload...");
    const encryptedBlob = await encryptVaultData(vaultData, password);

    if (onProgress) onProgress("Syncing to Secure Cloud...");
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `sync_${timestamp}.scheniders`;

    const { error: uploadError } = await supabase.storage
        .from('vault_backups')
        .upload(filename, encryptedBlob, { contentType: 'application/octet-stream' });

    if (uploadError) throw new Error(`Cloud Sync Failed: ${uploadError.message}`);

    // Log the sync event
    await supabase.from('security_logs').insert([{
        action: 'VAULT_CLOUD_SYNC',
        details: { filename, counts: vaultData.metadata.counts }
    }]);
}

/**
 * Fetches the list of all historical Vault Backups stashed in the private cloud bucket.
 */
export async function fetchCloudVaults() {
    const { data, error } = await supabase.storage.from('vault_backups').list('', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
    });

    if (error) throw new Error(`Could not fetch cloud backups: ${error.message}`);
    return data || [];
}

/**
 * Downloads a specific cloud vault file as a Blob so it can be parsed and restored.
 */
export async function downloadCloudVault(filename: string): Promise<Blob> {
    const { data, error } = await supabase.storage.from('vault_backups').download(filename);
    if (error) throw new Error(`Failed to download ${filename}: ${error.message}`);
    return data as Blob;
}
