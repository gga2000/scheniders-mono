import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js Middleware — Supabase session refresh (@supabase/ssr).
 *
 * After the cookie migration the session lives in cookies, so the server can
 * refresh it. Calling supabase.auth.getUser() here rotates the access-token
 * cookie when it's near expiry — server-side, on a fresh connection — which
 * eliminates the old "reopen after idle → token refresh hangs on a stale TCP
 * socket" stall. The rotated cookie is written onto the response so the next
 * client request already has a fresh token.
 *
 * Refresh-only for now: route protection stays in the client auth guard. A
 * server-side unauthenticated→/login redirect can be layered on once the cookie
 * flow is confirmed in production.
 */
export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    // Touch the user to trigger a refresh + cookie rotation when needed.
    // (Do not gate or branch on the result here — refresh is the only job.)
    await supabase.auth.getUser();

    return response;
}

export const config = {
    matcher: [
        // Run on page navigations only. Exclude API routes (they authenticate via
        // the Authorization header) and static assets.
        '/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)',
    ],
};
