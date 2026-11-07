import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { NextResponse, type NextRequest } from "next/server";
import { linkTargetAllowed } from "@/lib/auth/link-target";

/**
 * Flow A claim route. Opened by an employee from an admin-generated link.
 * Validates the single-use token, mints a magic-link session for THAT employee
 * (server-side, no real inbox needed), and redirects through it into the Google
 * link flow (/settings?linkGoogle=1 auto-runs linkIdentity). Same auth user, so
 * all their data is preserved; Google becomes an additional sign-in method.
 */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const token = searchParams.get("token");
    const fail = (reason: string) =>
        NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

    if (!token) return fail("link_invalid");

    const admin = createSupabaseServiceClient();

    // Consume the token first, in one statement: unused AND unexpired, so two
    // parallel opens of the same link cannot both get a session.
    const { data: row } = await admin
        .from("account_link_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("token", token)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("id, target_user_id, tenant_id")
        .maybeSingle();

    if (!row) return fail("link_expired");

    // Re-check the target now: memberships may have changed since the link was made.
    if (!(await linkTargetAllowed(admin, row.target_user_id, row.tenant_id))) {
        return fail("link_invalid");
    }

    // The employee's (synthetic) work email — needed to mint the magic link.
    const { data: profile } = await admin
        .from("user_profiles")
        .select("email")
        .eq("id", row.target_user_id)
        .single();
    if (!profile?.email) return fail("link_invalid");

    // Mint a magic link that lands on our cookie callback, then auto-links Google.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
        options: {
            redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent("/settings?linkGoogle=1")}`,
        },
    });
    if (linkErr || !linkData?.properties?.action_link) return fail("link_failed");

    return NextResponse.redirect(linkData.properties.action_link);
}
