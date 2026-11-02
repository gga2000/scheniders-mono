import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cfg = vi.hoisted(() => ({
    env: { VERCEL_API_TOKEN: "tok", VERCEL_STOREFRONT_PROJECT_ID: "prj_1", VERCEL_TEAM_ID: "team_1" } as Record<string, string | undefined>,
}));
vi.mock("@/lib/env", () => ({ env: cfg.env }));

import { DomainConflictError, provisionCustomDomain } from "./vercel-domains";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();

beforeEach(() => {
    cfg.env.VERCEL_API_TOKEN = "tok";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("provisionCustomDomain", () => {
    it("does nothing without an API token", async () => {
        cfg.env.VERCEL_API_TOKEN = undefined;
        expect(await provisionCustomDomain("shop.example.com")).toBe("not_configured");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("adds the domain to the storefront project and reports it active", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, { name: "shop.example.com" }))
            .mockResolvedValueOnce(json(200, { verified: true }))
            .mockResolvedValueOnce(json(200, { misconfigured: false }));
        expect(await provisionCustomDomain("shop.example.com")).toBe("active");
        const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
        expect(url.pathname).toBe("/v10/projects/prj_1/domains");
        expect(url.searchParams.get("teamId")).toBe("team_1");
        expect(init.method).toBe("POST");
        expect(JSON.parse(String(init.body))).toEqual({ name: "shop.example.com" });
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    });

    it("carries on when the domain is already on this project", async () => {
        fetchMock
            .mockResolvedValueOnce(json(409, { error: { code: "domain_already_exists" } }))
            .mockResolvedValueOnce(json(200, { verified: false }))
            .mockResolvedValueOnce(json(200, { misconfigured: false }));
        expect(await provisionCustomDomain("shop.example.com")).toBe("pending");
    });

    it("reports misconfigured DNS", async () => {
        fetchMock
            .mockResolvedValueOnce(json(200, {}))
            .mockResolvedValueOnce(json(200, { verified: true }))
            .mockResolvedValueOnce(json(200, { misconfigured: true }));
        expect(await provisionCustomDomain("shop.example.com")).toBe("misconfigured");
    });

    it("throws a conflict when another project owns the domain", async () => {
        fetchMock.mockResolvedValueOnce(json(409, { error: { code: "domain_already_in_use" } }));
        await expect(provisionCustomDomain("shop.example.com")).rejects.toBeInstanceOf(DomainConflictError);
    });

    it("throws on any other Vercel failure", async () => {
        fetchMock.mockResolvedValueOnce(json(500, { error: { code: "internal", message: "down" } }));
        await expect(provisionCustomDomain("shop.example.com")).rejects.toThrow(/add domain failed \(500\)/);
    });
});
