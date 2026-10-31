export const VAULT_BUCKET = "vault_backups";

/** Roles that may use the Data Vault (export, cloud copies, restore). */
export const VAULT_ADMIN_ROLES: readonly string[] = ["admin", "super_admin"];

export const VAULT_AUDIT_ACTIONS = [
    "VAULT_EXPORT",
    "VAULT_CLOUD_SYNC",
    "VAULT_CLOUD_DOWNLOAD",
    "VAULT_RESTORE",
] as const;

const CLOUD_VAULT_FILENAME = /^sync_[0-9A-Za-z-]+\.scheniders$/;

/** Only files this feature wrote: a name from the client can never reach another folder. */
export function isCloudVaultFilename(name: string): boolean {
    return CLOUD_VAULT_FILENAME.test(name);
}

export function cloudVaultPath(tenantId: string, filename: string): string {
    return `${tenantId}/${filename}`;
}

/** Manual cloud copies a store may hold; the user deletes none from the UI, so the cap stops unbounded growth. */
export const MAX_CLOUD_VAULTS = 30;
