import { describe, expect, it } from "vitest";
import { isOAuthClientToken, oauthClientIdOf } from "./oauth-client-token";

const jwt = (claims: Record<string, unknown>) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("oauthClientIdOf", () => {
    it("reads the client of an OAuth-issued token", () => {
        expect(oauthClientIdOf(jwt({ sub: "u", client_id: "c-1" }))).toBe("c-1");
        expect(isOAuthClientToken(jwt({ sub: "u", client_id: "c-1" }))).toBe(true);
    });

    it("treats app session tokens as first-party", () => {
        expect(oauthClientIdOf(jwt({ sub: "u", role: "authenticated" }))).toBeNull();
        expect(oauthClientIdOf(jwt({ sub: "u", client_id: "" }))).toBeNull();
    });

    it("decodes base64url payloads that need padding and use - and _", () => {
        // "~~~" encodes to "fn5-" in base64url, exercising the alphabet swap.
        expect(oauthClientIdOf(jwt({ client_id: "~~~", n: "ÿÿ" }))).toBe("~~~");
    });

    it("returns null for anything that is not a JWT", () => {
        expect(oauthClientIdOf("")).toBeNull();
        expect(oauthClientIdOf("not-a-jwt")).toBeNull();
        expect(oauthClientIdOf("a.@@@.c")).toBeNull();
    });
});
