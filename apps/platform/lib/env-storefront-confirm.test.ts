// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts validates server vars only when `window` is undefined, so this file
// runs on node rather than the platform default (jsdom).

const A = "44444444-4444-4444-8444-444444444444";
const B = "55555555-5555-4555-8555-555555555555";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("STOREFRONT_WA_CONFIRM_TENANT_IDS", () => {
    it("accepts a comma-separated list of tenant uuids", async () => {
        vi.stubEnv("STOREFRONT_WA_CONFIRM_TENANT_IDS", `${A}, ${B}`);
        const { env } = await import("./env");
        expect(env.STOREFRONT_WA_CONFIRM_TENANT_IDS).toBe(`${A}, ${B}`);
    });

    it("refuses to boot with an entry that is not a tenant uuid", async () => {
        vi.stubEnv("STOREFRONT_WA_CONFIRM_TENANT_IDS", `${A},scheniders-iraq`);
        await expect(import("./env")).rejects.toThrow(/STOREFRONT_WA_CONFIRM_TENANT_IDS/);
    });

    it("an unset list is undefined (nobody enabled)", async () => {
        vi.stubEnv("STOREFRONT_WA_CONFIRM_TENANT_IDS", "");
        const { env } = await import("./env");
        expect(env.STOREFRONT_WA_CONFIRM_TENANT_IDS).toBeUndefined();
    });
});
