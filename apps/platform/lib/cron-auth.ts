import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * ORD-A7. Shared authorization for cron endpoints.
 *
 * Five routes had independently written this check as:
 *
 *     if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`)
 *
 * which disables itself when the secret is unset. `CRON_SECRET` is
 * `.optional()` in env.ts and appears in no .env.example, and this project has
 * previously lost environment variables in production without anyone noticing —
 * so "unset" is a real state, not a hypothetical one. On
 * `cleanup-deleted-orders`, that meant an unauthenticated GET could permanently
 * delete orders across every tenant.
 *
 * This fails CLOSED. A cron endpoint with no configured secret is
 * misconfigured, not public. `trial-suspend` and `subscription-renew` already
 * did it this way; the helper exists so the next route copies the right shape.
 *
 * Returns a response to return immediately, or null when the caller is allowed.
 */
export function requireCronAuth(request: Request): NextResponse | null {
    const cronSecret = env.CRON_SECRET;

    if (!cronSecret) {
        console.error("[cron-auth] CRON_SECRET is not set — refusing to run.");
        return NextResponse.json({ error: "Endpoint is not configured." }, { status: 503 });
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return null;
}
