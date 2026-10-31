export const VAULT_BUCKET = "vault_backups";

/** Roles that may use the Data Vault (export, cloud copies, restore). */
export const VAULT_ADMIN_ROLES: readonly string[] = ["admin", "super_admin"];

export const VAULT_AUDIT_ACTIONS = [
    "VAULT_EXPORT",
    "VAULT_CLOUD_SYNC",
    "VAULT_CLOUD_DOWNLOAD",
    "VAULT_RESTORE",
    "VAULT_CLOUD_DELETE",
] as const;

const CLOUD_VAULT_FILENAME = /^sync_[0-9A-Za-z-]+\.scheniders$/;

/** Only files this feature wrote: a name from the client can never reach another folder. */
export function isCloudVaultFilename(name: string): boolean {
    return CLOUD_VAULT_FILENAME.test(name);
}

export function cloudVaultPath(tenantId: string, filename: string): string {
    return `${tenantId}/${filename}`;
}

/** Manual cloud copies a store may hold; admins free space by deleting old copies from the page. */
export const MAX_CLOUD_VAULTS = 30;

/** Shortest vault key accepted: the key is the only thing protecting a file that holds every customer's details. */
export const MIN_VAULT_KEY_LENGTH = 10;

export function isVaultKeyLongEnough(key: string): boolean {
    return key.length >= MIN_VAULT_KEY_LENGTH;
}

/** Largest file the restore will read: it is decrypted and parsed in the browser, so a huge file would freeze the tab. */
export const MAX_RESTORE_FILE_BYTES = 100 * 1024 * 1024;
