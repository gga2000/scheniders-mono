import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js Middleware for Route Protection
 * 
 * This middleware runs on every request to check authentication status.
 * Unauthenticated users are redirected to /login.
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Public routes that don't require authentication
    const publicRoutes = ['/login', '/forgot-password', '/reset-password', '/offline'];
    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

    // Skip middleware for static assets and API routes (except those needing protection)
    const isStaticAsset = pathname.startsWith('/_next') ||
        pathname.startsWith('/icons') ||
        pathname.includes('.') ||
        pathname.startsWith('/api/webhooks') ||
        pathname.startsWith('/api/auth');

    if (isPublicRoute || isStaticAsset) {
        return NextResponse.next();
    }

    // Create Supabase client for server-side session check
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

    // Check for valid user (more reliable than getSession)
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        // Redirect to login with return URL
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('returnTo', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return response;
}

// Configure which routes use this middleware
export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)',
    ],
};
