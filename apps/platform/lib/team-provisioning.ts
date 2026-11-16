import { createSupabaseServiceClient } from "@/lib/supabase-server";

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
 * Accept the email invites of a freshly-authenticated user (e.g. first Google
 * sign-in, or the invite email's link) whose verified email is invited.
 *
 * Each pending invite that has not expired is taken with accept_team_invite,
 * which in one transaction writes the profile if the person has none, marks
 * the invite accepted and adds the membership. Invites are taken oldest
 * first, so the newest invited store is the one they land in. Someone with no
 * account and no invite is queued for staff review (access_requests).
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

        const { data: existing } = await admin
            .from("user_profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();
        if (!email) return { provisioned: false, reason: existing ? "already-provisioned" : "no-email" };

        const { data: invites, error: inviteErr } = await admin
            .from("team_invites")
            .select("id, tenant_id, display_name")
            // Exact match: emails are stored lower-case, and ilike treats "_" and "%"
            // as wildcards, so "john_doe@" would match a different person's "john1doe@".
            .eq("email", email)
            .eq("status", "pending")
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: true });
        if (inviteErr) {
            console.error("[Provision] team_invites read failed:", inviteErr.message);
            return { provisioned: false, reason: "invite-read-failed" };
        }

        if (!invites || invites.length === 0) {
            if (existing) return { provisioned: false, reason: "already-provisioned" };
            // No invite → log a pending access request for super-admin review.
            // ignoreDuplicates keeps an existing (incl. rejected) request untouched.
            await admin.from("access_requests").upsert(
                { user_id: user.id, email, name: user.name ?? null },
                { onConflict: "user_id", ignoreDuplicates: true },
            );
            return { provisioned: false, reason: "no-invite-logged" };
        }

        let joined = 0;
        for (const invite of invites) {
            const { data, error } = await admin.rpc("accept_team_invite", {
                _invite_id: invite.id,
                _user_id: user.id,
                _email: email,
                _display_name: invite.display_name || user.name || null,
            });
            const accepted = (data as { success?: boolean } | null)?.success === true;
            // One store refusing (full, or the invite changed meanwhile) does
            // not stop the others.
            if (error || !accepted) {
                console.error(
                    `[Provision] invite ${invite.id} not accepted:`,
                    error?.message ?? (data as { error?: unknown } | null)?.error,
                );
                continue;
            }
            joined += 1;
        }

        if (joined === 0) return { provisioned: false, reason: "accept-failed" };
        console.log(`[Provision] userId=${user.id} accepted ${joined} of ${invites.length} invite(s)`);
        return { provisioned: true, reason: existing ? "accepted-existing" : "ok" };
    } catch (err) {
        console.error("[Provision] unexpected error:", err);
        return { provisioned: false, reason: "error" };
    }
}
