/**
 * What the vault is doing right now and which refusals it can raise, as data
 * rather than English sentences, so the page can show them in the user's language.
 */
export type VaultProgress =
    | { step: "fetching" | "encrypting" | "finalizing" | "excel" | "csv" | "security" | "syncing" }
    | { step: "restoring"; table: "customers" | "products" | "orders" | "extras"; count: number }
    | { step: "restoredOrders"; written: number; total: number };

export type VaultErrorCode =
    | "noStore"
    | "sessionExpired"
    | "passwordRequired"
    | "weakKey"
    | "fileTooLarge"
    | "invalidFile"
    | "wrongKey"
    | "damagedExcel"
    | "emptyExcel"
    | "unsupportedFormat";

/** A refusal the page can translate; anything else thrown is a server or network message shown as is. */
export class VaultError extends Error {
    constructor(readonly code: VaultErrorCode, message: string) {
        super(message);
        this.name = "VaultError";
    }
}
