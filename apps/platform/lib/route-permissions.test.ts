import { describe, it, expect } from "vitest";
import { canAccessRoute, filterNavItems, filterNavSections, getRouteRule, isRestrictedRoute } from "./route-permissions";
import { PERMISSIONS } from "./permissions";

describe("getRouteRule", () => {
    it("matches a route and the pages nested under it, but not a lookalike prefix", () => {
        expect(getRouteRule("/finances")).not.toBeNull();
        expect(getRouteRule("/finances/anything")).toBe(getRouteRule("/finances"));
        expect(getRouteRule("/financesx")).toBeNull();
        expect(getRouteRule("/")).toBeNull();
    });
});

describe("canAccessRoute", () => {
    const money = ["/finances", "/salaries", "/ads"];

    it.each(money)("lets admins and platform staff open %s", (path) => {
        expect(canAccessRoute(path, "admin", [])).toBe(true);
        expect(canAccessRoute(path, "super_admin", [])).toBe(true);
    });

    it.each(money)("keeps employees and viewers out of %s", (path) => {
        expect(canAccessRoute(path, "employee", [PERMISSIONS.EDIT_ORDERS])).toBe(false);
        expect(canAccessRoute(path, "viewer", [])).toBe(false);
    });

    it.each(money)("lets a non-admin with the financials permission open %s", (path) => {
        expect(canAccessRoute(path, "employee", [PERMISSIONS.VIEW_FINANCIALS])).toBe(true);
    });

    it("keeps the role lists for the other routes", () => {
        expect(canAccessRoute("/settings", "employee", [])).toBe(false);
        expect(canAccessRoute("/team", "admin", [])).toBe(true);
        expect(canAccessRoute("/printing", "employee", [])).toBe(true);
        expect(canAccessRoute("/printing", "viewer", [])).toBe(false);
        expect(canAccessRoute("/shipping-export/b1", "viewer", [])).toBe(false);
        expect(canAccessRoute("/orders/trash", "viewer", [])).toBe(true);
    });

    it("opens Shops & rules to staff, while the till itself needs the selling permission", () => {
        expect(canAccessRoute("/till/shops", "employee", [])).toBe(true);
        expect(canAccessRoute("/till/shops", "viewer", [])).toBe(false);
        expect(canAccessRoute("/till", "employee", [])).toBe(false);
        expect(canAccessRoute("/till", "employee", [PERMISSIONS.TILL_SELL])).toBe(true);
        expect(canAccessRoute("/till/customer", "employee", [])).toBe(false);
    });

    it("does not open admin-only routes to a permission they do not name", () => {
        expect(canAccessRoute("/settings", "employee", [PERMISSIONS.VIEW_FINANCIALS])).toBe(false);
    });

    it("opens no gated route without a role, and every ungated one", () => {
        expect(canAccessRoute("/orders", null, [])).toBe(false);
        expect(canAccessRoute("/", null, [])).toBe(true);
    });
});

describe("isRestrictedRoute", () => {
    it("is true only where some tenant role is turned away", () => {
        expect(isRestrictedRoute("/salaries")).toBe(true);
        expect(isRestrictedRoute("/printing")).toBe(true);
        expect(isRestrictedRoute("/orders")).toBe(false);
        expect(isRestrictedRoute("/")).toBe(false);
    });
});

describe("filterNavItems / filterNavSections", () => {
    const sections = [
        {
            titleKey: "nav.general",
            items: [
                { key: "nav.dashboard", href: "/dashboard" },
                { key: "nav.orders", href: "/orders" },
                { key: "nav.printing", href: "/printing" },
            ],
        },
        {
            titleKey: "nav.groupMoney",
            items: [
                { key: "nav.finances", href: "/finances?tab=overview" },
                { key: "nav.reports", href: "/reports" },
            ],
        },
        {
            titleKey: "nav.groupWorkspace",
            items: [
                { key: "nav.store", href: "/store" },
                {
                    key: "nav.till",
                    href: "/till/shops",
                    subItems: [
                        { key: "nav.tillShops", href: "/till/shops" },
                        { key: "nav.tillScreen", href: "/till" },
                    ],
                },
                { key: "nav.team", href: "/team" },
            ],
        },
    ];
    const keys = (s: { items: { key: string }[] }[]) => s.map((x) => x.items.map((i) => i.key));

    it("shows an admin every link", () => {
        expect(keys(filterNavSections(sections, "admin", []))).toEqual(keys(sections));
    });

    it("hides Finances, Reports and Team from an employee, and drops the emptied section", () => {
        expect(keys(filterNavSections(sections, "employee", [PERMISSIONS.EDIT_ORDERS]))).toEqual([
            ["nav.dashboard", "nav.orders", "nav.printing"],
            ["nav.store", "nav.till"],
        ]);
    });

    it("keeps Shops & rules for staff but shows the selling screen only to those who may sell", () => {
        const tillSubs = (perms: string[]) =>
            filterNavSections(sections, "employee", perms)
                .flatMap((s) => s.items)
                .find((i) => i.key === "nav.till")
                ?.subItems?.map((s) => s.key);
        expect(tillSubs([])).toEqual(["nav.tillShops"]);
        expect(tillSubs([PERMISSIONS.TILL_SELL])).toEqual(["nav.tillShops", "nav.tillScreen"]);
        expect(filterNavSections(sections, "admin", [])[2].items[1].subItems).toHaveLength(2);
    });

    it("shows money links to a non-admin granted the financials permission", () => {
        expect(keys(filterNavSections(sections, "employee", [PERMISSIONS.VIEW_FINANCIALS]))).toEqual([
            ["nav.dashboard", "nav.orders", "nav.printing"],
            ["nav.finances"],
            ["nav.store", "nav.till"],
        ]);
    });

    it("checks the path of a link that carries a query string", () => {
        expect(filterNavItems([{ href: "/finances?tab=cash" }], "viewer", [])).toEqual([]);
        expect(filterNavItems([{ href: "/products?tab=categories" }], "viewer", [])).toHaveLength(1);
    });

    it("shows no gated link while the role is unknown", () => {
        expect(keys(filterNavSections(sections, null, []))).toEqual([["nav.dashboard"], ["nav.store"]]);
    });
});
