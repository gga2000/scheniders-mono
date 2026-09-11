import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant", () => ({
    getTenantBySlug: vi.fn(),
    getTenantByCustomDomain: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { GET } from "./route";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { headers } from "next/headers";

type Manifest = Record<string, unknown> & {
    icons?: { src: string; type?: string }[];
};

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

const tenant = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    business_name: "Scheniders Iraq",
    store_config: {},
    store_config_v2: {
        default_locale: "ar",
        brand_kit: {
            identity: {
                name: "شنايدر",
                tagline: { ar: "عطور فخمة", en: "Premium perfume" },
                logo_url: "https://cdn.example/logo.png",
            },
            colors: { primary: "#f7db17", surface: "#fdf8ef" },
        },
    },
    ...over,
});

const call = (slug = "scheniders-iraq") =>
    GET(new Request("https://shop.example/manifest.webmanifest"), {
        params: Promise.resolve({ tenant: slug }),
    });

beforeEach(() => {
    vi.clearAllMocks();
    withHeaders(null);
});

describe("GET /s/[tenant]/manifest.webmanifest", () => {
    it("describes THIS store — its name, tagline, colours and logo", async () => {
        vi.mocked(getTenantBySlug).mockResolvedValue(tenant() as never);
        const res = await call();
        expect(res.headers.get("content-type")).toContain("application/manifest+json");
        const m = (await res.json()) as Manifest;
        expect(m.name).toBe("شنايدر");
        expect(m.description).toBe("عطور فخمة");
        expect(m.theme_color).toBe("#f7db17");
        expect(m.background_color).toBe("#fdf8ef");
        expect(m.icons?.[0].src).toBe("https://cdn.example/logo.png");
        expect(m.display).toBe("standalone");
        // LTR in every locale — the project-wide rule.
        expect(m.dir).toBe("ltr");
        expect(m.lang).toBe("ar");
    });

    it("scopes itself to the store root in both routing modes", async () => {
        vi.mocked(getTenantBySlug).mockResolvedValue(tenant() as never);
        const pathMode = (await (await call()).json()) as Manifest;
        expect(pathMode.start_url).toBe("/s/scheniders-iraq/");
        expect(pathMode.scope).toBe("/s/scheniders-iraq/");

        withHeaders(""); // subdomain / custom domain
        const rootMode = (await (await call()).json()) as Manifest;
        expect(rootMode.start_url).toBe("/");
        expect(rootMode.scope).toBe("/");
    });

    it("invents no icon for a merchant who has not uploaded one", async () => {
        vi.mocked(getTenantBySlug).mockResolvedValue(
            tenant({
                store_config_v2: {
                    default_locale: "ar",
                    brand_kit: { identity: { name: "متجر" }, colors: { primary: "#000", surface: "#fff" } },
                },
            }) as never,
        );
        const m = (await (await call()).json()) as Manifest;
        expect(m.icons).toBeUndefined();
        // Still a valid manifest — the browser just won't offer to install.
        expect(m.name).toBe("متجر");
    });

    it("falls back through the merchant's own artwork, never a default", async () => {
        vi.mocked(getTenantBySlug).mockResolvedValue(
            tenant({
                store_config_v2: {
                    default_locale: "en",
                    brand_kit: {
                        identity: { name: "Shop", favicon_url: "https://cdn.example/fav.png" },
                        colors: { primary: "#111", surface: "#eee" },
                    },
                },
            }) as never,
        );
        const m = (await (await call()).json()) as Manifest;
        expect(m.icons?.[0].src).toBe("https://cdn.example/fav.png");
    });

    it("shortens a long name for the home screen without touching the full one", async () => {
        vi.mocked(getTenantBySlug).mockResolvedValue(
            tenant({ business_name: "A Very Long Storefront Name Indeed", store_config_v2: null }) as never,
        );
        const m = (await (await call()).json()) as Manifest;
        expect(m.name).toBe("A Very Long Storefront Name Indeed");
        expect((m.short_name as string).length).toBeLessThanOrEqual(12);
    });

    it("404s an unknown store, and resolves a custom domain", async () => {
        vi.mocked(getTenantBySlug).mockResolvedValue(null as never);
        expect((await call("nope")).status).toBe(404);

        vi.mocked(getTenantByCustomDomain).mockResolvedValue(tenant() as never);
        const res = await call("__domain__shop.iq");
        expect(res.status).toBe(200);
        expect(vi.mocked(getTenantByCustomDomain)).toHaveBeenCalledWith("shop.iq");
    });
});

describe("the icon does not claim a type it cannot know", () => {
    it.each([
        "https://cdn.example/logo.png",
        "https://cdn.example/logo.jpg",
        "https://cdn.example/logo.svg",
        "https://cdn.example/logo",
    ])("omits `type` for %s", async (logo_url) => {
        // Claiming `image/png` for a JPEG or an SVG makes Chrome discard the
        // icon, which loses the install prompt this route exists to earn.
        // `type` is optional so a server that does not know can stay quiet.
        vi.mocked(getTenantBySlug).mockResolvedValue(
            tenant({
                store_config_v2: {
                    default_locale: "ar",
                    brand_kit: {
                        identity: { name: "شنايدر", logo_url },
                        colors: {},
                    },
                },
            }) as never,
        );
        const m = (await (await call()).json()) as Manifest;
        expect(m.icons?.[0].src).toBe(logo_url);
        expect(m.icons?.[0].type).toBeUndefined();
    });
});
