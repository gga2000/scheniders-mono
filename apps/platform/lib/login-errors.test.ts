import { describe, expect, it } from "vitest";
import { emailProblem, loginErrorKey } from "./login-errors";

describe("loginErrorKey", () => {
    it("maps wrong credentials by code or by message", () => {
        expect(loginErrorKey({ message: "x", code: "invalid_credentials" })).toBe("login.error.invalid");
        expect(loginErrorKey({ message: "Invalid login credentials" })).toBe("login.error.invalid");
    });
    it("maps an unconfirmed email", () => {
        expect(loginErrorKey({ message: "Email not confirmed", code: "email_not_confirmed" })).toBe("login.error.unconfirmed");
    });
    it("maps rate limits by code or status", () => {
        expect(loginErrorKey({ message: "x", code: "over_request_rate_limit" })).toBe("login.error.rateLimit");
        expect(loginErrorKey({ message: "x", status: 429 })).toBe("login.error.rateLimit");
    });
    it("maps a failed CAPTCHA and a dead connection", () => {
        expect(loginErrorKey({ message: "x", code: "captcha_failed" })).toBe("login.error.captcha");
        expect(loginErrorKey({ message: "TypeError: Failed to fetch", status: 0 })).toBe("login.error.network");
    });
    it("never leaks an unknown server message", () => {
        expect(loginErrorKey({ message: "Database error querying schema", status: 500 })).toBe("login.error.unexpected");
    });
});

describe("emailProblem", () => {
    it("accepts a normal address, with spaces around it", () => {
        expect(emailProblem(" owner@shop.iq ")).toBeNull();
    });
    it("names what is wrong", () => {
        expect(emailProblem("  ")).toBe("login.error.emailRequired");
        expect(emailProblem("owner@shop")).toBe("login.error.emailInvalid");
        expect(emailProblem("owner shop@x.iq")).toBe("login.error.emailInvalid");
    });
});
