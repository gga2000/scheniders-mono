import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { activeTenantRole } from "@/lib/auth/active-tenant-role";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
    assertNotBlocked,
    blockedResponseBody,
    TenantBlockedError,
} from "@/lib/restrictions";
import { tenantMemberRoleFor } from "@/lib/tenant-member-role";

const createUserSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(72),
    displayName: z.string().trim().max(80).optional(),
    // Same allowlist as /api/team/invite: a tenant admin must never be able to
    // mint a platform-level role such as super_admin.
    role: z.enum(["admin", "employee", "viewer"]).optional(),
    tenantId: z.string().uuid().optional(),
});

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

        const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            const field = parsed.error.issues[0]?.path[0];
            const message =
                field === "password"
                    ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
                    : field === "role"
                      ? "Invalid role"
                      : "البريد الإلكتروني وكلمة المرور مطلوبان";
            return NextResponse.json({ error: message }, { status: 400 });
        }
        const { email: normalizedEmail, password, role, tenantId } = parsed.data;
        const name = parsed.data.displayName || normalizedEmail.split("@")[0];

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

        // Check tenant-scoped admin role (not global user_profiles.role), from
        // an active membership AND an active profile (F-087).
        if ((await activeTenantRole(user.id, resolvedTenantId)) !== "admin") {
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
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: {
                display_name: name,
            },
        });

        if (createError) {
            // The login already exists (maybe in another store). Never attach an
            // existing account to this store from here: that person has to be
            // invited by email so they accept it themselves.
            if (createError.code === "email_exists") {
                return NextResponse.json(
                    { error: "هذا البريد مسجل مسبقاً. استخدم دعوة البريد الإلكتروني بدلاً من ذلك." },
                    { status: 409 },
                );
            }
            return NextResponse.json({ error: createError.message }, { status: 400 });
        }

        const newUserId = data.user?.id;
        if (!newUserId) {
            return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
        }

        const profileRole = role ?? "employee";

        // No database trigger creates the profile row for a new login, so it is
        // written here. The membership below has a foreign key to it.
        const { error: profileError } = await supabaseAdmin.from("user_profiles").upsert({
            id: newUserId,
            email: normalizedEmail,
            role: profileRole,
            display_name: name,
            is_active: true,
            current_tenant_id: resolvedTenantId,
        });

        // The membership grants access through RLS; its role is admin |
        // employee | viewer (tenant_members_role_check), never a platform role.
        const { error: memberError } = profileError
            ? { error: null }
            : await supabaseAdmin.from("tenant_members").insert({
                  tenant_id: resolvedTenantId,
                  user_id: newUserId,
                  role: tenantMemberRoleFor(profileRole),
                  invited_by: user.id,
                  status: "active",
                  joined_at: new Date().toISOString(),
              });

        // A login with no profile or no membership reaches no store data, so
        // this is a failure: undo the login rather than leave an orphan the
        // admin cannot see or reuse.
        if (profileError || memberError) {
            console.error("[create-user] provisioning failed:", (profileError ?? memberError)?.message);
            await supabaseAdmin.from("user_profiles").delete().eq("id", newUserId);
            const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(newUserId);
            if (rollbackError) {
                console.error("[create-user] rollback failed:", rollbackError.message);
            }
            return NextResponse.json({ error: "تعذر إنشاء المستخدم. حاول مرة أخرى." }, { status: 500 });
        }

        return NextResponse.json({ success: true, userId: newUserId });
    } catch (err) {
        console.error("[create-user] unexpected error:", err);
        return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
    }
}
