import { NextResponse, type NextRequest } from "next/server";
import { isSlugFree, suggestFreeSlug } from "@/lib/tenant";
import { normalizeSlug, slugRejection } from "@/lib/tenant-slug";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { reportOrderError } from "@/lib/order-telemetry";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────────── */
/* Is this store address free? (Fermi B11, signup)                      */
/* ─────────────────────────────────────────────────────────────────── */
/*
 * GET /api/auth/slug-available?slug=<candidate>   (no account yet)
 *   → { available: true }
 *   → { available: false, reason: "format" | "reserved" | "taken", suggestion?: string }
 *
 * The signup form asks while the merchant types their store's address. A
 * store address is public (it is the store's link), so answering reveals
 * nothing private; the per-IP limit keeps it from being a cheap scanner.
 * The signup route checks again before it creates anything.
 */

const CHECK_LIMIT = 120;
const CHECK_WINDOW_SECONDS = 10 * 60;


async function handleGET(request: NextRequest): Promise<NextResponse> {
    const limit = await consumeRateLimit(`slug-check:${requestIp(request)}`, CHECK_LIMIT, CHECK_WINDOW_SECONDS);
    if (limit.error) {
        // Fails open, like signup itself, but never silently.
        reportOrderError(new Error(`Rate limiter unavailable: ${limit.error}`), { operation: "slug-check-rate-limit" });
    }
    if (!limit.allowed) {
        return NextResponse.json(
            { error: "Too many checks. Try again shortly." },
            { status: 429, headers: rateLimitHeaders(limit, CHECK_LIMIT) },
        );
    }

    const slug = normalizeSlug(request.nextUrl.searchParams.get("slug") ?? "");
    const rejection = slugRejection(slug);
    if (rejection === "format") {
        return NextResponse.json({ available: false, reason: "format" });
    }
    if (rejection === "reserved") {
        return NextResponse.json({ available: false, reason: "reserved", suggestion: await suggestFreeSlug(slug) });
    }
    if (await isSlugFree(slug)) {
        return NextResponse.json({ available: true });
    }
    return NextResponse.json({ available: false, reason: "taken", suggestion: await suggestFreeSlug(slug) });
}

export const GET = withFailureReport("api/auth/slug-available GET", handleGET);
