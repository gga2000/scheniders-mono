import type { createSupabaseServiceClient } from "@/lib/supabase-server";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export type InviteEmailResult =
    | { sent: true; kind: "invite" | "magiclink" }
    | { sent: false; error: string };

/**
 * Email the join link for a pending team invite.
 *
 * A new person gets Supabase's "invite" email (Arabic template «انضم لفريقك في
 * شنايدر»); its button opens /api/auth/confirm, which verifies the email,
 * provisions them from the pending invite and sends them to set a password.
 *
 * Someone who already has an account (their own store, or another team) cannot
 * be "invited" by Supabase, so they get a sign-in link instead; signing in with
 * that verified email accepts the pending invite (team-provisioning).
 */
export async function sendTeamInviteEmail(admin: ServiceClient, email: string): Promise<InviteEmailResult> {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
    if (!inviteError) return { sent: true, kind: "invite" };
    if (inviteError.code !== "email_exists") return { sent: false, error: inviteError.message };

    const { error: linkError } = await admin.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
    });
    if (linkError) return { sent: false, error: linkError.message };
    return { sent: true, kind: "magiclink" };
}
