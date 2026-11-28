import { describe, expect, it } from "vitest";
import { atGoalPage, routeStop, type RouteWhere } from "./route";
import { GUIDE_LINES } from "./script";

const desk = (pathname: string, more: Partial<RouteWhere> = {}): RouteWhere => ({
    pathname,
    phone: false,
    sidebarCollapsed: false,
    emptyRead: false,
    ...more,
});
const phone = (pathname: string, more: Partial<RouteWhere> = {}): RouteWhere => desk(pathname, { phone: true, ...more });

const selectors = (where: RouteWhere, goal: Parameters<typeof routeStop>[0]): string[] =>
    routeStop(goal, where)?.targets.map((t) => t.selector) ?? [];

describe("routeStop: the first product", () => {
    it("opens a collapsed sidebar before anything else, so the page names show", () => {
        const stop = routeStop("product", desk("/dashboard", { sidebarCollapsed: true }));
        expect(stop?.id).toBe("menu-open");
        expect(stop?.targets).toEqual([expect.objectContaining({ selector: '[data-guide="nav-toggle"]', raised: true })]);
    });

    it("lights Products in an open sidebar", () => {
        expect(selectors(desk("/orders"), "product")).toEqual(['[data-guide="nav-products"]']);
    });

    it("on a phone lights Products when the menu is open, else the menu button", () => {
        expect(selectors(phone("/dashboard"), "product")).toEqual(['[data-guide="nav-products"]', '[data-guide="nav-menu"]']);
        // The phone has no sidebar, so its collapsed setting never matters.
        expect(selectors(phone("/dashboard", { sidebarCollapsed: true }), "product")).toEqual([
            '[data-guide="nav-products"]',
            '[data-guide="nav-menu"]',
        ]);
    });

    it("explains the empty products page once, then points at Add product", () => {
        const first = routeStop("product", desk("/products"));
        expect(first?.targets.map((t) => [t.selector, !!t.explain])).toEqual([
            ['[data-guide="products-empty"]', true],
            ['[data-guide="products-add"]', false],
        ]);
        // A shop with products has no empty card: the add button is the first thing found.
        expect(first?.idle).toBe("route.productsAdd");
        expect(selectors(desk("/products", { emptyRead: true }), "product")).toEqual(['[data-guide="products-add"]']);
    });

    it("hands over to the field walk on the new-product page", () => {
        expect(routeStop("product", desk("/products/new"))).toBeNull();
    });

    it("leaves the store editor first, on a computer or a phone", () => {
        const stop = routeStop("product", desk("/store/edit"));
        expect(stop?.id).toBe("editor-leave");
        expect(stop?.targets.map((t) => t.selector)).toEqual([
            '[data-testid="editor-shell-back"]',
            '[data-testid="mobile-editor-back"]',
            '[data-guide="screen-back"]',
        ]);
    });

    it("from another product's page goes back through the menu", () => {
        expect(routeStop("product", desk("/products/abc/edit"))?.id).toBe("menu-products");
    });
});

describe("routeStop: shop details and opening", () => {
    it("goes through the menu to Store, then Customize", () => {
        expect(routeStop("shop", desk("/dashboard", { sidebarCollapsed: true }))?.id).toBe("menu-open");
        expect(selectors(desk("/dashboard"), "shop")).toEqual(['[data-guide="nav-store"]']);
        expect(selectors(desk("/store"), "open")).toEqual(['[data-guide="store-customize"]']);
    });

    it("in the editor lights the settings screen, behind the phone menu or an open screen", () => {
        expect(selectors(desk("/store/edit"), "shop")).toEqual([
            '[data-testid="page-tree-setting-brand_kit"]',
            '[data-testid="mobile-editor-menu"]',
            '[data-guide="screen-back"]',
        ]);
    });

    it("publishing only needs the open screen closed (phones hide the button behind it)", () => {
        expect(selectors(phone("/store/edit"), "open")).toEqual(['[data-guide="screen-back"]']);
        expect(routeStop("open", desk("/products"))?.id).toBe("menu-store");
    });
});

describe("routeStop: a finished first product, revisited", () => {
    it("ends at the products list, never at a second new product", () => {
        expect(routeStop("products-list", desk("/products"))).toBeNull();
        expect(routeStop("products-list", desk("/store/edit"))?.id).toBe("editor-leave");
        expect(routeStop("products-list", desk("/products/new"))?.id).toBe("menu-products");
        expect(atGoalPage("products-list", "/products/new")).toBe(false);
    });
});

describe("route lines", () => {
    it("has an Arabic and an English line for every stop", () => {
        const wheres = [desk("/dashboard"), desk("/dashboard", { sidebarCollapsed: true }), phone("/dashboard"), desk("/store"), desk("/store/edit"), desk("/products")];
        for (const goal of ["shop", "product", "open", "products-list"] as const) {
            for (const where of wheres) {
                const stop = routeStop(goal, where);
                if (!stop) continue;
                for (const id of [stop.idle, ...stop.targets.map((t) => t.line)]) {
                    expect(GUIDE_LINES[id].ar.length).toBeGreaterThan(0);
                    expect(GUIDE_LINES[id].en.length).toBeGreaterThan(0);
                }
            }
        }
    });
});
