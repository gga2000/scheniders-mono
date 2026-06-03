import { createSupabaseServiceClient } from "@/lib/supabase-server";

interface ProvisionUser {
    id: string;
    email?: string | null;
    name?: string | null;
}

/**
 * Auto-provision a freshly-authenticated user (e.g. first Google sign-in) when
 * their email is on the `team_invites` allowlist.
 *
 * No-op if they already have a user_profiles row or there's no matching pending
 * invite. When an invite matches, we (service-role): create the profile, create
 * an active tenant membership, and mark the invite accepted — so an admin can
 * "add an employee via Google" simply by inviting their Gmail.
 *
 * Runs in the auth callback, so it must be resilient: it never throws; failures
 * leave the user unprovisioned (they hit the "not set up" screen) and can retry.
 */
export async function provisionInvitedUserIfNeeded(
    user: ProvisionUser,
): Promise<{ provisioned: boolean; reason: string }> {
    try {
        if (!user?.id) return { provisioned: false, reason: "no-user" };
        const admin = createSupabaseServiceClient();

        // Already provisioned? (common path — one fast lookup)
        const { data: existing } = await admin
            .from("user_profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();
        if (existing) return { provisioned: false, reason: "already-provisioned" };

        const email = (user.email ?? "").trim().toLowerCase();
        if (!email) return { provisioned: false, reason: "no-email" };

        // Pending invite for this email?
        const { data: invite } = await admin
            .from("team_invites")
            .select("id, tenant_id, role, display_name, invited_by, created_at")
            .ilike("email", email)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!invite) return { provisioned: false, reason: "no-invite" };

        const displayName = invite.display_name || user.name || email.split("@")[0];
        const now = new Date().toISOString();

        // 1. Profile (FK target for the membership, so it must exist first).
        const { error: profileErr } = await admin.from("user_profiles").insert({
            id: user.id,
            email,
            display_name: displayName,
            role: invite.role,
            current_tenant_id: invite.tenant_id,
        });
        if (profileErr) {
            console.error("[Provision] user_profiles insert failed:", profileErr.message);
            return { provisioned: false, reason: "profile-insert-failed" };
        }

        // 2. Active tenant membership.
        const { error: memberErr } = await admin.from("tenant_members").insert({
            tenant_id: invite.tenant_id,
            user_id: user.id,
            role: invite.role,
            status: "active",
            joined_at: now,
            invited_by: invite.invited_by,
            invited_at: invite.created_at,
        });
        if (memberErr) {
            console.error("[Provision] tenant_members insert failed:", memberErr.message);
            // Roll back the profile so the next sign-in retries cleanly.
            await admin.from("user_profiles").delete().eq("id", user.id);
            return { provisioned: false, reason: "member-insert-failed" };
        }

        // 3. Mark the invite accepted.
        await admin
            .from("team_invites")
            .update({ status: "accepted", accepted_user_id: user.id, accepted_at: now, updated_at: now })
            .eq("id", invite.id);

        console.log(`[Provision] OK userId=${user.id} email=${email} tenant=${invite.tenant_id} role=${invite.role}`);
        return { provisioned: true, reason: "ok" };
    } catch (err) {
        console.error("[Provision] unexpected error:", err);
        return { provisioned: false, reason: "error" };
    }
}
