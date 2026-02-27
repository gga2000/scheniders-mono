import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function POST(request: Request) {
    try {
        // Verify the requesting user is an admin
        const supabaseUser = await createSupabaseServerClient();
        const { data: { user } } = await supabaseUser.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
        }

        const { data: profile } = await supabaseUser
            .from("user_profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (profile?.role !== "admin") {
            return NextResponse.json({ error: "هذا الإجراء مخصص للمسؤولين فقط" }, { status: 403 });
        }

        // Parse request body
        const { email, password, displayName, role } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" }, { status: 400 });
        }

        // Use service role client to create user without affecting current session
        const supabaseAdmin = createClient(
            env.NEXT_PUBLIC_SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY!,
        );

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
            // Update the user profile with role
            const { error: profileError } = await supabaseAdmin
                .from("user_profiles")
                .update({
                    role: role || "employee",
                    display_name: displayName || email.split("@")[0],
                    is_active: true,
                })
                .eq("id", data.user.id);

            if (profileError) {
                return NextResponse.json(
                    { error: "تم إنشاء الحساب لكن تعذر تحديث الملف الشخصي", userId: data.user.id },
                    { status: 207 }
                );
            }
        }

        return NextResponse.json({ success: true, userId: data.user?.id });
    } catch (err) {
        console.error("Error creating user:", err);
        return NextResponse.json({ error: "حدث خطأ غير متوقع" }, { status: 500 });
    }
}
