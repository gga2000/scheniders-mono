import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { withFailureReport } from "@/lib/job-monitor";
import { readBoot } from "@/lib/boot/read";
import { BootRequestSchema } from "@/lib/boot/schema";

export const dynamic = "force-dynamic";

/** Per-user answers: never kept by a browser or a shared cache. */
const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/boot?path=/dashboard — the first-load read (lib/boot/schema.ts).
 *
 * Signed in by the session cookie, the same one the page's middleware just
 * refreshed. 401 when there is none: the app then signs in or redirects as it
 * always did. A read that fails is reported (withFailureReport) and answers
 * 500; the app then reads the same rows itself.
 */
async function handleGET(request: NextRequest) {
    const parsed = BootRequestSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: PRIVATE });

    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: PRIVATE });

    const user = { userId: claims.sub, supportViewer: claims.app_metadata?.support_viewer === true };
    const payload = await readBoot(client, user, parsed.data, Date.now);
    return NextResponse.json(payload, { headers: PRIVATE });
}

export const GET = withFailureReport("api/boot GET", handleGET);
