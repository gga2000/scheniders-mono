import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { provisionInvitedUserIfNeeded } from '@/lib/team-provisioning';
import { safeRedirectPath } from '@scheniders/shared/safe-redirect-path';

/**
 * Email link handler (password reset, sign-up confirm, email change).
 *
 * The Supabase email templates point their button here, on our own domain,
 * instead of at `<project>.supabase.co/auth/v1/verify`. A sender of
 * scheniders.com whose button opens a foreign supabase.co host is what made
 * Gmail flag the reset email as phishing. Using `token_hash` + verifyOtp also
 * works when the link is opened on a different device or browser than the one
 * that asked for it (the PKCE `code` flow does not).
 *
 * Template link: /api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 */
const otpTypeSchema = z.enum(['recovery', 'signup', 'email', 'email_change', 'invite', 'magiclink']);

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const tokenHash = searchParams.get('token_hash');
    const type = otpTypeSchema.safeParse(searchParams.get('type'));
    const next = safeRedirectPath(searchParams.get('next'));

    if (tokenHash && type.success) {
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

        const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type.data });

        if (!error) {
            const u = data.user;
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

    // Expired, already used or malformed link: a reset link sends the user back
    // to ask for a fresh one; anything else goes to login.
    const fallback = type.success && type.data === 'recovery' ? '/forgot-password?link=expired' : '/login';
    return NextResponse.redirect(`${origin}${fallback}`);
}
