import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { dashboardHostsFromEnv, dashboardRedirectUrl } from '@/lib/dashboard-host';

/** The dashboard's new address and the old ones that move to it (lib/dashboard-host). */
const DASHBOARD_HOSTS = dashboardHostsFromEnv({
    DASHBOARD_HOST: process.env.DASHBOARD_HOST,
    DASHBOARD_OLD_HOSTS: process.env.DASHBOARD_OLD_HOSTS,
});

/**
 * Next.js Middleware — Supabase session refresh (@supabase/ssr), and the move
 * of dashboard pages from an old address to the new one (lib/dashboard-host).
 *
 * After the cookie migration the session lives in cookies, so the server can
 * refresh it. Calling supabase.auth.getClaims() here rotates the access-token
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
    const moved = dashboardRedirectUrl(DASHBOARD_HOSTS, {
        host: request.headers.get('host'),
        method: request.method,
        pathname: request.nextUrl.pathname,
        search: request.nextUrl.search,
    });
    if (moved) return NextResponse.redirect(moved, 308);

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

    // getClaims refreshes an expiring session (rotating the cookie) and then
    // checks the token against the project's ES256 public key locally, with
    // the key set cached across requests. getUser called Supabase Auth on
    // every page and in-app click: p50 170 ms in Sentry (audit R1 speed #3).
    // (Do not gate or branch on the result here — refresh is the only job.)
    await supabase.auth.getClaims();

    return response;
}

export const config = {
    matcher: [
        // Run on page navigations only. Exclude API routes (they authenticate via
        // the Authorization header), static assets, and the Sentry tunnel
        // (/monitoring), which must accept error reports from signed-out pages,
        // and the Vercel Analytics / Speed Insights endpoints (/_vercel).
        '/((?!api|monitoring|_vercel|_next/static|_next/image|favicon.ico|favicon-|icons|manifest.json|till.webmanifest|sw.js|whatsapp).*)',
    ],
};
