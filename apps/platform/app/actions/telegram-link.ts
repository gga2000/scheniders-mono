"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import crypto from "node:crypto";

/**
 * Server actions for managing the Telegram bot ↔ employee account links.
 * The Settings → Team page is already gated to admins, so we follow the
 * existing pattern (e.g. toggleRolePermissionAction) and don't re-verify
 * the caller's role here.
 *
 * Multi-tenant: every code/link row carries tenant_id. Reads are scoped
 * to a tenant by the caller passing the current admin's tenant_id; the
 * service-role client bypasses RLS but we still filter explicitly to
 * prevent cross-tenant leakage.
 */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no O/0/I/1 confusion
const CODE_LEN = 6;

function generateCode(): string {
    const bytes = crypto.randomBytes(CODE_LEN);
    let out = "";
    for (let i = 0; i < CODE_LEN; i++) {
        out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
}

export interface TelegramLinkStatus {
    linked: boolean;
    telegram_user_id?: number | null;
    telegram_username?: string | null;
    linked_at?: string | null;
    /** Most recent unused, non-expired link code for this user, if any. */
    active_code?: { code: string; expires_at: string } | null;
}

export async function getTelegramLinkStatusAction(
    targetUserProfileId: string,
    tenantId: string | null
): Promise<TelegramLinkStatus> {
    const supabase = createSupabaseServiceClient();

    let linkQuery = supabase
        .from("telegram_employee_link")
        .select("telegram_user_id, telegram_username, linked_at")
        .eq("user_profile_id", targetUserProfileId);
    if (tenantId) linkQuery = linkQuery.eq("tenant_id", tenantId);
    const { data: link } = await linkQuery.maybeSingle();

    let codeQuery = supabase
        .from("telegram_link_codes")
        .select("code, expires_at")
        .eq("user_profile_id", targetUserProfileId)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
    if (tenantId) codeQuery = codeQuery.eq("tenant_id", tenantId);
    const { data: activeCode } = await codeQuery.maybeSingle();

    return {
        linked: !!link,
        telegram_user_id: link?.telegram_user_id ?? null,
        telegram_username: link?.telegram_username ?? null,
        linked_at: link?.linked_at ?? null,
        active_code: activeCode ?? null,
    };
}

export async function generateTelegramLinkCodeAction(
    targetUserProfileId: string,
    tenantId: string,
    createdByUserProfileId?: string
): Promise<{ success: boolean; code?: string; expires_at?: string; error?: string }> {
    const supabase = createSupabaseServiceClient();

    if (!tenantId) {
        return { success: false, error: "Tenant context required" };
    }

    // Invalidate any previously-issued unused codes for this user/tenant
    await supabase
        .from("telegram_link_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("user_profile_id", targetUserProfileId)
        .eq("tenant_id", tenantId)
        .is("used_at", null);

    // 64^6 keyspace, but if we somehow collide we retry a few times.
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        const { data, error } = await supabase
            .from("telegram_link_codes")
            .insert({
                code,
                user_profile_id: targetUserProfileId,
                tenant_id: tenantId,
                created_by: createdByUserProfileId || null,
            })
            .select("code, expires_at")
            .maybeSingle();

        if (!error && data) {
            return { success: true, code: data.code, expires_at: data.expires_at };
        }
        // 23505 = unique violation — retry with a new code.
        const code23505 = (error as { code?: string } | null)?.code === "23505";
        if (!code23505) {
            return {
                success: false,
                error: error?.message || "Failed to insert code",
            };
        }
    }
    return { success: false, error: "Could not generate a unique code, please retry" };
}

export async function unlinkTelegramAction(
    targetUserProfileId: string,
    tenantId: string | null
): Promise<{ success: boolean; error?: string }> {
    const supabase = createSupabaseServiceClient();
    let query = supabase
        .from("telegram_employee_link")
        .delete()
        .eq("user_profile_id", targetUserProfileId);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true };
}
