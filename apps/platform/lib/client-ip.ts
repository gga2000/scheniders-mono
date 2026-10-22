/**
 * The caller's IP as reported by the platform edge.
 *
 * On Vercel, `x-forwarded-for` is set by the edge (a client-supplied value is
 * not passed through as the first hop), so its first entry is the client.
 * `x-real-ip` is the fallback for other hosts and local development.
 */
export function clientIp(headers: Headers): string | null {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
    return headers.get("x-real-ip");
}
