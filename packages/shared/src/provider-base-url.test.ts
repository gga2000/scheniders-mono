import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
    isProductionDeployment,
    parseProviderBaseUrls as parseWith,
    providerBaseUrlSchema,
    type RawEnv,
} from "./provider-base-url";

const SPEC = {
    INTERAKT_API_BASE_URL: "https://api.interakt.ai",
    QSTASH_URL: "https://qstash-us-east-1.upstash.io/",
} as const;

function parseProviderBaseUrls(spec: typeof SPEC, env: RawEnv) {
    return parseWith(env, (production) =>
        z.object({
            INTERAKT_API_BASE_URL: providerBaseUrlSchema(spec.INTERAKT_API_BASE_URL, production),
            QSTASH_URL: providerBaseUrlSchema(spec.QSTASH_URL, production),
        }),
    );
}

describe("parseProviderBaseUrls", () => {
    it("defaults to the real host when unset or blank (trailing slash dropped)", () => {
        expect(parseProviderBaseUrls(SPEC, {})).toEqual({
            INTERAKT_API_BASE_URL: "https://api.interakt.ai",
            QSTASH_URL: "https://qstash-us-east-1.upstash.io",
        });
        expect(parseProviderBaseUrls(SPEC, { INTERAKT_API_BASE_URL: "  " }).INTERAKT_API_BASE_URL).toBe(
            "https://api.interakt.ai",
        );
    });

    it("takes an https override", () => {
        const urls = parseProviderBaseUrls(SPEC, { INTERAKT_API_BASE_URL: "https://mock.example.test/" });
        expect(urls.INTERAKT_API_BASE_URL).toBe("https://mock.example.test");
    });

    it("allows http://localhost and http://127.0.0.1 outside Production", () => {
        for (const VERCEL_ENV of [undefined, "preview", "development"]) {
            const urls = parseProviderBaseUrls(SPEC, {
                VERCEL_ENV,
                INTERAKT_API_BASE_URL: "http://localhost:4010",
                QSTASH_URL: "http://127.0.0.1:4010",
            });
            expect(urls).toEqual({ INTERAKT_API_BASE_URL: "http://localhost:4010", QSTASH_URL: "http://127.0.0.1:4010" });
        }
    });

    it("keys Production on VERCEL_ENV only: NODE_ENV=production (next start in e2e) still accepts the mock", () => {
        const urls = parseProviderBaseUrls(SPEC, { NODE_ENV: "production", INTERAKT_API_BASE_URL: "http://localhost:4010" });
        expect(urls.INTERAKT_API_BASE_URL).toBe("http://localhost:4010");
    });

    it("refuses any non-default host when VERCEL_ENV=production", () => {
        expect(() =>
            parseProviderBaseUrls(SPEC, { VERCEL_ENV: "production", INTERAKT_API_BASE_URL: "http://localhost:4010" }),
        ).toThrow(/INTERAKT_API_BASE_URL: must be the real provider host \(https:\/\/api\.interakt\.ai\)/);
        expect(() =>
            parseProviderBaseUrls(SPEC, { VERCEL_ENV: "production", QSTASH_URL: "https://qstash.upstash.io" }),
        ).toThrow(/QSTASH_URL/);
    });

    it("accepts the default host spelled out in Production", () => {
        const urls = parseProviderBaseUrls(SPEC, {
            VERCEL_ENV: "production",
            QSTASH_URL: "https://qstash-us-east-1.upstash.io",
        });
        expect(urls.QSTASH_URL).toBe("https://qstash-us-east-1.upstash.io");
    });

    it("refuses plain http to a non-local host and non-URLs", () => {
        expect(() => parseProviderBaseUrls(SPEC, { INTERAKT_API_BASE_URL: "http://mock.example.test" })).toThrow(
            /https URL, or http:\/\/localhost/,
        );
        expect(() => parseProviderBaseUrls(SPEC, { INTERAKT_API_BASE_URL: "not a url" })).toThrow(/absolute URL/);
    });

    it("isProductionDeployment is true for VERCEL_ENV=production only", () => {
        expect(isProductionDeployment({ VERCEL_ENV: "production" })).toBe(true);
        expect(isProductionDeployment({ VERCEL_ENV: "preview" })).toBe(false);
        expect(isProductionDeployment({ NODE_ENV: "production" })).toBe(false);
    });
});
