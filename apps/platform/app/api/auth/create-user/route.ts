import { verifyAccessToken, createSupabaseServiceClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

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

        const { data: profile } = await supabaseAdmin
            .from("user_profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (profile?.role !== "admin") {
            return NextResponse.json({ error: "هذا الإجراء مخصص للمسؤولين فقط" }, { status: 403 });
        }

        // Parse request body
        const { email, password, displayName, role, tenantId } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" }, { status: 400 });
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
            // Update the user profile with role and tenant
            const { error: profileError } = await supabaseAdmin
                .from("user_profiles")
                .update({
                    role: role || "employee",
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

            // Create tenant_members entry so RLS grants access
            if (resolvedTenantId) {
                await supabaseAdmin.from("tenant_members").insert({
                    tenant_id: resolvedTenantId,
                    user_id: data.user.id,
                    role: role || "employee",
                    invited_by: user.id,
                    status: "active",
                    joined_at: new Date().toISOString(),
                });
            }
        }

        return NextResponse.json({ success: true, userId: data.user?.id });
    } catch {
        return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
    }
}
