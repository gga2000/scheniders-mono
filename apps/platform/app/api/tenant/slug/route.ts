import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { normalizeSlug, slugRejection } from "@/lib/tenant-slug";

export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────────── */
/* Store-handle claim endpoint (UX2-13)                                 */
/* ─────────────────────────────────────────────────────────────────── */
/*
 * GET  /api/tenant/slug?slug=<candidate>        (any member)
 *   → { available: boolean, reason?: "format" | "reserved" | "taken" }
 *
 * PATCH /api/tenant/slug   Body: { slug: string } (tenant admin)
 *   Renames the caller's ACTIVE tenant. The tenant comes from
 *   requireRequestCaller (Bearer token → membership-verified active
 *   tenant), never from the request and never from
 *   user_profiles.current_tenant_id, which the user can write through
 *   PostgREST. The rename and the old-slug history row are written by
 *   claim_tenant_slug in one transaction (20261022090000), so a rename can
 *   never land without the redirect that keeps shared links alive.
 */

const patchSchema = z.object({
    slug: z.string().min(1).max(64),
});

/** claim_tenant_slug returns the previous slug. */
const claimResultSchema = z.string();

let _admin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const admin = () => (_admin ??= createSupabaseServiceClient());

export async function GET(request: Request): Promise<NextResponse> {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const slug = normalizeSlug(new URL(request.url).searchParams.get("slug") ?? "");
    const rejection = slugRejection(slug);
    if (rejection) {
        return NextResponse.json({ available: false, reason: rejection });
    }

    // A slug is held by its current tenant AND, once renamed away, by the
    // tenant whose old links redirect through tenant_slug_history. Handing a
    // history slug to anyone else would send every link that store already
    // shared to the new owner's storefront. claim_tenant_slug enforces the
    // same rule in the DB (20261022090000); this answer only has to agree.
    const [current, history] = await Promise.all([
        admin().from("tenants").select("id").eq("slug", slug).maybeSingle(),
        admin().from("tenant_slug_history").select("tenant_id").eq("old_slug", slug).maybeSingle(),
    ]);
    if (current.error || history.error) {
        console.error(
            "[tenant/slug] availability lookup failed:",
            current.error ?? history.error,
        );
        return NextResponse.json({ error: "Availability check failed" }, { status: 500 });
    }
    // The caller's own current slug, and its own old slug, are not "taken"
    // from their point of view.
    const heldByOther =
        (current.data !== null && current.data.id !== caller.tenantId) ||
        (history.data !== null && history.data.tenant_id !== caller.tenantId);
    if (heldByOther) {
        return NextResponse.json({ available: false, reason: "taken" });
    }
    return NextResponse.json({ available: true });
}

export async function PATCH(request: Request): Promise<NextResponse> {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

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

    const slug = normalizeSlug(parsed.data.slug);
    const rejection = slugRejection(slug);
    if (rejection) {
        return NextResponse.json({ error: "Invalid slug", reason: rejection }, { status: 422 });
    }

    const { data, error } = await admin().rpc("claim_tenant_slug", {
        p_tenant: caller.tenantId,
        p_slug: slug,
    });
    if (error) {
        if (error.code === "23505") {
            return NextResponse.json({ error: "Slug taken", reason: "taken" }, { status: 409 });
        }
        if (error.code === "22023") {
            return NextResponse.json({ error: "Invalid slug", reason: "format" }, { status: 422 });
        }
        if (error.code === "P0002") {
            return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
        }
        console.error("[tenant/slug] claim failed:", error);
        return NextResponse.json({ error: "Rename failed" }, { status: 500 });
    }

    const previous = claimResultSchema.safeParse(data);
    if (!previous.success) {
        console.error("[tenant/slug] unexpected claim_tenant_slug result:", data);
        return NextResponse.json({ error: "Rename failed" }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        slug,
        previous: previous.data,
        unchanged: previous.data === slug,
    });
}
