// =====================================================================
// Per-tenant web app manifest
// =====================================================================
// A repeat COD customer should be able to keep the store on their home
// screen instead of searching for it again. That needs a manifest carrying
// THIS store's name, colours and icon — a single shared manifest would
// install every merchant's shop as someone else's.
//
// Everything here is the merchant's real identity or nothing: no icon is
// invented when they haven't uploaded a logo. Store health already tells
// them to (`logo_uploaded`), and a manifest without icons simply means the
// browser won't offer to install — which is the truth, not a broken tile.
import { NextResponse } from "next/server";
import { resolveI18n } from "@scheniders/shared";
import type { StoreConfigV2 } from "@scheniders/shared";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { getStorefrontBase } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Home-screen labels are short; browsers truncate anyway. */
function shortName(name: string): string {
    const trimmed = name.trim();
    return trimmed.length <= 12 ? trimmed : trimmed.slice(0, 12).trim();
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ tenant: string }> },
): Promise<NextResponse> {
    const { tenant: tenantParam } = await params;
    const tenant = tenantParam.startsWith("__domain__")
        ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
        : await getTenantBySlug(tenantParam);
    if (!tenant) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const v2 = (tenant as { store_config_v2?: StoreConfigV2 | null }).store_config_v2 ?? null;
    const identity = v2?.brand_kit?.identity;
    const locale = v2?.default_locale ?? "ar";
    const name = (identity?.name || tenant.business_name || "").trim();
    const tagline = resolveI18n(identity?.tagline, locale).trim();

    // The store's own root, in whichever routing mode this request arrived on:
    // "" for a subdomain or custom domain, "/s/<slug>" for path mode.
    const { storeBase } = await getStorefrontBase(tenantParam);
    const root = `${storeBase}/`;

    // The merchant's uploaded artwork, from the same sources the tab icon
    // reads — logo first here, because a home-screen tile is far larger than
    // a favicon. `sizes: "any"` is honest: we do not know the file's
    // dimensions, and claiming "192x192" for an arbitrary upload would be a
    // guess. Nothing is marked `maskable` either — that promises safe padding
    // we cannot verify.
    const icon =
        identity?.logo_url ||
        identity?.favicon_url ||
        tenant.store_config?.logo_url ||
        tenant.branding?.logo_url ||
        null;

    const colors = v2?.brand_kit?.colors;
    const manifest = {
        name: name || "Store",
        short_name: shortName(name) || "Store",
        ...(tagline ? { description: tagline } : {}),
        start_url: root,
        scope: root,
        id: root,
        display: "standalone",
        orientation: "portrait",
        // LTR only, in every locale — the project-wide rule.
        dir: "ltr",
        lang: locale,
        ...(colors?.surface ? { background_color: colors.surface } : {}),
        ...(colors?.primary ? { theme_color: colors.primary } : {}),
        ...(icon ? { icons: [{ src: icon, sizes: "any", type: "image/png", purpose: "any" }] } : {}),
    };

    return NextResponse.json(manifest, {
        headers: {
            "Content-Type": "application/manifest+json; charset=utf-8",
            // Published config changes rarely; a short shared cache keeps the
            // manifest cheap without stranding a merchant on old branding.
            "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
        },
    });
}
