import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import {
    assertNotBlocked,
    blockedResponseBody,
    TenantBlockedError,
} from "@/lib/restrictions";
import { tenantMemberRoleFor } from "@/lib/tenant-member-role";

const ALLOWED_ROLES = new Set(["admin", "employee", "viewer"]);

export async function POST(request: Request) {
    try {
        // Verify the requesting user via access token
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
        }

        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) {
            return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
        }

        const supabaseAdmin = createSupabaseServiceClient();

        // Parse request body
        const { email, password, displayName, role, tenantId } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" }, { status: 400 });
        }

        // Same allowlist as /api/team/invite: a tenant admin must never be able
        // to mint a platform-level role such as super_admin.
        if (role !== undefined && !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }

        // Resolve tenant: use provided tenantId or fall back to inviting user's tenant
        let resolvedTenantId = tenantId;
        if (!resolvedTenantId) {
            const { data: inviterProfile } = await supabaseAdmin
                .from("user_profiles")
                .select("current_tenant_id")
                .eq("id", user.id)
                .single();
            resolvedTenantId = inviterProfile?.current_tenant_id;
        }

        if (!resolvedTenantId) {
            return NextResponse.json({ error: "لم يتم العثور على المتجر" }, { status: 400 });
        }

        // Check tenant-scoped admin role (not global user_profiles.role)
        const { data: membership } = await supabaseAdmin
            .from("tenant_members")
            .select("role")
            .eq("user_id", user.id)
            .eq("tenant_id", resolvedTenantId)
            .eq("status", "active")
            .single();

        if (membership?.role !== "admin") {
            return NextResponse.json({ error: "هذا الإجراء مخصص للمسؤولين فقط" }, { status: 403 });
        }

        // Tenant pause guard — blocks team invites when admin has paused the merchant.
        try {
            await assertNotBlocked(resolvedTenantId, "team_invites");
        } catch (err) {
            if (err instanceof TenantBlockedError) {
                return NextResponse.json(blockedResponseBody(err), { status: 423 });
            }
            throw err;
        }

        const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                display_name: displayName || email.split("@")[0],
            },
        });

        if (createError) {
            return NextResponse.json({ error: createError.message }, { status: 400 });
        }

        if (data.user) {
            const profileRole: string = role || "employee";
            // Update the user profile with role and tenant
            const { error: profileError } = await supabaseAdmin
                .from("user_profiles")
                .update({
                    role: profileRole,
                    display_name: displayName || email.split("@")[0],
                    is_active: true,
                    ...(resolvedTenantId ? { current_tenant_id: resolvedTenantId } : {}),
                })
                .eq("id", data.user.id);

            if (profileError) {
                return NextResponse.json(
                    { error: "تم إنشاء الحساب لكن تعذر تحديث الملف الشخصي", userId: data.user.id },
                    { status: 207 }
                );
            }

            // Create the tenant_members entry so RLS grants access. Its role is
            // 'admin' or 'member' — the profile vocabulary (employee, viewer)
            // never goes into this column.
            const { error: memberError } = await supabaseAdmin.from("tenant_members").insert({
                tenant_id: resolvedTenantId,
                user_id: data.user.id,
                role: tenantMemberRoleFor(profileRole),
                invited_by: user.id,
                status: "active",
                joined_at: new Date().toISOString(),
            });

            // Without the membership the account can sign in but reaches no
            // tenant data, so this is not a success.
            if (memberError) {
                console.error("[create-user] tenant_members insert failed:", memberError.message);
                return NextResponse.json(
                    { error: "تم إنشاء الحساب لكن تعذر ربطه بالمتجر", userId: data.user.id },
                    { status: 207 }
                );
            }
        }

        return NextResponse.json({ success: true, userId: data.user?.id });
    } catch (err) {
        console.error("[create-user] unexpected error:", err);
        return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
    }
}
