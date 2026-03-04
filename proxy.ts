import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js Proxy
 * 
 * NOTE: Auth session check removed because Supabase sessions are stored
 * in localStorage (via @supabase/supabase-js createClient), which is
 * invisible to server-side code. Client-side auth guards in
 * auth-provider.tsx and the login page handle route protection instead.
 */
export async function proxy(request: NextRequest) {
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)',
    ],
};
