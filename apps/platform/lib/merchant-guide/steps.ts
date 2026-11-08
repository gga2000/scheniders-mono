// =====================================================================
// Merchant guide — where each foundation step happens in the app
// =====================================================================
// A step lives on a real page and points at real elements, found by their
// `data-guide` (or existing `data-testid`) attribute. When a step has several
// targets the guide walks them in order (name, then photo, then price...).
// =====================================================================

import type { FoundationStep } from "./foundation";
import type { GuideLineId } from "./script";

/** Store editor screens the guide may open. */
export type GuideEditorScreen = "brand_kit" | "shipping";

export interface GuideTarget {
    selector: string;
    line: GuideLineId;
}

export interface GuideStepPlace {
    /** The page the step happens on (pathname prefix). */
    path: string;
    /** Where "Take me there" goes from any other page. */
    href: string;
    /** On the store editor, the screen that must be open. `null` = the canvas. */
    editorScreen?: GuideEditorScreen | null;
    labelKey: string;
    checkKey: string;
    targets: readonly GuideTarget[];
}

export const STORE_EDITOR_PATH = "/store/edit";

export const FOUNDATION_PLACES: Record<FoundationStep, GuideStepPlace> = {
    shop: {
        path: STORE_EDITOR_PATH,
        href: `${STORE_EDITOR_PATH}?screen=brand_kit`,
        editorScreen: "brand_kit",
        labelKey: "guide.step.shop",
        checkKey: "guide.check.shop",
        targets: [
            { selector: '[data-guide="identity-name"]', line: "shop.name" },
            { selector: '[data-guide="identity-logo"]', line: "shop.logo" },
        ],
    },
    product: {
        path: "/products/new",
        href: "/products/new",
        labelKey: "guide.step.product",
        checkKey: "guide.check.product",
        targets: [
            { selector: '[data-guide="product-name"]', line: "product.name" },
            { selector: '[data-guide="product-media"]', line: "product.photo" },
            { selector: '[data-guide="product-price"]', line: "product.price" },
            { selector: '[data-guide="product-stock"]', line: "product.stock" },
            { selector: '[data-guide="product-save"]', line: "product.save" },
        ],
    },
    delivery: {
        path: STORE_EDITOR_PATH,
        href: `${STORE_EDITOR_PATH}?screen=shipping`,
        editorScreen: "shipping",
        labelKey: "guide.step.delivery",
        checkKey: "guide.check.delivery",
        targets: [{ selector: '[data-guide="shipping-modes"]', line: "delivery.ask" }],
    },
    open: {
        path: STORE_EDITOR_PATH,
        href: STORE_EDITOR_PATH,
        editorScreen: null,
        labelKey: "guide.step.open",
        checkKey: "guide.check.open",
        targets: [{ selector: '[data-testid="publish-button"]', line: "open.publish" }],
    },
};

/** The delivery step's two answers, and the real card each one lights up. */
export const DELIVERY_CHOICES = {
    same: { labelKey: "guide.delivery.same", selector: '[data-testid="shipping-mode-flat"]', line: "delivery.flat" },
    each: { labelKey: "guide.delivery.each", selector: '[data-testid="shipping-mode-by_governorate"]', line: "delivery.byGov" },
} as const satisfies Record<string, { labelKey: string } & GuideTarget>;
export type DeliveryChoice = keyof typeof DELIVERY_CHOICES;

/**
 * The store editor listens for this to open a screen without a reload, so
 * the guide can move between the shop-details and delivery screens while
 * the editor keeps its unsaved state.
 */
export const OPEN_EDITOR_SCREEN_EVENT = "merchant-guide:open-editor-screen";

export function isGuideEditorScreen(value: unknown): value is GuideEditorScreen | null {
    return value === null || value === "brand_kit" || value === "shipping";
}

/** Pages where the guide never shows: sign-in, the setup wizard, the till. */
export function guideHiddenOn(pathname: string): boolean {
    return (
        pathname.startsWith("/login") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/forgot-password") ||
        pathname.startsWith("/reset-password") ||
        pathname.startsWith("/landing") ||
        pathname.startsWith("/oauth") ||
        pathname.startsWith("/store/onboarding") ||
        pathname.startsWith("/till")
    );
}
