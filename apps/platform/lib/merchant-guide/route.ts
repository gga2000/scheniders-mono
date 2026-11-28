// =====================================================================
// Merchant guide — the way to each basics step, click by click
// =====================================================================
// The guide never jumps a new merchant to a step's page. It lights the next
// real thing to click from wherever they are (the menu, the page in it, the
// button on that page) and they click it themselves, so they learn where
// things live. The stop is worked out again after every click, so a
// merchant who wanders off is picked up from the page they are on.
//
// A stop lists what may be on screen, in order, and the first one found
// gets the light. That covers states the guide can't read directly (the
// phone menu open or shut, the editor's pages sheet, a settings screen open
// on a phone) without the pages having to report them.
// =====================================================================

import { FOUNDATION_PLACES, STORE_EDITOR_PATH } from "./steps";
import type { FoundationStep } from "./foundation";
import type { GuideLineId } from "./script";

export interface RouteTarget {
    selector: string;
    line: GuideLineId;
    /** A stop that only explains: the merchant moves on with Next, not a click. */
    explain?: boolean;
    /** Sits in the sidebar, the phone menu or a bottom sheet: the light goes above them. */
    raised?: boolean;
}

export interface RouteStop {
    id: string;
    targets: readonly RouteTarget[];
    /** What the card says while none of the targets is on screen yet (a page still loading). */
    idle: GuideLineId;
}

/** Where a step's way leads. A finished first product leads to the list, never to a second new one. */
export type RouteGoal = FoundationStep | "products-list";

export interface RouteWhere {
    pathname: string;
    /** Below 768px the app's menu sits behind a button at the top. */
    phone: boolean;
    /** The desktop sidebar shows icons only. */
    sidebarCollapsed: boolean;
    /** The merchant read the "empty for now" stop on the products page. */
    emptyRead: boolean;
}

const SIDEBAR_TOGGLE: RouteTarget = { selector: '[data-guide="nav-toggle"]', line: "route.menu", raised: true };
const PHONE_MENU: RouteTarget = { selector: '[data-guide="nav-menu"]', line: "route.menuPhone", raised: true };
/** A settings screen's own back arrow in the store editor. */
const SCREEN_BACK: RouteTarget = { selector: '[data-guide="screen-back"]', line: "route.screenBack" };
const EDITOR_MENU: RouteTarget = { selector: '[data-testid="mobile-editor-menu"]', line: "route.editorMenu" };

const NAV_LINES = { store: "route.store", products: "route.products" } as const satisfies Record<string, GuideLineId>;

/** The app's menu, to one of its pages. Collapsed on a computer, it opens first so the names show. */
function menuStop(page: keyof typeof NAV_LINES, at: RouteWhere): RouteStop {
    const item: RouteTarget = { selector: `[data-guide="nav-${page}"]`, line: NAV_LINES[page], raised: true };
    if (at.phone) return { id: `menu-${page}`, targets: [item, PHONE_MENU], idle: PHONE_MENU.line };
    if (at.sidebarCollapsed) return { id: "menu-open", targets: [SIDEBAR_TOGGLE], idle: SIDEBAR_TOGGLE.line };
    return { id: `menu-${page}`, targets: [item], idle: item.line };
}

/** Inside the store editor, to its shop-details screen. */
function brandKitStop(): RouteStop {
    const item: RouteTarget = { selector: '[data-testid="page-tree-setting-brand_kit"]', line: "route.brandKit", raised: true };
    // Phones keep the editor's settings in a sheet behind the menu button,
    // and an open settings screen hides both: its back arrow comes first.
    return { id: "editor-brand_kit", targets: [item, EDITOR_MENU, SCREEN_BACK], idle: item.line };
}

const LEAVE_EDITOR: RouteStop = {
    id: "editor-leave",
    targets: [
        { selector: '[data-testid="editor-shell-back"]', line: "route.leaveEditor" },
        { selector: '[data-testid="mobile-editor-back"]', line: "route.leaveEditor" },
        SCREEN_BACK,
    ],
    idle: "route.leaveEditor",
};

const STORE_CUSTOMIZE: RouteStop = {
    id: "store-customize",
    targets: [{ selector: '[data-guide="store-customize"]', line: "route.customize" }],
    idle: "route.customize",
};

const PRODUCTS_ADD: RouteTarget = { selector: '[data-guide="products-add"]', line: "route.productsAdd" };
const PRODUCTS_EMPTY: RouteTarget = { selector: '[data-guide="products-empty"]', line: "route.productsEmpty", explain: true };

export function inStoreEditor(pathname: string): boolean {
    return pathname.startsWith(STORE_EDITOR_PATH);
}

/** True on the page the goal's own fields live on. */
export function atGoalPage(goal: RouteGoal, pathname: string): boolean {
    if (goal === "products-list") return pathname === "/products";
    return pathname.startsWith(FOUNDATION_PLACES[goal].path);
}

/**
 * The next thing to click on the way to `goal`, from where the merchant is.
 *
 * In the store editor this is asked only once the step's own field is
 * missing (a settings screen not open yet, or the publish button hidden by
 * one on a phone), so it always answers there. On any other page it
 * answers null once the merchant is on the goal's page.
 */
export function routeStop(goal: RouteGoal, at: RouteWhere): RouteStop | null {
    const { pathname } = at;
    if (goal === "shop" || goal === "open") {
        if (inStoreEditor(pathname)) {
            if (goal === "shop") return brandKitStop();
            // Publish sits in the editor's top bar; on a phone a settings screen covers it.
            return { id: "editor-canvas", targets: [SCREEN_BACK], idle: SCREEN_BACK.line };
        }
        if (pathname === "/store") return STORE_CUSTOMIZE;
        return menuStop("store", at);
    }
    if (atGoalPage(goal, pathname)) return null;
    if (inStoreEditor(pathname)) return LEAVE_EDITOR;
    if (pathname === "/products") {
        const targets = at.emptyRead ? [PRODUCTS_ADD] : [PRODUCTS_EMPTY, PRODUCTS_ADD];
        return { id: "products-add", targets, idle: PRODUCTS_ADD.line };
    }
    return menuStop("products", at);
}
