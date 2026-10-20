import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { provisionInvitedUserIfNeeded } from '@/lib/team-provisioning';

/**
 * Auth Callback Handler
 * 
 * Handles Supabase auth callbacks for:
 * - Email verification
 * - Password reset links
 * - OAuth redirects
 */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/orders';

    if (code) {
        const response = NextResponse.redirect(`${origin}${next}`);

        const supabase = createServerClient(
            env.NEXT_PUBLIC_SUPABASE_URL,
            env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            response.cookies.set(name, value, options);
                        });
                    },
                },
            }
        );

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            // Auto-provision an invited user (e.g. first Google sign-in whose email
            // is on the team_invites allowlist). No-op if already provisioned or no
            // matching invite. Best-effort — never blocks the redirect.
            const u = data?.user;
            if (u) {
                const meta = u.user_metadata as { full_name?: string; name?: string } | undefined;
                await provisionInvitedUserIfNeeded({
                    id: u.id,
                    email: u.email,
                    name: meta?.full_name ?? meta?.name ?? null,
                });
            }
            return response;
        }
    }

    // If there's an error or no code, redirect to login
    return NextResponse.redirect(`${origin}/login`);
}
