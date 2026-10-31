import { supabase } from "@/lib/supabase";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";
import { PRODUCT_READ_COLUMNS } from "@/lib/repositories/product-columns";
import { productRepository } from "@/lib/repositories/product-repository";
import { restoreOrderRows } from "@/lib/backup-utils";
import { encryptVaultData, decryptVaultData } from "./crypto-utils";
import {
    listCloudVaultsAction,
    prepareCloudUploadAction,
    getCloudDownloadUrlAction,
    logVaultEventAction,
    type CloudVaultEntry,
} from "@/app/actions/vault";
import { VAULT_BUCKET } from "./vault-paths";
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
 *
 * `columns` defaults to every column; `orders` must pass ORDER_READ_COLUMNS
 * and `products` PRODUCT_READ_COLUMNS, because a signed-in caller holds no
 * SELECT on their margin / cost columns and a `*` read of either table is
 * refused (migrations 20261021090000, 20261031004000).
 */
async function fetchTableData(tableName: string, tenantId: string, orderBy: string, columns = "*") {
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    let keepFetching = true;

    while (keepFetching) {
        const { data, error } = await supabase
            .from(tableName)
            .select(columns)
            .eq("tenant_id", tenantId)
            .order(orderBy, { ascending: true })
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

/** Products with the cost this member may see (product_costs), for the active store. */
async function fetchProductsWithCost(tenantId: string) {
    const products = await fetchTableData("products", tenantId, "id", PRODUCT_READ_COLUMNS);
    const costs = await productRepository.getProductCosts(tenantId);
    return products.map((p) => ({ ...p, cost: costs.get(p.id) ?? null }));
}

/**
 * The active store, from the server's view of the caller. Export and restore
 * both refuse to run without it: an export would read every store the user
 * belongs to, and a restore would write rows carrying whatever tenant the file says.
 */
async function requireTenantId(): Promise<string> {
    const { data, error } = await supabase.rpc("get_current_tenant_id");
    if (error || typeof data !== "string" || !data) {
        throw new Error("Could not confirm which store you are working in. Reload and try again.");
    }
    return data;
}

async function requireAccessToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your session has expired. Sign in again.");
    return session.access_token;
}

/** Audit entry; a failure to log is reported, not hidden, but never undoes the finished action. */
async function recordVaultEvent(action: "VAULT_EXPORT" | "VAULT_CLOUD_SYNC" | "VAULT_CLOUD_DOWNLOAD" | "VAULT_RESTORE", details: Record<string, string | number | boolean>) {
    const result = await logVaultEventAction(await requireAccessToken(), { action, details });
    if (!result.success) console.error("[vault] audit entry not recorded:", result.error);
}

/**
 * Orchestrates fetching all requested core data.
 */
async function fetchAllData(options: VaultBackupOptions, onProgress?: (msg: string) => void): Promise<VaultData> {
    if (onProgress) onProgress("Fetching Database...");

    const tenantId = await requireTenantId();
    const [orders, products, customers] = await Promise.all([
        options.includeOrders ? fetchTableData("orders", tenantId, "id", ORDER_READ_COLUMNS) : Promise.resolve([]),
        options.includeProducts ? fetchProductsWithCost(tenantId) : Promise.resolve([]),
        options.includeCustomers ? fetchTableData("customer_metadata", tenantId, "customer_phone") : Promise.resolve([])
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
    await recordVaultEvent("VAULT_EXPORT", { format, ...vaultData.metadata.counts });

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
                if (onProgress) onProgress("Initializing security context...");
        const tenantId = await requireTenantId();

        // Every row is written into the active store whatever the file says
        // (Excel files and legacy backups carry none, or another store's).
        const injectTenant = (items: Record<string, unknown>[] | undefined) =>
            items?.map(item => ({ ...item, tenant_id: tenantId })) ?? [];
        const customers = injectTenant(vaultData.data.customers);
        const products = injectTenant(vaultData.data.products);
        const orders = injectTenant(vaultData.data.orders);

        // 1. Restore Customers
        if (customers && customers.length > 0) {
            if (onProgress) onProgress(`Restoring ${customers.length} Customers...`);
            const { error: customerError } = await supabase
                .from('customer_metadata')
                .upsert(customers, { onConflict: 'customer_phone,tenant_id' });
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
            try {
                await restoreOrderRows(orders, (written, total) => onProgress?.(`Restored ${written} of ${total} Orders...`));
            } catch (orderError) {
                throw new Error(`Orders Restore Failed: ${orderError instanceof Error ? orderError.message : String(orderError)}`);
            }
        }

        await recordVaultEvent("VAULT_RESTORE", {
            orders: orders.length,
            products: products.length,
            customers: customers.length,
        });
    } catch (e: unknown) {
        throw new Error(e instanceof Error ? e.message : "An unexpected error occurred during database restoration.");
    }
}

/**
 * Encrypts in the browser, then uploads straight to the caller's own folder.
 * The server only hands out a one-shot upload slot; it never sees the key.
 */
export async function uploadVaultToCloud(password: string, options?: VaultBackupOptions, onProgress?: (msg: string) => void): Promise<void> {
    const opts = options || { includeOrders: true, includeProducts: true, includeCustomers: true };
    const vaultData = await fetchAllData(opts, onProgress);

    if (onProgress) onProgress("Encrypting payload...");
    const encryptedBlob = await encryptVaultData(vaultData, password);

    if (onProgress) onProgress("Syncing to Secure Cloud...");
    const slot = await prepareCloudUploadAction(await requireAccessToken());
    if (!slot.success) throw new Error(`Cloud Sync Failed: ${slot.error}`);

    const { error: uploadError } = await supabase.storage
        .from(VAULT_BUCKET)
        .uploadToSignedUrl(slot.path, slot.token, encryptedBlob, { contentType: "application/octet-stream" });
    if (uploadError) throw new Error(`Cloud Sync Failed: ${uploadError.message}`);

    await recordVaultEvent("VAULT_CLOUD_SYNC", { file: slot.path.split("/").pop() ?? "", ...vaultData.metadata.counts });
}

/** The caller's cloud backups, newest first. */
export async function fetchCloudVaults(): Promise<CloudVaultEntry[]> {
    const result = await listCloudVaultsAction(await requireAccessToken());
    if (!result.success) throw new Error(result.error);
    return result.vaults;
}

/** Downloads one of the caller's cloud backups so it can be unlocked and restored. */
export async function downloadCloudVault(filename: string): Promise<Blob> {
    const result = await getCloudDownloadUrlAction(await requireAccessToken(), filename);
    if (!result.success) throw new Error(result.error);

    const response = await fetch(result.url);
    if (!response.ok) throw new Error(`Failed to download ${filename}`);
    await recordVaultEvent("VAULT_CLOUD_DOWNLOAD", { file: filename });
    return response.blob();
}
