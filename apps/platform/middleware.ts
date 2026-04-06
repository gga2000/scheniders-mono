import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = [
    '/auth/login',
    '/auth/signup',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/callback',
    '/api/auth/signup',
    '/api/webhooks',
    '/offline',
    '/sw.ts',
    '/_next',
    '/favicon.ico',
    '/icons',
    '/manifest.json',
];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip static assets and public routes
    if (isPublicPath(pathname)) {
        return NextResponse.next();
    }

    // Check for auth token in Authorization header or cookie
    // The app stores tokens in localStorage (not cookies), so we can't
    // enforce auth in the middleware for client-side navigation.
    // The AuthProvider component handles client-side auth guards.
    // Middleware only handles API routes where the token is passed explicitly.

    const response = NextResponse.next();

    // Forward tenant context via response header for API routes
    // that need it before the auth provider is available.
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        response.headers.set('x-forwarded-auth', authHeader);
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
