import { describe, it, expect, vi, beforeEach } from "vitest";

const headerStore = { current: new Map<string, string>() };
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve({ get: (k: string) => headerStore.current.get(k) ?? null }),
}));

import robots from "./robots";

function onHost(host: string, proto = "https"): void {
    headerStore.current = new Map([
        ["host", host],
        ["x-forwarded-host", host],
        ["x-forwarded-proto", proto],
    ]);
}

beforeEach(() => onHost("shop.example.com"));

describe("robots", () => {
    it("blocks the editor draft preview at its real path", async () => {
        // Regression: the path was "/s/_preview/", which matched nothing —
        // the route lives at "/_preview/". A leaked token could get a draft
        // indexed.
        const { rules } = await robots();
        const disallow = ((Array.isArray(rules) ? rules[0] : rules) as { disallow?: string[] })
            .disallow ?? [];
        expect(disallow).toContain("/_preview/");
        expect(disallow).not.toContain("/s/_preview/");
    });

    it("keeps the cart/checkout funnel + api out of the index", async () => {
        const { rules } = await robots();
        const disallow = ((Array.isArray(rules) ? rules[0] : rules) as { disallow?: string[] })
            .disallow ?? [];
        expect(disallow).toContain("/api/");
        expect(disallow).toContain("/s/*/cart");
        expect(disallow).toContain("/s/*/checkout");
    });

    it("blocks the funnel on subdomain/custom-domain stores (root-relative paths)", async () => {
        // The proxy rewrites a custom-domain "/cart" → "/s/<tenant>/cart", so
        // crawlers see "/cart" — "/s/*/cart" alone didn't cover them.
        const { rules } = await robots();
        const disallow = ((Array.isArray(rules) ? rules[0] : rules) as { disallow?: string[] })
            .disallow ?? [];
        expect(disallow).toContain("/cart");
        expect(disallow).toContain("/checkout");
    });
});

describe("robots names a sitemap only where one exists", () => {
    it("points a store on its own domain at its own sitemap", async () => {
        // There was no sitemap at all and robots named none, so every store's
        // products, categories and guides were left entirely to crawl
        // discovery — worst for a new guide nobody links to yet.
        onHost("shop.example.com");
        expect((await robots()).sitemap).toBe("https://shop.example.com/sitemap.xml");
    });

    it("names none on the platform root, where the file is shared", async () => {
        // One /robots.txt serves every path-based store at once, so there is
        // no single sitemap it could honestly point at.
        onHost("localhost");
        expect((await robots()).sitemap).toBeUndefined();
        onHost("www.localhost");
        expect((await robots()).sitemap).toBeUndefined();
    });

    it("names none when the request carries no host", async () => {
        headerStore.current = new Map();
        expect((await robots()).sitemap).toBeUndefined();
    });
});
