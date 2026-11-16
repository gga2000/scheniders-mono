import type { NextRequest } from "next/server";

/**
 * The caller's address as Vercel reports it, for per-IP limits on the public
 * auth routes. Mobile carriers share addresses, so limits keyed on it stay
 * generous.
 */
export function requestIp(request: NextRequest): string {
    const real = request.headers.get("x-real-ip");
    if (real) return real.trim();
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
