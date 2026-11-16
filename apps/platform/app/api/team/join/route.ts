import { NextResponse } from "next/server";
import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { withFailureReport } from "@/lib/job-monitor";
import {
    INVITE_REFUSAL_MESSAGE,
    hashInviteToken,
    isInviteRefusal,
    isInviteToken,
    isTeamLimitError,
    teamLimitResponse,
    type InviteRefusal,
} from "@/lib/team-invites";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

function refusal(reason: InviteRefusal): NextResponse {
    const status = reason === "not_found" ? 404 : 410;
    return NextResponse.json({ success: false, reason, error: INVITE_REFUSAL_MESSAGE[reason] }, { status });
}

/** The invite a /join/<token> link carries, or why it no longer works. */
async function inviteFor(admin: ServiceClient, token: string | null) {
    if (!isInviteToken(token)) return { refused: "not_found" as const, invite: null };
    const { data: invite } = await admin
        .from("team_invites")
        .select("id, tenant_id, role, display_name, status, expires_at")
        .eq("token_hash", hashInviteToken(token))
        .maybeSingle();
    if (!invite) return { refused: "not_found" as const, invite: null };
    if (invite.status === "accepted") return { refused: "used" as const, invite };
    if (invite.status !== "pending") return { refused: "revoked" as const, invite };
    if (new Date(invite.expires_at).getTime() <= Date.now()) return { refused: "expired" as const, invite };
    return { refused: null, invite };
}

/**
 * The join page's preview: which store the link is for and with what role.
 * Anyone holding the link may see this; it names no person.
 */
async function handleGET(request: Request) {
    const admin = createSupabaseServiceClient();
    const found = await inviteFor(admin, new URL(request.url).searchParams.get("token"));
    if (found.refused || !found.invite) return refusal(found.refused ?? "not_found");
    const { data: tenant } = await admin
        .from("tenants")
        .select("business_name")
        .eq("id", found.invite.tenant_id)
        .maybeSingle();
    return NextResponse.json({ success: true, storeName: tenant?.business_name ?? "", role: found.invite.role });
}

/**
 * The signed-in person accepts the invite the link carries: in one database
 * transaction (accept_team_invite) they get a profile if they have none and an
 * active membership, and the store becomes the one they open. Someone with
 * their own store, or on another team, keeps it; the new store joins their
 * store switcher.
 */
async function handlePOST(request: Request) {
    const bearer = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!bearer) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    const { user, error } = await verifyAccessToken(bearer);
    if (error || !user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { token?: unknown };
    const admin = createSupabaseServiceClient();
    const found = await inviteFor(admin, typeof body.token === "string" ? body.token : null);
    // The same person opening their used link again lands in the store; the
    // database answers that as success.
    if (found.refused && found.refused !== "used") return refusal(found.refused);
    if (!found.invite) return refusal("not_found");

    // The name the owner typed on the invite is how the team knows them; else
    // the name on their account.
    const meta = user.user_metadata as { full_name?: string; name?: string; display_name?: string } | undefined;
    const { data, error: acceptError } = await admin.rpc("accept_team_invite", {
        _invite_id: found.invite.id,
        _user_id: user.id,
        _email: user.email ?? "",
        _display_name: found.invite.display_name || meta?.full_name || meta?.name || meta?.display_name || null,
    });
    if (isTeamLimitError(acceptError)) return teamLimitResponse();
    if (acceptError) {
        console.error("[team-join] accept failed:", acceptError.message);
        return NextResponse.json({ error: "تعذر الانضمام للمتجر. حاول مرة أخرى." }, { status: 500 });
    }
    const result = data as { success?: boolean; error?: unknown; tenant_id?: string } | null;
    if (!result?.success) {
        return refusal(isInviteRefusal(result?.error) ? result.error : "not_found");
    }

    // A person who signed in with Google before joining was queued for staff
    // review; joining by link answers that request.
    const now = new Date().toISOString();
    await admin
        .from("access_requests")
        .update({ status: "approved", reviewed_at: now, updated_at: now })
        .eq("user_id", user.id)
        .eq("status", "pending");

    return NextResponse.json({ success: true, tenantId: result.tenant_id });
}

export const GET = withFailureReport("api/team/join GET", handleGET);
export const POST = withFailureReport("api/team/join POST", handlePOST);
