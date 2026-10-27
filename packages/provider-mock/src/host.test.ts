import { describe, expect, it } from "vitest";
import { resolveHost } from "./host";

describe("resolveHost", () => {
    it("defaults to 127.0.0.1 and accepts loopback hosts", () => {
        expect(resolveHost({})).toBe("127.0.0.1");
        expect(resolveHost({ PROVIDER_MOCK_HOST: "localhost" })).toBe("localhost");
        expect(resolveHost({ PROVIDER_MOCK_HOST: "::1" })).toBe("::1");
    });

    it("refuses a non-loopback host without the explicit opt-in", () => {
        expect(() => resolveHost({ PROVIDER_MOCK_HOST: "0.0.0.0" })).toThrow(/PROVIDER_MOCK_ALLOW_NON_LOOPBACK=1/);
        expect(() => resolveHost({ PROVIDER_MOCK_HOST: "10.0.0.5", PROVIDER_MOCK_ALLOW_NON_LOOPBACK: "true" })).toThrow();
    });

    it("accepts a non-loopback host with PROVIDER_MOCK_ALLOW_NON_LOOPBACK=1", () => {
        expect(resolveHost({ PROVIDER_MOCK_HOST: "0.0.0.0", PROVIDER_MOCK_ALLOW_NON_LOOPBACK: "1" })).toBe("0.0.0.0");
    });
});
