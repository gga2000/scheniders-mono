import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { activeTenantRole } from "@/lib/auth/active-tenant-role";
import { NextResponse } from "next/server";
import { assertNotBlocked, blockedResponseBody, TenantBlockedError } from "@/lib/restrictions";

const ALLOWED_ROLES = new Set(["admin", "employee", "viewer"]);

/**
 * Admin endpoint: pre-invite a person by email (e.g. their Google address).
 * Creates a pending row in team_invites; on that email's first sign-in the auth
 * callback auto-provisions them into this tenant. No auth user is created here —
 * that happens when they sign in (with Google or password).
 */
export async function POST(request: Request) {
    try {
        const token = request.headers.get("Authorization")?.replace("Bearer ", "");
        if (!token) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const admin = createSupabaseServiceClient();
        const body = await request.json().catch(() => ({}));
        const email = String(body.email ?? "").trim().toLowerCase();
        const role = ALLOWED_ROLES.has(body.role) ? body.role : "employee";
        const displayName = body.displayName ? String(body.displayName).trim() : null;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
        }

        // Resolve the inviting admin's tenant.
        const { data: inviter } = await admin
            .from("user_profiles")
            .select("current_tenant_id")
            .eq("id", user.id)
            .single();
        const tenantId = body.tenantId || inviter?.current_tenant_id;
        if (!tenantId) return NextResponse.json({ error: "No workspace found" }, { status: 400 });

        // Tenant-scoped admin check (mirrors /api/auth/create-user): active
        // membership AND active profile (F-087).
        if ((await activeTenantRole(user.id, tenantId)) !== "admin") {
            return NextResponse.json({ error: "Admins only" }, { status: 403 });
        }

        // Respect tenant pause (same guard as adding members).
        try {
            await assertNotBlocked(tenantId, "team_invites");
        } catch (err) {
            if (err instanceof TenantBlockedError) return NextResponse.json(blockedResponseBody(err), { status: 423 });
            throw err;
        }

        // Already an active member of this tenant?
        const { data: existingProfile } = await admin
            .from("user_profiles")
            .select("id")
            .ilike("email", email)
            .maybeSingle();
        if (existingProfile) {
            const { data: existingMember } = await admin
                .from("tenant_members")
                .select("status")
                .eq("user_id", existingProfile.id)
                .eq("tenant_id", tenantId)
                .maybeSingle();
            if (existingMember) {
                return NextResponse.json(
                    { error: "That email already belongs to a member of this workspace." },
                    { status: 409 },
                );
            }
        }

        // Insert (or refresh) the pending invite. The partial unique index keeps
        // one pending invite per (tenant, email); on conflict we update it.
        const { data: invite, error: insertErr } = await admin
            .from("team_invites")
            .insert({
                tenant_id: tenantId,
                email,
                role,
                display_name: displayName,
                invited_by: user.id,
                status: "pending",
            })
            .select("id, email, role, display_name, status, created_at")
            .single();

        if (insertErr) {
            // Unique-violation = a pending invite already exists for this email.
            if (insertErr.code === "23505") {
                return NextResponse.json({ error: "This email is already invited." }, { status: 409 });
            }
            return NextResponse.json({ error: insertErr.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, invite });
    } catch {
        return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
    }
}

/**
 * Admin endpoint: revoke a pending invite.
 */
export async function DELETE(request: Request) {
    try {
        const token = request.headers.get("Authorization")?.replace("Bearer ", "");
        if (!token) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const admin = createSupabaseServiceClient();
        const { searchParams } = new URL(request.url);
        const inviteId = searchParams.get("id");
        if (!inviteId) return NextResponse.json({ error: "Missing invite id" }, { status: 400 });

        // Load the invite and verify the caller is an admin of its tenant.
        const { data: invite } = await admin
            .from("team_invites")
            .select("id, tenant_id, status")
            .eq("id", inviteId)
            .single();
        if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

        if ((await activeTenantRole(user.id, invite.tenant_id)) !== "admin") {
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
