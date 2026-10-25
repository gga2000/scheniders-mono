import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { tenantMemberRoleFor } from "@/lib/tenant-member-role";

type Admin = ReturnType<typeof createSupabaseServiceClient>;

const ALLOWED_ROLES = new Set(["admin", "employee", "viewer"]);

/** Verify the caller is a super-admin. Returns { admin, userId } or an error response. */
async function requireSuperAdmin(request: Request) {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return { error: NextResponse.json({ error: "Not authorized" }, { status: 401 }) };
    const { user, error: authError } = await verifyAccessToken(token);
    if (authError || !user) return { error: NextResponse.json({ error: "Not authorized" }, { status: 401 }) };
    const admin = createSupabaseServiceClient();
    const { data: profile } = await admin.from("user_profiles").select("role, is_active").eq("id", user.id).single();
    // A deactivated profile keeps its session, so is_active is checked here too (F-087).
    if (profile?.role !== "super_admin" || profile.is_active === false) {
        return { error: NextResponse.json({ error: "Super-admins only" }, { status: 403 }) };
    }
    return { admin: admin as Admin, userId: user.id };
}

/** List pending access requests + all tenants (for the approve picker). */
export async function GET(request: Request) {
    const ctx = await requireSuperAdmin(request);
    if (ctx.error) return ctx.error;
    const { admin } = ctx;

    const [{ data: requests }, { data: tenants }] = await Promise.all([
        admin.from("access_requests").select("id, user_id, email, name, status, created_at")
            .eq("status", "pending").order("created_at", { ascending: false }),
        admin.from("tenants").select("id, business_name").order("business_name"),
    ]);
    return NextResponse.json({ requests: requests ?? [], tenants: tenants ?? [] });
}

/** Approve a request: provision the user into a tenant with a role. */
export async function POST(request: Request) {
    const ctx = await requireSuperAdmin(request);
    if (ctx.error) return ctx.error;
    const { admin, userId } = ctx;

    const body = await request.json().catch(() => ({}));
    const requestId = String(body.requestId ?? "");
    const tenantId = String(body.tenantId ?? "");
    const role = ALLOWED_ROLES.has(body.role) ? body.role : "employee";
    if (!requestId || !tenantId) return NextResponse.json({ error: "Missing requestId or tenantId" }, { status: 400 });

    const { data: req } = await admin.from("access_requests")
        .select("id, user_id, email, name, status").eq("id", requestId).single();
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (req.status !== "pending") return NextResponse.json({ error: "Already reviewed" }, { status: 409 });

    const now = new Date().toISOString();
    const displayName = req.name || req.email.split("@")[0];

    // Provision: profile → membership (profile must exist first for the FK).
    const { error: profileErr } = await admin.from("user_profiles").upsert({
        id: req.user_id, email: req.email, display_name: displayName, role, current_tenant_id: tenantId,
    });
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });

    // The membership role is admin | employee | viewer; `role` is the profile role.
    const { error: memberErr } = await admin.from("tenant_members").upsert(
        { tenant_id: tenantId, user_id: req.user_id, role: tenantMemberRoleFor(role), status: "active", joined_at: now, invited_by: userId },
        { onConflict: "tenant_id,user_id" },
    );
    if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 400 });

    await admin.from("access_requests")
        .update({ status: "approved", reviewed_by: userId, reviewed_at: now, updated_at: now })
        .eq("id", requestId);

    return NextResponse.json({ success: true });
}

/** Reject a request. */
export async function DELETE(request: Request) {
    const ctx = await requireSuperAdmin(request);
    if (ctx.error) return ctx.error;
    const { admin, userId } = ctx;

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await admin.from("access_requests")
        .update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);
    return NextResponse.json({ success: true });
}
