import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { activeTenantRole } from "@/lib/auth/active-tenant-role";
import { linkTargetAllowed } from "@/lib/auth/link-target";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

const TTL_MINUTES = 20;

/**
 * Admin endpoint (Flow A): generate a single-use, short-lived link that lets an
 * EXISTING member attach their Google account. The admin sends the returned URL
 * to the employee; opening it signs them into their own account (via a
 * server-generated magic-link) and runs the Google link. Same auth user → all
 * data preserved.
 */
export async function POST(request: Request) {
    try {
        const token = request.headers.get("Authorization")?.replace("Bearer ", "");
        if (!token) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const admin = createSupabaseServiceClient();
        const body = await request.json().catch(() => ({}));
        const targetUserId = String(body.userId ?? "");
        if (!targetUserId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

        // Resolve the admin's tenant + verify admin role.
        const { data: inviter } = await admin
            .from("user_profiles").select("current_tenant_id").eq("id", user.id).single();
        const tenantId = inviter?.current_tenant_id;
        if (!tenantId) return NextResponse.json({ error: "No workspace found" }, { status: 400 });

        // Admin of that tenant, with an active profile (F-087).
        if ((await activeTenantRole(user.id, tenantId)) !== "admin") {
            return NextResponse.json({ error: "Admins only" }, { status: 403 });
        }

        // The link signs its opener in as the target, so the target must be a
        // non-admin member of this store only (lib/auth/link-target).
        if (targetUserId === user.id || !(await linkTargetAllowed(admin, targetUserId, tenantId))) {
            return NextResponse.json(
                { error: "A Google link can only be made for a staff member who belongs to this workspace only." },
                { status: 403 },
            );
        }

        // Generate + store a single-use token.
        const linkToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();
        const { error: insertErr } = await admin.from("account_link_tokens").insert({
            token: linkToken,
            target_user_id: targetUserId,
            tenant_id: tenantId,
            provider: "google",
            created_by: user.id,
            expires_at: expiresAt,
        });
        if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

        const origin = new URL(request.url).origin;
        const claimUrl = `${origin}/link-google/claim?token=${linkToken}`;
        return NextResponse.json({ success: true, claimUrl, expiresAt, expiresInMinutes: TTL_MINUTES });
    } catch {
        return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
    }
}
