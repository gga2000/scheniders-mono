import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`❌ Missing ${key} in environment`);
    }
    return value;
}

const SUPABASE_URL = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

/**
 * Next.js 16 Proxy for Route Protection
 * Runs on every request to check authentication status via fast edge cookie validaton.
 */
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const publicRoutes = ['/login', '/forgot-password', '/reset-password', '/offline'];
    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

    const isStaticAsset = pathname.startsWith('/_next') ||
        pathname.startsWith('/icons') ||
        pathname.includes('.') ||
        pathname.startsWith('/api/webhooks') ||
        pathname.startsWith('/api/auth') ||
        pathname === '/api/cron/process-checkouts';

    if (isPublicRoute || isStaticAsset) {
        return NextResponse.next();
    }

    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => {
                        request.cookies.set(name, value);
                    });
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    });
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    // ZERO-LATENCY EDGE CHECK: Read session from cookies instead of full network roundtrip getUser()
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('returnTo', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Note: Role validation has been shifted to components/providers/role-provider.tsx
    // to prevent blocking the edge proxy with heavy database queries.

    return response;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)',
    ],
};
