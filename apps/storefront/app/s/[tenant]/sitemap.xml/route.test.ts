import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant", () => ({
    getTenantBySlug: vi.fn(),
    getTenantByCustomDomain: vi.fn(),
}));
vi.mock("@/lib/queries", () => ({ listProductSitemapEntries: vi.fn(), listCategories: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { GET } from "./route";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProductSitemapEntries, listCategories } from "@/lib/queries";
import { headers } from "next/headers";

/** `storeBase: null` means path mode (the proxy sent no x-store-base). */
function withHeaders(storeBase: string | null) {
    vi.mocked(headers).mockResolvedValue({
        get: (k: string) => {
            if (k === "x-store-base") return storeBase;
            if (k === "host") return "shop.example";
            if (k === "x-forwarded-proto") return "https";
            return null;
        },
    } as never);
}

const customPages = [
    { id: "1", slug: "size-guide", sections: [], title: { ar: "دليل المقاسات" } },
    {
        id: "2",
        slug: "how-to-choose",
        sections: [],
        article: { published_at: "2026-09-01" },
    },
    {
        id: "3",
        slug: "coming-soon",
        sections: [],
        article: { published_at: "2099-01-01" },
    },
    { id: "4", slug: "hidden-page", sections: [], hidden: true },
    { id: "5", slug: "noindex-page", sections: [], meta: { noindex: true } },
];

const tenant = {
    id: "t1",
    business_name: "Scheniders Iraq",
    store_config_v2: { default_locale: "ar", custom_pages: customPages },
};

async function body(tenantParam = "my-store"): Promise<string> {
    const res = await GET(new Request("https://shop.example/sitemap.xml"), {
        params: Promise.resolve({ tenant: tenantParam }),
    });
    return res.text();
}

beforeEach(() => {
    vi.clearAllMocks();
    withHeaders("/s/my-store");
    vi.mocked(getTenantBySlug).mockResolvedValue(tenant as never);
    vi.mocked(getTenantByCustomDomain).mockResolvedValue(tenant as never);
    vi.mocked(listProductSitemapEntries).mockResolvedValue([
        { id: "p1", slug: "oud", updated_at: "2026-09-05T10:00:00Z" },
        { id: "p2", slug: null, updated_at: null },
    ]);
    vi.mocked(listCategories).mockResolvedValue([{ id: "c1", slug: "perfume" }] as never);
});

describe("the sitemap exists at all", () => {
    it("serves XML in the sitemap namespace", async () => {
        // Note the namespace is sitemaps.org, plural — the singular spelling
        // makes the whole document invalid, silently.
        const xml = await body();
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    });

    it("404s for a store that does not exist", async () => {
        vi.mocked(getTenantBySlug).mockResolvedValue(null as never);
        const res = await GET(new Request("https://shop.example/sitemap.xml"), {
            params: Promise.resolve({ tenant: "nope" }),
        });
        expect(res.status).toBe(404);
    });
});

describe("what it lists", () => {
    it("lists the store's own pages, products and categories", async () => {
        const xml = await body();
        for (const path of [
            "/s/my-store",
            "/s/my-store/products",
            "/s/my-store/products/oud",
            "/s/my-store/categories/perfume",
            "/s/my-store/faq",
            "/s/my-store/policies/returns",
        ]) {
            expect(xml).toContain(`<loc>https://shop.example${path}</loc>`);
        }
    });

    it("lists guides and ordinary custom pages alike", async () => {
        const xml = await body();
        expect(xml).toContain("/s/my-store/p/how-to-choose");
        expect(xml).toContain("/s/my-store/p/size-guide");
    });

    it("gives a guide its publish date as lastmod", async () => {
        expect(await body()).toContain("<lastmod>2026-09-01</lastmod>");
    });

    it("dates a product by its last edit, and claims nothing when unknown", async () => {
        const xml = await body();
        expect(xml).toContain(
            "<loc>https://shop.example/s/my-store/products/oud</loc>\n    <lastmod>2026-09-05</lastmod>",
        );
        // No slug falls back to the id, which is how the product page resolves.
        expect(xml).toContain(
            "<loc>https://shop.example/s/my-store/products/p2</loc>\n    <priority>",
        );
    });

    it("uses the store's own host in subdomain mode", async () => {
        // A store on its own domain must list its own URLs, not the platform
        // path it happens to be rendered from.
        withHeaders("");
        const xml = await body("__domain__shop.example");
        expect(xml).toContain("<loc>https://shop.example/products</loc>");
        expect(xml).not.toContain("/s/__domain__");
    });
});

describe("what it refuses to list", () => {
    it("omits a hidden page", async () => {
        // Listing a page that 404s teaches a crawler to trust the file less.
        expect(await body()).not.toContain("hidden-page");
    });

    it("omits a page marked noindex", async () => {
        expect(await body()).not.toContain("noindex-page");
    });

    it("omits an article scheduled for the future", async () => {
        // It is excluded as an article; it must not slip back in as an
        // ordinary custom page.
        expect(await body()).not.toContain("coming-soon");
    });

    it("omits the cart and checkout funnel", async () => {
        const xml = await body();
        expect(xml).not.toContain("/cart");
        expect(xml).not.toContain("/checkout");
    });

    it("lists each URL exactly once", async () => {
        const xml = await body();
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        expect(new Set(locs).size).toBe(locs.length);
    });
});
