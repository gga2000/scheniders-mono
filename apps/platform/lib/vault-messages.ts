import { VaultError } from "./vault-progress";
import type { VaultProgress } from "./vault-progress";

type Translate = (key: string, fallback: string, vars?: Record<string, string | number>) => string;

/** The sentence for a progress step, in the user's language. */
export function describeVaultProgress(progress: VaultProgress, t: Translate): string {
    switch (progress.step) {
        case "fetching": return t("vault.progress.fetching", "Fetching database...");
        case "encrypting": return t("vault.progress.encrypting", "Encrypting with your vault key...");
        case "finalizing": return t("vault.progress.finalizing", "Finalizing download...");
        case "excel": return t("vault.progress.excel", "Building the Excel workbook...");
        case "csv": return t("vault.progress.csv", "Generating CSV files...");
        case "security": return t("vault.progress.security", "Checking your store...");
        case "syncing": return t("vault.progress.syncing", "Syncing to the secure cloud...");
        case "restoring": return t(`vault.progress.restoring.${progress.table}`, RESTORING_FALLBACKS[progress.table], { count: progress.count });
        case "restoredOrders": return t("vault.progress.restoredOrders", "Restored {written} of {total} orders...", { written: progress.written, total: progress.total });
    }
}

const RESTORING_FALLBACKS = {
    customers: "Restoring {count} customers...",
    products: "Restoring {count} products...",
    orders: "Restoring {count} orders...",
} as const;

const ERROR_FALLBACKS = {
    noStore: "Could not confirm which store you are working in. Reload and try again.",
    sessionExpired: "Your session has expired. Sign in again.",
    passwordRequired: "A vault key is required for this file.",
    invalidFile: "This is not a valid vault file.",
    wrongKey: "Failed to unlock the vault. Wrong key or damaged file.",
    damagedExcel: "The Excel file has a damaged Items or Risk column and cannot be restored.",
    emptyExcel: "The Excel file has no Orders, Products or Customers sheet.",
    unsupportedFormat: "Unsupported file. Use a .scheniders or .xlsx file.",
} as const;

/** A user-facing message for anything thrown by the vault; server and network messages pass through. */
export function describeVaultError(error: unknown, t: Translate, fallback: string): string {
    if (error instanceof VaultError) return t(`vault.error.${error.code}`, ERROR_FALLBACKS[error.code]);
    return error instanceof Error ? error.message : fallback;
}
