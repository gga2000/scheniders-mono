import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const tableInserts: { table: string; row: Record<string, unknown> }[] = [];
const tableUpserts: { table: string; rows: unknown }[] = [];
const consumeRateLimit = vi.fn();
const verifyTurnstile = vi.fn();
/** Results for the tenants insert, in call order; empty means success. */
const tenantResults: { data: unknown; error: unknown }[] = [];
const slugs = vi.fn();
const slugFree = vi.fn();
const freeSuggestion = vi.fn();

function table(name: string) {
    const chain: Record<string, unknown> = {};
    chain.insert = (row: Record<string, unknown>) => {
        tableInserts.push({ table: name, row });
        return chain;
    };
    chain.upsert = (rows: unknown) => {
        tableUpserts.push({ table: name, rows });
        return Promise.resolve({ error: null });
    };
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.single = () =>
        Promise.resolve(
            (name === "tenants" && tenantResults.shift()) || { data: { id: "tenant-1", slug: "shop" }, error: null },
        );
    chain.then = (resolve: (v: { error: null }) => unknown) => resolve({ error: null });
    return chain;
}

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        auth: { admin: { createUser, deleteUser: vi.fn() } },
        from: (name: string) => table(name),
    }),
}));
vi.mock("@/lib/tenant", () => ({
    generateSlug: () => "shop",
    ensureUniqueSlug: (...args: unknown[]) => slugs(...args),
    isSlugFree: (...args: unknown[]) => slugFree(...args),
    suggestFreeSlug: (...args: unknown[]) => freeSuggestion(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
    rateLimitHeaders: () => ({ "Retry-After": "60" }),
}));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({
    verifyTurnstile: (...args: unknown[]) => verifyTurnstile(...args),
}));
const phoneCode = vi.hoisted(() => ({
    settings: { phone_code: false, welcome: false, welcome_video_url: null as string | null },
    spend: vi.fn(),
    release: vi.fn(),
    link: vi.fn(),
    welcome: vi.fn(),
    later: [] as (() => unknown)[],
}));
vi.mock("@/lib/signup-phone-code", () => ({
    loadSignupWhatsApp: async () => phoneCode.settings,
    spendSignupProof: (...args: unknown[]) => phoneCode.spend(...args),
    releaseSignupProof: (...args: unknown[]) => phoneCode.release(...args),
    linkSignupProof: (...args: unknown[]) => phoneCode.link(...args),
    sendSignupWelcome: (...args: unknown[]) => phoneCode.welcome(...args),
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN: "scheniders.com" } }));
vi.mock("next/server", async (importOriginal) => ({
    ...(await importOriginal<typeof import("next/server")>()),
    after: (task: () => unknown) => phoneCode.later.push(task),
}));

import { AuthApiError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { POST } from "./route";

function request(body: Record<string, unknown>, headers: Record<string, string> = { "x-forwarded-for": "203.0.113.9" }) {
    return new NextRequest("https://app.test/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
}

const base = { email: "a@b.co", password: "password1", business_name: "Shop" };

describe("POST /api/auth/signup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tableInserts.length = 0;
        tableUpserts.length = 0;
        tenantResults.length = 0;
        slugs.mockResolvedValueOnce("shop").mockResolvedValueOnce("shop-1").mockResolvedValue("shop-2");
        consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: null, retryAfterSeconds: 0 });
        createUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
        verifyTurnstile.mockResolvedValue({ ok: true, skipped: false });
        slugFree.mockResolvedValue(true);
        freeSuggestion.mockResolvedValue("noor-2");
        phoneCode.settings = { phone_code: false, welcome: false, welcome_video_url: null };
        phoneCode.spend.mockResolvedValue(true);
        phoneCode.later.length = 0;
    });

    it("ignores a plan sent in the body: the server picks the trial plan", async () => {
        const res = await POST(request({ ...base, plan: "enterprise" }));
        expect(res.status).toBe(201);
        const tenant = tableInserts.find((i) => i.table === "tenants");
        const sub = tableInserts.find((i) => i.table === "subscriptions");
        expect(tenant?.row.plan).toBe("growth");
        expect(sub?.row.plan).toBe("growth");
    });

    it("rate limits per client IP before creating any account", async () => {
        consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date(), retryAfterSeconds: 60 });
        const res = await POST(request(base));
        expect(res.status).toBe(429);
        expect(createUser).not.toHaveBeenCalled();
        expect(consumeRateLimit.mock.calls[0][0]).toBe("signup:203.0.113.9");
    });

    it("checks the captcha token with the client IP before creating any account", async () => {
        const res = await POST(request({ ...base, captcha_token: "tok-1" }));
        expect(res.status).toBe(201);
        expect(verifyTurnstile).toHaveBeenCalledWith("tok-1", "203.0.113.9");
    });

    it("refuses a missing or rejected captcha token and creates nothing", async () => {
        verifyTurnstile.mockResolvedValue({ ok: false, reason: "rejected" });
        const res = await POST(request(base));
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ code: "captcha_failed" });
        expect(createUser).not.toHaveBeenCalled();
        expect(tableInserts).toHaveLength(0);
    });

    it("fails closed when Cloudflare cannot be reached", async () => {
        verifyTurnstile.mockResolvedValue({ ok: false, reason: "unavailable" });
        const res = await POST(request({ ...base, captcha_token: "tok-1" }));
        expect(res.status).toBe(503);
        expect(createUser).not.toHaveBeenCalled();
    });

    it("creates the account unconfirmed, so the owner must open the emailed link", async () => {
        const res = await POST(request(base));
        expect(res.status).toBe(201);
        expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "a@b.co", email_confirm: false }));
        expect(await res.json()).toMatchObject({ confirm_email: true });
    });

    it("refuses a malformed body with 400 and creates nothing", async () => {
        for (const body of [{ ...base, email: 42 }, { ...base, email: "not-an-email" }, { ...base, password: "short" }, { ...base, business_name: "  " }]) {
            const res = await POST(request(body));
            expect(res.status).toBe(400);
        }
        expect(createUser).not.toHaveBeenCalled();
    });

    it("names a password Supabase refuses, with its reasons, so the form can say why under the field", async () => {
        createUser.mockResolvedValue({
            data: { user: null },
            error: new AuthWeakPasswordError("Password is known to be weak and easy to guess", 422, ["pwned"]),
        });
        const res = await POST(request(base));
        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({ code: "weak_password", reasons: ["pwned"] });
        expect(tableInserts).toHaveLength(0);
    });

    it("names an email that already has an account", async () => {
        createUser.mockResolvedValue({
            data: { user: null },
            error: new AuthApiError("A user with this email address has already been registered", 422, "email_exists"),
        });
        const res = await POST(request(base));
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: "email_taken" });
    });

    it("names the field a malformed body is about, so the form can point at it", async () => {
        const res = await POST(request({ ...base, password: "short" }));
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: "invalid", field: "password" });
    });

    it("normalises the email before creating the account", async () => {
        await POST(request({ ...base, email: "  A@B.Co " }));
        expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "a@b.co" }));
    });

    it("picks the next slug when a concurrent sign-up took the same one", async () => {
        tenantResults.push({ data: null, error: { code: "23505", message: "duplicate key" } });
        const res = await POST(request(base));
        expect(res.status).toBe(201);
        const slugsTried = tableInserts.filter((i) => i.table === "tenants").map((i) => i.row.slug);
        expect(slugsTried).toEqual(["shop", "shop-1"]);
    });

    it("starts the subscription at the store's real trial end when the one-trial check already ended it (Fermi B5)", async () => {
        const endedAt = "2026-11-16T10:40:00.000Z";
        tenantResults.push({ data: { id: "tenant-1", slug: "shop" }, error: null });
        tenantResults.push({ data: { trial_ends_at: endedAt }, error: null });
        const res = await POST(request({ ...base, contact_phone: "07701234567" }));
        expect(res.status).toBe(201);
        const sub = tableInserts.find((i) => i.table === "subscriptions");
        expect(sub?.row.current_period_end).toBe(endedAt);
        expect((await res.json()).trial_ends_at).toBe(endedAt);
    });

    it("saves what the store sells and starts it on the first trade's words and attribute sets (B10)", async () => {
        const res = await POST(request({ ...base, business_types: ["perfume", "clothing", "perfume"] }));
        expect(res.status).toBe(201);
        const tenant = tableInserts.find((i) => i.table === "tenants")?.row as {
            business_types: string[];
            store_config_v2: { template: { pack_id: string } };
        };
        expect(tenant.business_types).toEqual(["perfume", "clothing"]);
        expect(tenant.store_config_v2.template.pack_id).toBe("perfume");
        const attributes = tableUpserts.find((u) => u.table === "product_attribute_defs")?.rows as { key: string; tenant_id: string }[];
        expect(attributes.map((a) => a.key)).toEqual(["size_chart", "material", "fit"]);
        expect(attributes.every((a) => a.tenant_id === "tenant-1")).toBe(true);
    });

    it("refuses a trade that is not on the list", async () => {
        const res = await POST(request({ ...base, business_types: ["weapons"] }));
        expect(res.status).toBe(400);
        expect(createUser).not.toHaveBeenCalled();
    });

    it("a sign-up page from before the question still works and starts neutral", async () => {
        const res = await POST(request(base));
        expect(res.status).toBe(201);
        const tenant = tableInserts.find((i) => i.table === "tenants")?.row as { business_types: string[] };
        expect(tenant.business_types).toEqual([]);
        expect(tableUpserts.some((u) => u.table === "product_attribute_defs")).toBe(false);
    });

    it("publishes a designed default store so the new subdomain is never blank", async () => {
        const res = await POST(request({ ...base, contact_phone: "07701234567" }));
        expect(res.status).toBe(201);
        const tenant = tableInserts.find((i) => i.table === "tenants")?.row as {
            config_version: number;
            store_config_v2: { schema_version: number; template: { source: string }; pages: { page_id: string; sections: unknown[] }[]; brand_kit: { identity: { name: string } } };
        };
        expect(tenant.config_version).toBe(2);
        expect(tenant.store_config_v2.schema_version).toBe(2);
        expect(tenant.store_config_v2.template.source).toBe("signup");
        expect(tenant.store_config_v2.brand_kit.identity.name).toBe("Shop");
        const home = tenant.store_config_v2.pages.find((p) => p.page_id === "home");
        expect(home?.sections.length).toBeGreaterThan(0);
    });

    it("opens the store on the address the merchant chose (B11)", async () => {
        const res = await POST(request({ ...base, slug: " Noor-Beauty " }));
        expect(res.status).toBe(201);
        expect(slugFree).toHaveBeenCalledWith("noor-beauty");
        expect(slugs).not.toHaveBeenCalled();
        const tenant = tableInserts.find((i) => i.table === "tenants");
        expect(tenant?.row.slug).toBe("noor-beauty");
    });

    it("refuses a chosen address that is taken, with a free one to suggest, and creates nothing (B11)", async () => {
        slugFree.mockResolvedValue(false);
        const res = await POST(request({ ...base, slug: "noor" }));
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: "slug_taken", suggestion: "noor-2" });
        expect(createUser).not.toHaveBeenCalled();
        expect(tableInserts).toHaveLength(0);
    });

    it("refuses a chosen address that is badly formed or poses as the platform, and creates nothing (B11)", async () => {
        for (const slug of ["no", "noor--x", "admin", "usefermi-shop"]) {
            const res = await POST(request({ ...base, slug }));
            expect(res.status).toBe(422);
            expect((await res.json()).code).toBe("slug_invalid");
        }
        expect(createUser).not.toHaveBeenCalled();
    });

    it("never swaps a chosen address for another when a concurrent sign-up took it first (B11)", async () => {
        tenantResults.push({ data: null, error: { code: "23505", message: "duplicate key" } });
        const res = await POST(request({ ...base, slug: "noor" }));
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe("slug_taken");
        const slugsTried = tableInserts.filter((i) => i.table === "tenants").map((i) => i.row.slug);
        expect(slugsTried).toEqual(["noor"]);
    });

    describe("the owner's WhatsApp number, proven by a code (B11)", () => {
        const PROOF = "c0000000-0000-4000-8000-000000000002";

        it("while the switch is off, keeps the number as typed and checks nothing", async () => {
            const res = await POST(request({ ...base, contact_phone: "0770 123 4567" }));
            expect(res.status).toBe(201);
            const tenant = tableInserts.find((i) => i.table === "tenants");
            expect(tenant?.row).toMatchObject({ contact_phone: "0770 123 4567", contact_phone_verified_at: null });
            expect(phoneCode.spend).not.toHaveBeenCalled();
            expect(phoneCode.later).toHaveLength(0);
        });

        it("while it is on, makes no account without a proven number", async () => {
            phoneCode.settings = { phone_code: true, welcome: false, welcome_video_url: null };
            for (const body of [{ ...base }, { ...base, contact_phone: "07701234567" }, { ...base, contact_phone: "123", phone_proof: PROOF }]) {
                const res = await POST(request(body));
                expect(res.status).toBe(422);
                expect((await res.json()).code).toBe("phone_unverified");
            }
            phoneCode.spend.mockResolvedValue(false);
            const res = await POST(request({ ...base, contact_phone: "07701234567", phone_proof: PROOF }));
            expect(res.status).toBe(422);
            expect(createUser).not.toHaveBeenCalled();
        });

        it("spends the proof for the number in its plain form, and stores it as proven", async () => {
            phoneCode.settings = { phone_code: true, welcome: false, welcome_video_url: null };
            const res = await POST(request({ ...base, contact_phone: "+964 770 123 4567", phone_proof: PROOF }));
            expect(res.status).toBe(201);
            expect(phoneCode.spend).toHaveBeenCalledWith(expect.anything(), PROOF, "07701234567");
            const tenant = tableInserts.find((i) => i.table === "tenants");
            expect(tenant?.row.contact_phone).toBe("07701234567");
            expect(typeof tenant?.row.contact_phone_verified_at).toBe("string");
            expect(phoneCode.link).toHaveBeenCalledWith(expect.anything(), PROOF, "tenant-1");
            expect(phoneCode.release).not.toHaveBeenCalled();
            expect(phoneCode.later).toHaveLength(0);
        });

        it("gives the proof back when the store is not made", async () => {
            phoneCode.settings = { phone_code: true, welcome: false, welcome_video_url: null };
            tenantResults.push({ data: null, error: { code: "XX000", message: "boom" } });
            const res = await POST(request({ ...base, contact_phone: "07701234567", phone_proof: PROOF }));
            expect(res.status).toBe(500);
            expect(phoneCode.release).toHaveBeenCalledWith(expect.anything(), PROOF);
        });

        it("sends the welcome with the store link and the video after answering, when switched on", async () => {
            phoneCode.settings = { phone_code: true, welcome: true, welcome_video_url: "https://youtu.be/abc" };
            const res = await POST(request({ ...base, contact_phone: "07701234567", phone_proof: PROOF }));
            expect(res.status).toBe(201);
            expect(phoneCode.welcome).not.toHaveBeenCalled();
            expect(phoneCode.later).toHaveLength(1);
            await phoneCode.later[0]();
            expect(phoneCode.welcome).toHaveBeenCalledWith(expect.anything(), {
                proof: PROOF,
                tenantId: "tenant-1",
                phone: "07701234567",
                businessName: "Shop",
                storeUrl: "https://shop.scheniders.com",
                videoUrl: "https://youtu.be/abc",
            });
        });
    });
});
