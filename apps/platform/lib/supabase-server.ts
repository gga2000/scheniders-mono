import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isOAuthClientToken } from '@scheniders/shared';
import { env } from '@/lib/env';

/**
 * Server entry points refuse tokens issued to a third-party OAuth client (the
 * Claude connector) unless they opt in: only /api/mcp does. See
 * `oauthClientIdOf` in @scheniders/shared.
 */
export type TokenOptions = { allowOAuthClient?: boolean };

export class OAuthClientTokenRefusedError extends Error {
    constructor() {
        super('This sign-in is for the Claude connector and cannot be used here');
    }
}

/**
 * Cookie-based server client (@supabase/ssr).
 *
 * Reads the user's session from the request cookies — the canonical session
 * store after the cookie migration — so Server Components, Route Handlers, and
 * the middleware can authenticate the user WITHOUT the client passing a token.
 * RLS is enforced as the user. Mirrors apps/storefront/lib/supabase/server.ts
 * and the existing auth callback route.
 */
export async function createSupabaseServerClient() {
    const cookieStore = await cookies();
    const client = cookieClient(() => cookieStore.getAll(), cookieStore);
    // A Claude connector token planted in the session cookie is treated as no
    // session at all, so nothing downstream acts on it.
    const { data } = await client.auth.getSession();
    if (data.session && isOAuthClientToken(data.session.access_token)) {
        return cookieClient(() => [], cookieStore);
    }
    return client;
}

function cookieClient(
    getAll: () => { name: string; value: string }[],
    cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
    return createServerClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll,
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options),
                        );
                    } catch {
                        // setAll called from a Server Component — refresh handled in middleware.
                    }
                },
            },
        },
    );
}

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
export function createSupabaseServerClientWithToken(accessToken: string, options: TokenOptions = {}) {
    if (!options.allowOAuthClient && isOAuthClientToken(accessToken)) {
        throw new OAuthClientTokenRefusedError();
    }
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
export async function verifyAccessToken(accessToken: string, options: TokenOptions = {}) {
    if (!options.allowOAuthClient && isOAuthClientToken(accessToken)) {
        return { user: null, error: new OAuthClientTokenRefusedError().message };
    }

    // DIAGNOSTIC: Log token verification attempt
    console.log(`[Auth] Verifying token (first 10 chars): ${accessToken.substring(0, 10)}...`);

    // Instead of using the Service Role Client (which can override Auth headers),
    // we use the normal client configured with the user's access token.
    const supabase = createSupabaseServerClientWithToken(accessToken, options);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        console.error(`[Auth] Token verification failed:`, error?.message);
        return { user: null, error: error?.message || 'Invalid token' };
    }

    console.log(`[Auth] Verified user:`, user.id);
    return { user, error: null };
}
