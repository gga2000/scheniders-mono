"use server";

import { z } from "zod";
import { pickCustomerWrite, pickExtraWrite, pickProductWrite, RESTORE_ROWS_BATCH_SIZE, type ExtraTable } from "@/lib/vault-restore";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { resolveCaller, type Caller } from "@/lib/auth/resolve-order-caller";
import {
    VAULT_BUCKET,
    VAULT_ADMIN_ROLES,
    VAULT_AUDIT_ACTIONS,
    isCloudVaultFilename,
    cloudVaultPath,
    MAX_CLOUD_VAULTS,
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

    const storage = createSupabaseServiceClient().storage.from(VAULT_BUCKET);
    const { data: existing, error: listError } = await storage.list(resolved.caller.tenantId, { limit: 1000 });
    if (listError) return { success: false, error: "Could not start the cloud upload" };
    if ((existing ?? []).filter((file) => isCloudVaultFilename(file.name)).length >= MAX_CLOUD_VAULTS) {
        return { success: false, error: `Cloud storage is full (${MAX_CLOUD_VAULTS} backups). Ask support to clear old copies.` };
    }

    const filename = `sync_${new Date().toISOString().replace(/[:.]/g, "-")}.scheniders`;
    const path = cloudVaultPath(resolved.caller.tenantId, filename);
    const { data, error } = await storage.createSignedUploadUrl(path);
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

export async function deleteCloudVaultAction(accessToken: string, filename: string): Promise<VaultResult<object>> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const denied = vaultRoleError(resolved.caller);
    if (denied) return { success: false, error: denied };
    if (!isCloudVaultFilename(filename)) return { success: false, error: "Unknown backup file" };

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.storage
        .from(VAULT_BUCKET)
        .remove([cloudVaultPath(resolved.caller.tenantId, filename)]);
    if (error) return { success: false, error: "Could not delete this backup" };

    await supabase.from("security_logs").insert({
        action: "VAULT_CLOUD_DELETE",
        details: { file: filename },
        user_id: resolved.caller.userId,
        tenant_id: resolved.caller.tenantId,
    });
    return { success: true };
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

const restoreInput = z.discriminatedUnion("table", [
    z.object({
        table: z.literal("products"),
        rows: z.array(z.looseObject({ id: z.uuid(), name: z.string().min(1) })).min(1).max(RESTORE_ROWS_BATCH_SIZE),
    }),
    z.object({
        table: z.literal("customers"),
        rows: z.array(z.looseObject({ customer_phone: z.string().min(1) })).min(1).max(RESTORE_ROWS_BATCH_SIZE),
    }),
]);

/**
 * Restores a batch of products or customers into the caller's own store.
 *
 * Runs with the service role (a browser cannot write product stock columns),
 * so the checks here are the tenant boundary: the tenant comes from the
 * caller's membership, every row is written with it, only the columns in
 * lib/vault-restore are written, and a batch holding a product id that belongs
 * to another store is refused whole rather than overwriting that store's row.
 */
export async function restoreVaultRowsAction(
    accessToken: string,
    input: unknown,
): Promise<VaultResult<{ created: number; updated: number }>> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const denied = vaultRoleError(resolved.caller);
    if (denied) return { success: false, error: denied };

    const parsed = restoreInput.safeParse(input);
    if (!parsed.success) return { success: false, error: "The backup's rows are not in the expected format" };

    const { tenantId } = resolved.caller;
    const supabase = createSupabaseServiceClient();

    if (parsed.data.table === "customers") {
        const writes = parsed.data.rows.map((row) => pickCustomerWrite(row, tenantId));
        const phones = writes.map((write) => write.customer_phone as string);
        const { data: existing, error: existingError } = await supabase
            .from("customer_metadata")
            .select("customer_phone")
            .eq("tenant_id", tenantId)
            .in("customer_phone", phones);
        if (existingError) return { success: false, error: "Could not check existing customers" };

        const { error } = await supabase.from("customer_metadata").upsert(writes, { onConflict: "customer_phone,tenant_id" });
        if (error) return { success: false, error: `Customers restore failed: ${error.message}` };
        const updated = (existing ?? []).length;
        return { success: true, created: writes.length - updated, updated };
    }

    const ids = parsed.data.rows.map((row) => row.id);
    const { data: existing, error: existingError } = await supabase
        .from("products")
        .select("id, tenant_id")
        .in("id", ids);
    if (existingError) return { success: false, error: "Could not check existing products" };

    const foreign = (existing ?? []).filter((row) => row.tenant_id !== tenantId).length;
    if (foreign > 0) return { success: false, error: `${foreign} product(s) in this backup belong to another store` };

    // A category deleted since the backup, or one that belongs to another store,
    // would fail the foreign key or link across stores: the product restores uncategorised instead.
    const categoryIds = [...new Set(parsed.data.rows.map((row) => row.category_id).filter((id): id is string => typeof id === "string"))];
    const validCategories = new Set<string>();
    if (categoryIds.length > 0) {
        const { data: categories, error: categoriesError } = await supabase
            .from("categories")
            .select("id")
            .eq("tenant_id", tenantId)
            .in("id", categoryIds);
        if (categoriesError) return { success: false, error: "Could not check product categories" };
        for (const category of categories ?? []) validCategories.add(category.id);
    }

    const existingIds = new Set((existing ?? []).map((row) => row.id));
    const writes = parsed.data.rows.map((row) => {
        const write = pickProductWrite(row, tenantId);
        if ("category_id" in write && !validCategories.has(write.category_id as string)) write.category_id = null;
        return write;
    });
    const { error } = await supabase.from("products").upsert(writes, { onConflict: "id" });
    if (error) return { success: false, error: `Products restore failed: ${error.message}` };
    return { success: true, created: writes.length - existingIds.size, updated: existingIds.size };
}

const extraRows = z.array(z.looseObject({ id: z.uuid() })).min(1).max(RESTORE_ROWS_BATCH_SIZE);

const restoreExtrasInput = z.discriminatedUnion("table", [
    z.object({ table: z.literal("categories"), rows: extraRows }),
    z.object({ table: z.literal("category_parents"), rows: z.array(z.object({ id: z.uuid(), parent_id: z.uuid() })).min(1).max(RESTORE_ROWS_BATCH_SIZE) }),
    z.object({ table: z.literal("expenses"), rows: extraRows }),
    z.object({ table: z.literal("customer_tags"), rows: extraRows }),
    z.object({ table: z.literal("customer_tag_assignments"), rows: extraRows }),
    z.object({ table: z.literal("customer_notes"), rows: extraRows }),
]);

/** Ids from `ids` that exist in `table` for this store. */
async function idsInStore(table: "categories" | "orders" | "customer_tags", tenantId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const { data, error } = await createSupabaseServiceClient().from(table).select("id").eq("tenant_id", tenantId).in("id", ids);
    if (error) throw new Error(`Could not check ${table}`);
    return new Set((data ?? []).map((row) => row.id));
}

/**
 * Restores categories, expenses, customer tags, tag assignments and customer
 * notes into the caller's own store, under the same rules as restoreVaultRowsAction:
 * tenant from the caller, listed columns only, and a batch holding an id that
 * belongs to another store is refused whole. Links that must stay inside the
 * store are checked here: an assignment whose tag is missing is skipped, an
 * expense whose order is missing loses the link, a note keeps its author only
 * when that person is an active member of this store. `category_parents`
 * is the second pass that sets parent links once every category exists.
 */
export async function restoreVaultExtrasAction(
    accessToken: string,
    input: unknown,
): Promise<VaultResult<{ created: number; updated: number; skipped: number }>> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const denied = vaultRoleError(resolved.caller);
    if (denied) return { success: false, error: denied };

    const parsed = restoreExtrasInput.safeParse(input);
    if (!parsed.success) return { success: false, error: "The backup's rows are not in the expected format" };

    const { tenantId } = resolved.caller;
    const supabase = createSupabaseServiceClient();

    try {
        if (parsed.data.table === "category_parents") {
            const rows = parsed.data.rows;
            const known = await idsInStore("categories", tenantId, [...new Set(rows.flatMap((row) => [row.id, row.parent_id]))]);
            const linkable = rows.filter((row) => row.id !== row.parent_id && known.has(row.id) && known.has(row.parent_id));
            const results = await Promise.all(
                linkable.map((row) => supabase.from("categories").update({ parent_id: row.parent_id }).eq("id", row.id).eq("tenant_id", tenantId)),
            );
            const failed = results.find((result) => result.error);
            if (failed?.error) return { success: false, error: `Category links restore failed: ${failed.error.message}` };
            return { success: true, created: 0, updated: linkable.length, skipped: rows.length - linkable.length };
        }

        const table: ExtraTable = parsed.data.table;
        const rows = parsed.data.rows;
        const ids = rows.map((row) => row.id);
        const { data: existing, error: existingError } = await supabase.from(table).select("id, tenant_id").in("id", ids);
        if (existingError) return { success: false, error: `Could not check existing ${table}` };
        const foreign = (existing ?? []).filter((row) => row.tenant_id !== tenantId).length;
        if (foreign > 0) return { success: false, error: `${foreign} row(s) of ${table} in this backup belong to another store` };

        let writes = rows.map((row) => pickExtraWrite(table, row, tenantId));

        if (table === "customer_tag_assignments") {
            const tags = await idsInStore("customer_tags", tenantId, [...new Set(writes.map((w) => String(w.tag_id)))]);
            writes = writes.filter((write) => tags.has(String(write.tag_id)));
        } else if (table === "expenses") {
            const orderIds = [...new Set(writes.map((w) => w.order_id).filter((id): id is string => typeof id === "string"))];
            const orders = await idsInStore("orders", tenantId, orderIds);
            writes = writes.map((write) => (typeof write.order_id === "string" && !orders.has(write.order_id) ? { ...write, order_id: null } : write));
        } else if (table === "customer_notes") {
            const authors = [...new Set(writes.map((w) => w.created_by).filter((id): id is string => typeof id === "string"))];
            const members = new Set<string>();
            if (authors.length > 0) {
                const { data, error } = await supabase
                    .from("tenant_members")
                    .select("user_id")
                    .eq("tenant_id", tenantId)
                    .eq("status", "active")
                    .in("user_id", authors);
                if (error) return { success: false, error: "Could not check note authors" };
                for (const member of data ?? []) members.add(member.user_id);
            }
            writes = writes.map((write) => ({ ...write, created_by: typeof write.created_by === "string" && members.has(write.created_by) ? write.created_by : null }));
        }

        const skipped = rows.length - writes.length;
        if (writes.length === 0) return { success: true, created: 0, updated: 0, skipped };

        const existingIds = new Set((existing ?? []).map((row) => row.id));
        const { error } = await supabase.from(table).upsert(writes, { onConflict: "id" });
        if (error) return { success: false, error: `Restore of ${table} failed: ${error.message}` };
        const updated = writes.filter((write) => existingIds.has(String(write.id))).length;
        return { success: true, created: writes.length - updated, updated, skipped };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Restore failed" };
    }
}
