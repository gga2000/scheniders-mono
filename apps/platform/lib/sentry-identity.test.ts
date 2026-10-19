import { describe, it, expect } from "vitest";
import { sentryIdentityFor } from "./sentry-identity";

describe("sentryIdentityFor", () => {
    it("attributes a signed-in session to its user, tenant and role", () => {
        expect(sentryIdentityFor("u1", "a@example.com", "t1", "admin")).toEqual({
            user: { id: "u1", email: "a@example.com" },
            tags: { tenant_id: "t1", user_role: "admin" },
        });
    });

    it("marks a missing tenant or role explicitly rather than leaving the tag off", () => {
        expect(sentryIdentityFor("u1", null, null, null)).toEqual({
            user: { id: "u1", email: undefined },
            tags: { tenant_id: "none", user_role: "unknown" },
        });
    });

    it("clears everything on sign-out, even if stale tenant and role are still in state", () => {
        expect(sentryIdentityFor(null, null, "t1", "admin")).toEqual({
            user: null,
            tags: { tenant_id: undefined, user_role: undefined },
        });
    });
});
