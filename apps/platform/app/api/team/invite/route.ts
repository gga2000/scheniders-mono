import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { activeTenantRole } from "@/lib/auth/active-tenant-role";
import { NextResponse } from "next/server";
import { assertNotBlocked, blockedResponseBody, TenantBlockedError } from "@/lib/restrictions";
import { sendTeamInviteEmail } from "@/lib/team-invite-email";
import { withFailureReport } from "@/lib/job-monitor";
import { billingLockRefusal } from "@/lib/billing/lock-refusal";
import { normalizeIraqiPhone } from "@/lib/order-utils";
import {
    inviteExpiry,
    inviteLink,
    isTeamLimitError,
    newInviteToken,
    teamLimitResponse,
    whatsappInviteUrl,
} from "@/lib/team-invites";

const ALLOWED_ROLES = new Set(["admin", "employee", "viewer"]);
const IRAQI_MOBILE = /^07\d{9}$/;
const INVITE_COLUMNS = "id, email, phone, role, display_name, status, created_at, expires_at";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type Caller = { userId: string; admin: ServiceClient };

async function callerFrom(request: Request): Promise<Caller | NextResponse> {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    const { user, error } = await verifyAccessToken(token);
    if (error || !user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    return { userId: user.id, admin: createSupabaseServiceClient() };
}

/**
 * The checks every write to a store's invites passes: an active admin of the
 * store (F-087), the store not billing-locked (Fermi A1) and not paused.
 */
async function adminGate(caller: Caller, tenantId: string): Promise<NextResponse | null> {
    if ((await activeTenantRole(caller.userId, tenantId)) !== "admin") {
        return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }
    const locked = await billingLockRefusal(tenantId);
    if (locked) return locked;
    try {
        await assertNotBlocked(tenantId, "team_invites");
    } catch (err) {
        if (err instanceof TenantBlockedError) return NextResponse.json(blockedResponseBody(err), { status: 423 });
        throw err;
    }
    return null;
}

/** The link to send, and for a phone invite the WhatsApp chat that carries it. */
async function shareFor(
    admin: ServiceClient,
    request: Request,
    tenantId: string,
    phone: string | null,
    token: string,
): Promise<{ link: string; whatsappUrl: string | null }> {
    const link = inviteLink(new URL(request.url).origin, token);
    if (!phone) return { link, whatsappUrl: null };
    const { data: tenant } = await admin.from("tenants").select("business_name").eq("id", tenantId).maybeSingle();
    return { link, whatsappUrl: whatsappInviteUrl(phone, tenant?.business_name ?? "", link) };
}

/**
 * Admin endpoint: invite a person by email or by Iraqi mobile number.
 *
 * Creates a pending invite with a join link (/join/<token>, valid 7 days). An
 * email invite is also emailed; for a phone the owner shares the link on
 * WhatsApp. Opening the link, or signing in with Google on the invited email,
 * adds the person to this store. The plan's seat cap is enforced by the
 * database (team_seat_guard) and comes back as 402 with an upgrade message.
 */
async function handlePOST(request: Request) {
    try {
        const caller = await callerFrom(request);
        if (caller instanceof NextResponse) return caller;
        const { admin } = caller;

        const body = await request.json().catch(() => ({}));
        const email = body.email ? String(body.email).trim().toLowerCase() : "";
        const phoneInput = body.phone ? String(body.phone) : "";
        const role = ALLOWED_ROLES.has(body.role) ? body.role : "employee";
        const displayName = body.displayName ? String(body.displayName).trim().slice(0, 80) || null : null;

        if (email && phoneInput) {
            return NextResponse.json({ error: "Invite by email or by phone, not both" }, { status: 400 });
        }
        const phone = phoneInput ? normalizeIraqiPhone(phoneInput) : "";
        if (phoneInput && !IRAQI_MOBILE.test(phone)) {
            return NextResponse.json({ error: "رقم الهاتف غير صحيح. اكتب رقماً عراقياً مثل 07701234567." }, { status: 400 });
        }
        if (!phone && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            return NextResponse.json({ error: "A valid email or phone number is required" }, { status: 400 });
        }

        // Resolve the inviting admin's tenant.
        const { data: inviter } = await admin
            .from("user_profiles")
            .select("current_tenant_id")
            .eq("id", caller.userId)
            .single();
        const tenantId = body.tenantId || inviter?.current_tenant_id;
        if (!tenantId) return NextResponse.json({ error: "No workspace found" }, { status: 400 });

        const refused = await adminGate(caller, tenantId);
        if (refused) return refused;

        // Already an active member of this tenant? (An email names an account;
        // a phone does not, so only an email can be checked here.)
        if (email) {
            const { data: existingProfile } = await admin
                .from("user_profiles")
                .select("id")
                // Exact match: emails are stored lower-case, and ilike treats "_" and "%"
                // as wildcards, so "john_doe@" would match a different person's "john1doe@".
                .eq("email", email)
                .maybeSingle();
            if (existingProfile) {
                const { data: existingMember } = await admin
                    .from("tenant_members")
                    .select("status")
                    .eq("user_id", existingProfile.id)
                    .eq("tenant_id", tenantId)
                    .maybeSingle();
                if (existingMember?.status === "suspended") {
                    // Removed earlier: bringing them back is the invite. Their
                    // account and history are still here. It takes a seat again.
                    const { error: reactivateError } = await admin
                        .from("tenant_members")
                        .update({ status: "active", role })
                        .eq("user_id", existingProfile.id)
                        .eq("tenant_id", tenantId);
                    if (isTeamLimitError(reactivateError)) return teamLimitResponse();
                    if (reactivateError) {
                        return NextResponse.json({ error: reactivateError.message }, { status: 400 });
                    }
                    return NextResponse.json({ success: true, reactivated: true });
                }
                if (existingMember) {
                    return NextResponse.json(
                        { error: "That email already belongs to a member of this workspace." },
                        { status: 409 },
                    );
                }
            }
        }

        const { token, hash } = newInviteToken();
        const fields = {
            role,
            display_name: displayName,
            invited_by: caller.userId,
            token_hash: hash,
            expires_at: inviteExpiry(),
        };
        let { data: invite, error: insertErr } = await admin
            .from("team_invites")
            .insert({ tenant_id: tenantId, email: email || null, phone: phone || null, status: "pending", ...fields })
            .select(INVITE_COLUMNS)
            .single();

        // One pending invite per email or phone. One that expired holds no seat
        // and no longer works, so inviting the person again renews it.
        if (insertErr?.code === "23505") {
            const pending = admin
                .from("team_invites")
                .select("id, expires_at")
                .eq("tenant_id", tenantId)
                .eq("status", "pending");
            const { data: existing } = await (phone ? pending.eq("phone", phone) : pending.eq("email", email)).maybeSingle();
            if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
                return NextResponse.json({ error: "This person is already invited. Use resend." }, { status: 409 });
            }
            if (existing) {
                ({ data: invite, error: insertErr } = await admin
                    .from("team_invites")
                    .update({ ...fields, updated_at: new Date().toISOString() })
                    .eq("id", existing.id)
                    .select(INVITE_COLUMNS)
                    .single());
            }
        }
        if (isTeamLimitError(insertErr)) return teamLimitResponse();
        if (insertErr || !invite) {
            return NextResponse.json({ error: insertErr?.message ?? "Could not create the invite" }, { status: 400 });
        }

        const share = await shareFor(admin, request, tenantId, phone || null, token);
        if (!email) return NextResponse.json({ success: true, invite, ...share });

        // The invite is useless if the person never hears of it: without the
        // email, a password user had no way in at all.
        const mail = await sendTeamInviteEmail(admin, email);
        if (!mail.sent) {
            console.error("[team-invite] email failed:", mail.error);
            await admin
                .from("team_invites")
                .update({ status: "revoked", updated_at: new Date().toISOString() })
                .eq("id", invite.id);
            return NextResponse.json({ error: "تعذر إرسال بريد الدعوة. حاول مرة أخرى." }, { status: 502 });
        }

        return NextResponse.json({ success: true, invite, ...share, email_kind: mail.kind });
    } catch {
        return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
    }
}

/**
 * Admin endpoint: send a pending invite again. The old link stops working, a
 * new one is valid for 7 days, and an email invite is emailed again. An invite
 * that had expired needs a free seat again.
 */
async function handlePATCH(request: Request) {
    try {
        const caller = await callerFrom(request);
        if (caller instanceof NextResponse) return caller;
        const { admin } = caller;

        const inviteId = new URL(request.url).searchParams.get("id");
        if (!inviteId) return NextResponse.json({ error: "Missing invite id" }, { status: 400 });

        const { data: invite } = await admin
            .from("team_invites")
            .select("id, tenant_id, status, email, phone")
            .eq("id", inviteId)
            .maybeSingle();
        if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

        const refused = await adminGate(caller, invite.tenant_id);
        if (refused) return refused;
        if (invite.status !== "pending") {
            return NextResponse.json({ error: "This invite is no longer pending" }, { status: 409 });
        }

        const { token, hash } = newInviteToken();
        const { error: updateErr } = await admin
            .from("team_invites")
            .update({ token_hash: hash, expires_at: inviteExpiry(), updated_at: new Date().toISOString() })
            .eq("id", invite.id);
        if (isTeamLimitError(updateErr)) return teamLimitResponse();
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

        const share = await shareFor(admin, request, invite.tenant_id, invite.phone, token);
        if (!invite.email) return NextResponse.json({ success: true, ...share });

        const mail = await sendTeamInviteEmail(admin, invite.email);
        if (!mail.sent) {
            console.error("[team-invite] resend email failed:", mail.error);
            return NextResponse.json({ error: "تعذر إرسال بريد الدعوة. حاول مرة أخرى." }, { status: 502 });
        }
        return NextResponse.json({ success: true, ...share, email_kind: mail.kind });
    } catch {
        return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
    }
}

/**
 * Admin endpoint: revoke a pending invite.
 */
async function handleDELETE(request: Request) {
    try {
        const caller = await callerFrom(request);
        if (caller instanceof NextResponse) return caller;
        const { admin } = caller;

        const inviteId = new URL(request.url).searchParams.get("id");
        if (!inviteId) return NextResponse.json({ error: "Missing invite id" }, { status: 400 });

        // Load the invite and verify the caller is an admin of its tenant.
        const { data: invite } = await admin
            .from("team_invites")
            .select("id, tenant_id, status")
            .eq("id", inviteId)
            .single();
        if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

        if ((await activeTenantRole(caller.userId, invite.tenant_id)) !== "admin") {
            return NextResponse.json({ error: "Admins only" }, { status: 403 });
        }

        await admin
            .from("team_invites")
            .update({ status: "revoked", updated_at: new Date().toISOString() })
            .eq("id", inviteId);

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
    }
}

export const POST = withFailureReport("api/team/invite POST", handlePOST);
export const PATCH = withFailureReport("api/team/invite PATCH", handlePATCH);
export const DELETE = withFailureReport("api/team/invite DELETE", handleDELETE);
