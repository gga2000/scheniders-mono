// =====================================================================
// Per-tenant sitemap
// =====================================================================
// The storefront had no sitemap at all, and `robots.ts` named none — so
// every store's products, categories and merchant-authored pages were left
// entirely to crawl discovery. That matters most for exactly the pages a
// merchant writes to be found: a guide has no shopper linking to it yet.
//
// One sitemap per tenant, because one store's pages are not another's. The
// URLs are built from the store's own base, so a store on a subdomain or a
// custom domain lists its own hostname rather than the platform path it
// happens to be rendered from.
//
// Only pages that are actually served appear: nothing hidden, nothing
// noindex, nothing scheduled for a future date. A sitemap that lists a 404
// or a page marked noindex is a contradiction a crawler has to resolve, and
// it resolves it by trusting the sitemap less.
// =====================================================================

import { NextResponse } from "next/server";
import {
    findCustomPage,
    listArticleSummaries,
    type CustomPage,
    type StoreConfigV2,
} from "@scheniders/shared";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import { getStorefrontBase } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface Entry {
    loc: string;
    lastmod?: string;
    /** Relative priority within this store. Crawlers treat it as a hint. */
    priority: string;
}

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** ISO date only — a crawler does not need the time an article was saved. */
function isoDate(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const t = Date.parse(value);
    if (Number.isNaN(t)) return undefined;
    return new Date(t).toISOString().slice(0, 10);
}

function render(entries: Entry[]): string {
    const body = entries
        .map((e) => {
            const parts = [`    <loc>${xmlEscape(e.loc)}</loc>`];
            if (e.lastmod) parts.push(`    <lastmod>${e.lastmod}</lastmod>`);
            parts.push(`    <priority>${e.priority}</priority>`);
            return `  <url>\n${parts.join("\n")}\n  </url>`;
        })
        .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** A custom page is servable when it is neither hidden nor marked noindex. */
function isListable(page: CustomPage): boolean {
    return page.hidden !== true && page.meta?.noindex !== true;
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
        return new NextResponse("Not found", { status: 404 });
    }

    const { baseUrl } = await getStorefrontBase(tenantParam);
    const v2 =
        (tenant as { store_config_v2?: StoreConfigV2 | null }).store_config_v2 ?? null;

    const entries: Entry[] = [{ loc: baseUrl || "/", priority: "1.0" }];

    for (const path of ["/products", "/about", "/faq", "/contact"]) {
        entries.push({ loc: `${baseUrl}${path}`, priority: "0.6" });
    }
    for (const path of [
        "/policies/shipping",
        "/policies/returns",
        "/policies/terms",
        "/policies/privacy",
    ]) {
        entries.push({ loc: `${baseUrl}${path}`, priority: "0.3" });
    }

    const [products, categories] = await Promise.all([
        listProducts(tenant.id, { limit: 5000 }),
        listCategories(tenant.id),
    ]);

    for (const c of categories) {
        const slug = c.slug ?? c.id;
        entries.push({
            loc: `${baseUrl}/categories/${encodeURIComponent(slug)}`,
            priority: "0.7",
        });
    }
    for (const p of products) {
        const slug = p.slug ?? p.id;
        entries.push({
            loc: `${baseUrl}/products/${encodeURIComponent(slug)}`,
            lastmod: isoDate(
                (p as { updated_at?: string | null; created_at?: string | null })
                    .updated_at ??
                    (p as { created_at?: string | null }).created_at,
            ),
            priority: "0.8",
        });
    }

    // Guides carry their publish date, and rank above an ordinary custom page:
    // they are written to be found, where a landing page usually is not.
    const articles = listArticleSummaries(v2?.custom_pages, { now: new Date() });
    const articleSlugs = new Set<string>();
    for (const a of articles) {
        const page = findCustomPage(v2?.custom_pages, a.slug);
        if (!page || !isListable(page)) continue;
        articleSlugs.add(a.slug);
        entries.push({
            loc: `${baseUrl}/p/${encodeURIComponent(a.slug)}`,
            lastmod: isoDate(a.published_at),
            priority: "0.7",
        });
    }
    for (const page of v2?.custom_pages ?? []) {
        if (!isListable(page) || articleSlugs.has(page.slug)) continue;
        // A scheduled article is excluded here too: `listArticleSummaries`
        // left it out, so it must not slip back in as an ordinary page.
        if (page.article?.published_at) {
            const t = Date.parse(page.article.published_at);
            if (!Number.isNaN(t) && t > Date.now()) continue;
        }
        entries.push({ loc: `${baseUrl}/p/${encodeURIComponent(page.slug)}`, priority: "0.5" });
    }

    return new NextResponse(render(entries), {
        headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=0, s-maxage=3600",
        },
    });
}
