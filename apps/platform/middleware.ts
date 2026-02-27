import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Fail-fast env validation for Edge runtime (Zod unavailable in Edge)
function getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`❌ Missing ${key} in environment`);
    }
    return value;
}

const SUPABASE_URL = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

// --- Edge-Compatible Permission Map ---
type UserRole = "admin" | "employee" | "viewer";

const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
    '/admin/data-import': ['admin'],
    '/settings': ['admin'],
    '/analytics': ['admin'],
    '/reports': ['admin'],
    '/team': ['admin'],
    '/printing': ['admin', 'employee'], // Assuming employees can print
    '/products': ['admin', 'employee', 'viewer'],
    '/orders': ['admin', 'employee', 'viewer'],
    '/customers': ['admin', 'employee', 'viewer'],
};

// exact path matches or startsWith matches
function getRequiredRolesForPath(pathname: string): UserRole[] | null {
    // First try exact match
    if (ROUTE_PERMISSIONS[pathname]) {
        return ROUTE_PERMISSIONS[pathname];
    }
    // Then try nested paths (e.g. /settings/team)
    for (const [route, roles] of Object.entries(ROUTE_PERMISSIONS)) {
        if (pathname.startsWith(`${route}/`)) {
            return roles;
        }
    }
    return null;
}

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

    // Check for valid user (more reliable than getSession)
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        // Redirect to login with return URL
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('returnTo', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // --- Role-Based Route Protection ---
    const requiredRoles = getRequiredRolesForPath(pathname);

    if (requiredRoles) {
        // Query user's role from user_profiles
        // In Edge middleware, we use supabase admin or standard client. 
        // User is authenticated, so standard client works for their own profile.
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        const userRole = (profile?.role as UserRole) || 'viewer'; // safe fallback

        if (!requiredRoles.includes(userRole)) {
            // User does not have permission
            // Redirect to a safe page or show access denied
            const deniedUrl = new URL('/orders', request.url);
            deniedUrl.searchParams.set('error', 'access_denied');
            return NextResponse.redirect(deniedUrl);
        }
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
