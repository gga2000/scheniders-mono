import type { SupabaseClient } from "@supabase/supabase-js";
import {
    applyPermissionOverrides,
    resolveEffectiveRole,
    SUPPORT_VIEW_PERMISSIONS,
    type UserRole,
} from "@/lib/permissions";
import type { SupportViewState, UserProfile } from "@/types/auth";

/**
 * Who the signed-in user is in their current shop: the reads the auth provider
 * makes after sign-in, shared with the server's first-load read (/api/boot) so
 * both answer with the same rules. Every read runs as the user (RLS).
 */

/** PostgREST's answer to .single() when no row matched. */
const NO_ROW = "PGRST116";

export type ProfileRead =
    | { kind: "row"; profile: UserProfile }
    | { kind: "none" }
    | { kind: "failed"; message: string };

/** The user's profile row; "none" when there is no row (an unprovisioned sign-in). */
export async function readProfileRow(client: SupabaseClient, userId: string): Promise<ProfileRead> {
    const { data, error } = await client
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .single();
    if (data) return { kind: "row", profile: data as UserProfile };
    if (!error || error.code === NO_ROW) return { kind: "none" };
    return { kind: "failed", message: error.message };
}

export interface TenantAccess {
    role: UserRole | null;
    permissions: string[];
    supportView: SupportViewState | null;
}

/**
 * The look-only support session of this sign-in on `tenantId`, or null when
 * the sign-in is not a support viewer (the token's app_metadata says, set only
 * by the staff console). A viewer with no live session on this shop gets
 * expiresAt null.
 */
async function readSupportView(
    client: SupabaseClient,
    tenantId: string | null,
    isSupportViewer: () => Promise<boolean>,
): Promise<SupportViewState | null> {
    if (!(await isSupportViewer())) return null;
    if (!tenantId) return { expiresAt: null };
    const { data, error } = await client
        .from("support_view_sessions")
        .select("expires_at")
        .eq("tenant_id", tenantId)
        .is("ended_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`Support view read failed: ${error.message}`);
    return { expiresAt: (data as { expires_at: string } | null)?.expires_at ?? null };
}

/**
 * The user's role and permissions in `tenantId`.
 *
 * The role that governs what this user may do is their role in the current
 * tenant (tenant_members.role), the same row RLS reads. user_profiles.role
 * only contributes super_admin (platform staff). Membership, the role table
 * and this tenant's user overrides are read together: role_permissions is a
 * few dozen rows readable by any signed-in user, so taking all of it saves
 * the round trip that used to wait for the role first (audit R1 speed #5).
 * Overrides are per tenant: one granted in another store grants nothing here
 * (has_tenant_permission applies the same rule).
 *
 * A support look-only sign-in has no membership: it reads as a viewer while
 * its 30-minute session on this shop is live.
 */
export async function readTenantAccess(
    client: SupabaseClient,
    args: {
        userId: string;
        tenantId: string | null;
        platformRole: string | null | undefined;
        isSupportViewer: () => Promise<boolean>;
    },
): Promise<TenantAccess> {
    const { userId, tenantId } = args;
    const [membershipResult, rolePermsResult, userOverridesResult] = await Promise.all([
        tenantId
            ? client
                .from("tenant_members")
                .select("role")
                .eq("tenant_id", tenantId)
                .eq("user_id", userId)
                .eq("status", "active")
                .maybeSingle()
            : Promise.resolve({ data: null }),
        client.from("role_permissions").select("role, permission"),
        tenantId
            ? client.from("user_permissions").select("permission, is_granted")
                .eq("tenant_id", tenantId)
                .eq("user_id", userId)
            : Promise.resolve({ data: null }),
    ]);
    const memberRole = resolveEffectiveRole(
        args.platformRole,
        (membershipResult.data as { role: string } | null)?.role,
    );

    const supportView = memberRole ? null : await readSupportView(client, tenantId, args.isSupportViewer);
    const role: UserRole | null = memberRole ?? (supportView?.expiresAt ? "viewer" : null);

    const rolePermissions = (rolePermsResult.data ?? []) as Array<{ role: string; permission: string }>;
    const overrides = (userOverridesResult.data ?? []) as Array<{ permission: string; is_granted: boolean }>;
    const permissions = memberRole
        ? applyPermissionOverrides(
            rolePermissions.filter((p) => p.role === memberRole).map((p) => p.permission),
            overrides,
        )
        : role ? [...SUPPORT_VIEW_PERMISSIONS] : [];

    return { role, permissions, supportView };
}
