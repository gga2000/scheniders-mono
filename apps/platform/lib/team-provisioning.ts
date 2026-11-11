import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { tenantMemberRoleFor } from "@/lib/tenant-member-role";

interface ProvisionUser {
    id: string;
    email?: string | null;
    name?: string | null;
    /**
     * Auth says this user proved they own `email` (email_confirmed_at). An
     * invite is accepted only then: otherwise anyone who signs up with an
     * invited address, without opening that mailbox, would join the store.
     */
    emailConfirmed: boolean;
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

        // An unproven address accepts nothing; the person can come back after
        // confirming it.
        const email = user.emailConfirmed ? (user.email ?? "").trim().toLowerCase() : "";

        // Already has an account? (common path — one fast lookup)
        const { data: existing } = await admin
            .from("user_profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();
        if (existing) {
            if (!email) return { provisioned: false, reason: "already-provisioned" };
            return acceptPendingInvitesForExistingUser(admin, user.id, email);
        }

        if (!email) return { provisioned: false, reason: "no-email" };

        // Pending invite for this email?
        const { data: invite } = await admin
            .from("team_invites")
            .select("id, tenant_id, role, display_name, invited_by, created_at")
            // Exact match: emails are stored lower-case, and ilike treats "_" and "%"
            // as wildcards, so "john_doe@" would match a different person's "john1doe@".
            .eq("email", email)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!invite) {
            // No invite → log a pending access request for super-admin review.
            // ignoreDuplicates keeps an existing (incl. rejected) request untouched.
            await admin.from("access_requests").upsert(
                { user_id: user.id, email, name: user.name ?? null },
                { onConflict: "user_id", ignoreDuplicates: true },
            );
            return { provisioned: false, reason: "no-invite-logged" };
        }

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

        // 2. Active tenant membership. The invite carries a profile role
        // (admin / employee / viewer); the membership uses the same tenant vocabulary.
        const { error: memberErr } = await admin.from("tenant_members").insert({
            tenant_id: invite.tenant_id,
            user_id: user.id,
            role: tenantMemberRoleFor(invite.role),
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

/**
 * Someone who already has an account (their own store, or another store's
 * team) was invited by email. Signing in with the verified email is the
 * acceptance: each pending invite for that email becomes an active membership,
 * and the newest invited store becomes the one they land in.
 */
async function acceptPendingInvitesForExistingUser(
    admin: ReturnType<typeof createSupabaseServiceClient>,
    userId: string,
    email: string,
): Promise<{ provisioned: boolean; reason: string }> {
    const { data: invites, error: inviteErr } = await admin
        .from("team_invites")
        .select("id, tenant_id, role, invited_by, created_at")
        .eq("email", email)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
    if (inviteErr) {
        console.error("[Provision] team_invites read failed:", inviteErr.message);
        return { provisioned: false, reason: "invite-read-failed" };
    }
    if (!invites || invites.length === 0) return { provisioned: false, reason: "already-provisioned" };

    const now = new Date().toISOString();
    let joinedTenant: string | null = null;
    for (const invite of invites) {
        const { error: memberErr } = await admin.from("tenant_members").insert({
            tenant_id: invite.tenant_id,
            user_id: userId,
            role: tenantMemberRoleFor(invite.role),
            status: "active",
            joined_at: now,
            invited_by: invite.invited_by,
            invited_at: invite.created_at,
        });
        // 23505 = they are already a member of that store (joined another way
        // since the invite went out): the invite is done, and their existing
        // role is never overwritten by an older invite's role.
        if (memberErr && memberErr.code !== "23505") {
            console.error("[Provision] tenant_members insert failed:", memberErr.message);
            return { provisioned: false, reason: "member-insert-failed" };
        }
        await admin
            .from("team_invites")
            .update({ status: "accepted", accepted_user_id: userId, accepted_at: now, updated_at: now })
            .eq("id", invite.id);
        joinedTenant = invite.tenant_id;
    }

    if (joinedTenant) {
        await admin.from("user_profiles").update({ current_tenant_id: joinedTenant }).eq("id", userId);
    }
    console.log(`[Provision] existing user ${userId} accepted ${invites.length} invite(s)`);
    return { provisioned: true, reason: "accepted-existing" };
}
