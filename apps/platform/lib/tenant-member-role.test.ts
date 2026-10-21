import { describe, expect, it } from "vitest";
import { tenantMemberRoleFor } from "./tenant-member-role";

describe("tenantMemberRoleFor", () => {
    // tenant_members.role is admin | employee | viewer (CHECK
    // tenant_members_role_check, migration 20261020215422).
    it.each([
        ["admin", "admin"],
        ["employee", "employee"],
        ["viewer", "viewer"],
    ] as const)("profile role %s → membership role %s", (profileRole, expected) => {
        expect(tenantMemberRoleFor(profileRole)).toBe(expected);
    });

    it("never grants admin to an unknown role, and never writes 'member'", () => {
        expect(tenantMemberRoleFor("super_admin")).toBe("employee");
        expect(tenantMemberRoleFor("")).toBe("employee");
        expect(tenantMemberRoleFor("member")).toBe("employee");
    });
});
