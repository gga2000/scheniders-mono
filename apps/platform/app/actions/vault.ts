"use server";

import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { resolveCaller, type Caller } from "@/lib/auth/resolve-order-caller";
import {
    VAULT_BUCKET,
    VAULT_ADMIN_ROLES,
    VAULT_AUDIT_ACTIONS,
    isCloudVaultFilename,
    cloudVaultPath,
} from "@/lib/vault-paths";

/**
 * Cloud copies live in the private `vault_backups` bucket under `<tenantId>/`.
 * The bucket's only storage rule is platform-admin-only, so merchants never
 * touch it directly: every read and write goes through these actions, which
 * take the tenant from the caller's own membership, never from an argument.
 */

type VaultResult<T> = ({ success: true } & T) | { success: false; error: string };

/** Admin-only gate applied after resolveCaller in every action below. */
function vaultRoleError(caller: Caller): string | null {
    return VAULT_ADMIN_ROLES.includes(caller.role) ? null : "Only an administrator can use the Data Vault";
}

export interface CloudVaultEntry {
    name: string;
    size: number | null;
    createdAt: string | null;
}

export async function listCloudVaultsAction(accessToken: string): Promise<VaultResult<{ vaults: CloudVaultEntry[] }>> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const denied = vaultRoleError(resolved.caller);
    if (denied) return { success: false, error: denied };

    const { data, error } = await createSupabaseServiceClient()
        .storage.from(VAULT_BUCKET)
        .list(resolved.caller.tenantId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (error) return { success: false, error: "Could not load cloud backups" };

    const vaults = (data ?? [])
        .filter((file) => isCloudVaultFilename(file.name))
        .map((file) => ({
            name: file.name,
            size: typeof file.metadata?.size === "number" ? file.metadata.size : null,
            createdAt: file.created_at ?? null,
        }));
    return { success: true, vaults };
}

/** A one-shot upload slot for an already-encrypted file. The key never leaves the browser. */
export async function prepareCloudUploadAction(
    accessToken: string,
): Promise<VaultResult<{ path: string; token: string }>> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const denied = vaultRoleError(resolved.caller);
    if (denied) return { success: false, error: denied };

    const filename = `sync_${new Date().toISOString().replace(/[:.]/g, "-")}.scheniders`;
    const path = cloudVaultPath(resolved.caller.tenantId, filename);
    const { data, error } = await createSupabaseServiceClient()
        .storage.from(VAULT_BUCKET)
        .createSignedUploadUrl(path);
    if (error || !data) return { success: false, error: "Could not start the cloud upload" };
    return { success: true, path: data.path, token: data.token };
}

export async function getCloudDownloadUrlAction(
    accessToken: string,
    filename: string,
): Promise<VaultResult<{ url: string }>> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const denied = vaultRoleError(resolved.caller);
    if (denied) return { success: false, error: denied };
    if (!isCloudVaultFilename(filename)) return { success: false, error: "Unknown backup file" };

    const { data, error } = await createSupabaseServiceClient()
        .storage.from(VAULT_BUCKET)
        .createSignedUrl(cloudVaultPath(resolved.caller.tenantId, filename), 60);
    if (error || !data) return { success: false, error: "Could not download this backup" };
    return { success: true, url: data.signedUrl };
}

const auditInput = z.object({
    action: z.enum(VAULT_AUDIT_ACTIONS),
    details: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).default({}),
});

/** Audit trail for vault actions. Written here because browsers hold no write access to security_logs. */
export async function logVaultEventAction(accessToken: string, input: unknown): Promise<VaultResult<object>> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const denied = vaultRoleError(resolved.caller);
    if (denied) return { success: false, error: denied };

    const parsed = auditInput.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid audit entry" };

    const { error } = await createSupabaseServiceClient().from("security_logs").insert({
        action: parsed.data.action,
        details: parsed.data.details,
        user_id: resolved.caller.userId,
        tenant_id: resolved.caller.tenantId,
    });
    if (error) return { success: false, error: "Could not record the audit entry" };
    return { success: true };
}
