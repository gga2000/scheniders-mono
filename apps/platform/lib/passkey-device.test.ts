import { describe, expect, it } from "vitest";
import { passkeyDeviceLabel } from "./passkey-device";

describe("passkeyDeviceLabel", () => {
    it("names the common devices", () => {
        expect(passkeyDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15")).toBe("iPhone");
        expect(passkeyDeviceLabel("Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36")).toBe("Android");
        expect(passkeyDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")).toBe("Mac");
        expect(passkeyDeviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")).toBe("Windows");
    });
    it("is empty when it cannot tell", () => {
        expect(passkeyDeviceLabel(null)).toBe("");
        expect(passkeyDeviceLabel("curl/8.0")).toBe("");
    });
});
