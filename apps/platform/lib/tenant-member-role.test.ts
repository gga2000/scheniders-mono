import { describe, expect, it } from "vitest";
import { tenantMemberRoleFor } from "./tenant-member-role";

describe("tenantMemberRoleFor", () => {
    // tenant_members.role is two-valued (CHECK tenant_members_role_check,
    // migration 20261021090200); user_profiles.role is not.
    it.each([
        ["admin", "admin"],
        ["employee", "member"],
        ["viewer", "member"],
    ] as const)("profile role %s → membership role %s", (profileRole, expected) => {
        expect(tenantMemberRoleFor(profileRole)).toBe(expected);
    });

    it("never grants admin to an unknown role", () => {
        expect(tenantMemberRoleFor("super_admin")).toBe("member");
        expect(tenantMemberRoleFor("")).toBe("member");
    });
});
