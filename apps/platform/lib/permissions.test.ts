import { describe, it, expect } from "vitest";
import { applyPermissionOverrides, isTenantRole, resolveEffectiveRole } from "./permissions";

describe("resolveEffectiveRole", () => {
    it("uses the tenant membership role, whatever the global role says", () => {
        expect(resolveEffectiveRole("admin", "employee")).toBe("employee");
        expect(resolveEffectiveRole("admin", "viewer")).toBe("viewer");
        expect(resolveEffectiveRole("employee", "admin")).toBe("admin");
    });

    it("keeps platform staff (global super_admin) a superset in every tenant", () => {
        expect(resolveEffectiveRole("super_admin", "employee")).toBe("super_admin");
        expect(resolveEffectiveRole("super_admin", null)).toBe("super_admin");
    });

    it("gives no role without an active membership or with an unknown value", () => {
        expect(resolveEffectiveRole("admin", null)).toBeNull();
        expect(resolveEffectiveRole("admin", undefined)).toBeNull();
        expect(resolveEffectiveRole("admin", "member")).toBeNull();
        expect(resolveEffectiveRole("employee", "super_admin")).toBeNull();
    });
});

describe("isTenantRole", () => {
    it("accepts exactly the tenant_members vocabulary", () => {
        expect(["admin", "employee", "viewer"].every(isTenantRole)).toBe(true);
        expect(isTenantRole("super_admin")).toBe(false);
        expect(isTenantRole("member")).toBe(false);
        expect(isTenantRole(null)).toBe(false);
    });
});

describe("applyPermissionOverrides", () => {
    it("adds granted overrides and removes revoked ones", () => {
        const perms = applyPermissionOverrides(
            ["orders.view", "orders.edit"],
            [
                { permission: "system.financials.view", is_granted: true },
                { permission: "orders.edit", is_granted: false },
            ],
        );
        expect(perms.sort()).toEqual(["orders.view", "system.financials.view"]);
    });

    it("returns the role permissions unchanged without overrides", () => {
        expect(applyPermissionOverrides(["orders.view"], [])).toEqual(["orders.view"]);
    });
});
