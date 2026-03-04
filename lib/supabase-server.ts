import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Create a Supabase client authenticated with a user's access token.
 *
 * After switching from createBrowserClient (cookies) to createClient
 * (localStorage), server-side code can no longer read auth cookies.
 * Instead, client code passes the access token via Authorization header
 * or function argument, and we verify it here.
 *
 * This uses the anon key with the user's JWT set as Authorization,
 * so RLS policies are enforced as the user.
 */
export function createSupabaseServerClientWithToken(accessToken: string) {
    return createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    );
}

/**
 * Create a Supabase client with the service role key.
 * Bypasses RLS — use only for admin operations after verifying the user.
 */
export function createSupabaseServiceClient() {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }
    return createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    );
}

/**
 * Verify a user's access token and return the user object.
 * Uses the service role client to validate the JWT.
 */
export async function verifyAccessToken(accessToken: string) {
    // DIAGNOSTIC: Log token verification attempt
    console.log(`[Auth] Verifying token (first 10 chars): ${accessToken.substring(0, 10)}...`);

    // Instead of using the Service Role Client (which can override Auth headers),
    // we use the normal client configured with the user's access token.
    const supabase = createSupabaseServerClientWithToken(accessToken);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        console.error(`[Auth] Token verification failed:`, error?.message);
        return { user: null, error: error?.message || 'Invalid token' };
    }

    console.log(`[Auth] Verified user:`, user.id);
    return { user, error: null };
}
