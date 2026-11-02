import { describe, expect, it } from "vitest";
import { describeConsentRequest } from "./consent-details";

describe("describeConsentRequest", () => {
    it("shows the host the user returns to, not the client-chosen name", () => {
        expect(describeConsentRequest({ redirect_uri: "https://claude.ai/api/mcp/auth_callback", scope: "openid email" })).toEqual({
            redirectHost: "claude.ai",
            insecureRedirect: false,
            scopes: ["openid", "email"],
        });
    });

    it("flags a non-https redirect that is not loopback", () => {
        expect(describeConsentRequest({ redirect_uri: "http://evil.example/cb", scope: "" }).insecureRedirect).toBe(true);
        expect(describeConsentRequest({ redirect_uri: "http://localhost:6274/cb", scope: "" }).insecureRedirect).toBe(false);
        expect(describeConsentRequest({ redirect_uri: "http://127.0.0.1:1/cb", scope: "" }).insecureRedirect).toBe(false);
    });

    it("keeps custom-scheme redirects visible", () => {
        const d = describeConsentRequest({ redirect_uri: "cursor://anysphere.cursor-retrieval/oauth/callback", scope: "a  b" });
        expect(d.redirectHost).toBe("cursor://anysphere.cursor-retrieval");
        expect(d.scopes).toEqual(["a", "b"]);
    });

    it("never throws on a malformed redirect uri", () => {
        const d = describeConsentRequest({ redirect_uri: "not a url", scope: "x" });
        expect(d.redirectHost).toBe("not a url");
        expect(d.insecureRedirect).toBe(true);
    });
});
