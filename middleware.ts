import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Allow QStash callbacks to /api/cron/process-checkouts without auth
    if (request.nextUrl.pathname === '/api/cron/process-checkouts') {
        return NextResponse.next()
    }

    // For all other routes, continue with default Next.js behavior
    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
