import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { env } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { isValidSlug, RESERVED_SLUGS, SLUG_PATTERN } from "@/lib/tenant";

/* ─────────────────────────────────────────────────────────────────── */
/* Store-handle claim endpoint (S3 follow-up / UX2-13)                  */
/* ─────────────────────────────────────────────────────────────────── */
/*
 * GET  /api/tenant/slug?slug=<candidate>
 *   → { available: boolean, reason?: "invalid" | "taken" }
 *
 * PATCH /api/tenant/slug   Body: { slug: string }
 *   Renames the caller's tenant slug. Membership + admin role are
 *   verified against `user_profiles` under the caller's own session
 *   (RLS), then the rename runs on the service client:
 *     1. update tenants.slug (DB unique constraint is the final gate)
 *     2. record old_slug → tenant_id in tenant_slug_history so shared
 *        links 301 to the new handle (fail-soft if the table hasn't
 *        been migrated yet — the rename itself still succeeds)
 *     3. drop any history row shadowed by the newly claimed slug
 */

const patchSchema = z.object({
    slug: z.string().min(1).max(64),
});

async function getSessionClient() {
    const cookieStore = await cookies();
    return createServerClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll() {
                    // Reads only — auth verification, no cookie writes here.
                },
            },
        },
    );
}

/** Normalise user input: trim, lowercase (people paste with caps/spaces). */
function normalize(raw: string): string {
    return raw.trim().toLowerCase();
}

export async function GET(request: Request): Promise<NextResponse> {
    const url = new URL(request.url);
    const slug = normalize(url.searchParams.get("slug") ?? "");

    if (!isValidSlug(slug)) {
        return NextResponse.json({ available: false, reason: "invalid" });
    }

    const admin = createSupabaseServiceClient();
    const { data } = await admin
        .from("tenants")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

    if (data) {
        return NextResponse.json({ available: false, reason: "taken" });
    }
    return NextResponse.json({ available: true });
}

export async function PATCH(request: Request): Promise<NextResponse> {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json({ error: "Bad payload" }, { status: 400 });
    }
    const slug = normalize(parsed.data.slug);

    if (!isValidSlug(slug)) {
        const reason = RESERVED_SLUGS.has(slug)
            ? "reserved"
            : !SLUG_PATTERN.test(slug)
              ? "format"
              : "invalid";
        return NextResponse.json({ error: "Invalid slug", reason }, { status: 422 });
    }

    const supabase = await getSessionClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Membership + role, read under the caller's OWN session so RLS is
    // the gate — never trust a client-supplied tenant id.
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("current_tenant_id, role")
        .eq("id", user.id)
        .maybeSingle();
    if (!profile?.current_tenant_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (profile.role !== "admin" && profile.role !== "owner") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const tenantId = profile.current_tenant_id as string;

    const admin = createSupabaseServiceClient();

    const { data: tenant } = await admin
        .from("tenants")
        .select("slug")
        .eq("id", tenantId)
        .maybeSingle();
    if (!tenant) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    const oldSlug = tenant.slug as string;
    if (oldSlug === slug) {
        return NextResponse.json({ ok: true, slug, unchanged: true });
    }

    const { error: updateError } = await admin
        .from("tenants")
        .update({ slug })
        .eq("id", tenantId);
    if (updateError) {
        if ((updateError as { code?: string }).code === "23505") {
            return NextResponse.json(
                { error: "Slug taken", reason: "taken" },
                { status: 409 },
            );
        }
        console.error("[tenant/slug] rename failed:", updateError);
        return NextResponse.json({ error: "Rename failed" }, { status: 500 });
    }

    // History bookkeeping — fail-soft: a missing table (migration not yet
    // applied) must not fail the rename, only the old-link redirect.
    try {
        // The freshly claimed slug shadows any history row pointing at it.
        await admin.from("tenant_slug_history").delete().eq("old_slug", slug);
        await admin
            .from("tenant_slug_history")
            .upsert({ old_slug: oldSlug, tenant_id: tenantId });
    } catch (e) {
        console.warn("[tenant/slug] history bookkeeping skipped:", e);
    }

    return NextResponse.json({ ok: true, slug, previous: oldSlug });
}
