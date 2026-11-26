import { describe, expect, it } from "vitest";
import { turnstileErrorKind } from "./turnstile-errors";

describe("turnstileErrorKind", () => {
    it("treats a web address missing from the widget as a setup error", () => {
        expect(turnstileErrorKind("110200")).toBe("setup");
    });

    it("treats a bad or disabled site key as a setup error", () => {
        for (const code of ["110100", "110110", "400020", "400070"]) {
            expect(turnstileErrorKind(code)).toBe("setup");
        }
    });

    it("treats an unsupported browser as a browser error", () => {
        expect(turnstileErrorKind("110500")).toBe("browser");
        expect(turnstileErrorKind("110510")).toBe("browser");
    });

    it("leaves timeouts, failed challenges and unknown codes to Turnstile's own retry", () => {
        for (const code of ["110600", "110620", "300010", "600010", "", null, undefined]) {
            expect(turnstileErrorKind(code)).toBe("transient");
        }
    });
});
