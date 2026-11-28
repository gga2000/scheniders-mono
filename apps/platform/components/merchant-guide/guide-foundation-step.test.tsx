/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { GUIDE_LINES } from "@/lib/merchant-guide/script";
import type { FoundationStatus, FoundationStep } from "@/lib/merchant-guide/foundation";
import { GuideFoundationStep } from "./guide-foundation-step";
import { useGuideSetup } from "./guide-setup-store";

const nav = vi.hoisted(() => ({ pathname: "/dashboard", push: vi.fn() }));
const layout = vi.hoisted(() => ({ phone: false, collapsed: false }));

vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
    useRouter: () => ({ push: nav.push }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => layout.phone }));
vi.mock("@/hooks/use-sidebar-collapsed", () => ({ useSidebarCollapsed: () => layout.collapsed }));

// jsdom lays nothing out: every element gets a box, so "on screen" means "in the page".
const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = () => DOMRect.fromRect({ x: 40, y: 40, width: 120, height: 32 });
    HTMLElement.prototype.scrollIntoView = () => {};
    nav.pathname = "/dashboard";
    nav.push.mockReset();
    layout.phone = false;
    layout.collapsed = false;
    useGuideSetup.setState({ productDraft: null });
});
afterEach(() => {
    cleanup();
    HTMLElement.prototype.getBoundingClientRect = realRect;
});

const OPEN: FoundationStatus = { shop: false, product: false, delivery: false, open: false };

function renderStep(step: FoundationStep, page: ReactNode, more: { done?: boolean; onBack?: (() => void) | null; onReturn?: () => void } = {}) {
    return render(
        <>
            {page}
            <GuideFoundationStep
                step={step}
                done={more.done ?? false}
                status={OPEN}
                working={null}
                locale="en"
                soundOn={false}
                onToggleSound={() => {}}
                pillLeft={16}
                onBack={more.onBack === undefined ? () => {} : more.onBack}
                onReturn={more.onReturn ?? (() => {})}
            />
        </>,
    );
}

/** The caption lights word by word; the words are all there from the start. */
const caption = (): string => screen.getByTestId("merchant-guide-card").querySelector("p")?.textContent?.trim() ?? "";
const line = (id: keyof typeof GUIDE_LINES): string => GUIDE_LINES[id].en;

describe("GuideFoundationStep: the way to a step", () => {
    it("opens a collapsed menu first, with the light above the sidebar", async () => {
        layout.collapsed = true;
        renderStep("product", <button data-guide="nav-toggle" />);
        await waitFor(() => expect(screen.getByTestId("merchant-guide-spot").dataset.raised).toBe("true"));
        expect(caption()).toBe(line("route.menu"));
        // Outside the app's language provider the card shows its keys.
        expect(screen.getByText("guide.route.waiting")).toBeTruthy();
        expect(screen.queryByTestId("merchant-guide-go")).toBeNull();
    });

    it("explains the empty products page, then lights Add product", async () => {
        nav.pathname = "/products";
        renderStep(
            "product",
            <>
                <div data-guide="products-empty" />
                <button data-guide="products-add" />
            </>,
        );
        await waitFor(() => expect(caption()).toBe(line("route.productsEmpty")));
        fireEvent.click(screen.getByTestId("merchant-guide-next"));
        await waitFor(() => expect(caption()).toBe(line("route.productsAdd")));
        expect(screen.queryByTestId("merchant-guide-next")).toBeNull();
    });

    it("skips the empty-page line when the shop already has products", async () => {
        nav.pathname = "/products";
        renderStep("product", <button data-guide="products-add" />);
        await waitFor(() => expect(caption()).toBe(line("route.productsAdd")));
    });

    it("on a phone lights the menu button until the menu is open", async () => {
        layout.phone = true;
        const { rerender } = renderStep("shop", <button data-guide="nav-menu" />);
        await waitFor(() => expect(caption()).toBe(line("route.menuPhone")));
        rerender(
            <>
                <button data-guide="nav-menu" />
                <a data-guide="nav-store" />
                <GuideFoundationStep
                    step="shop"
                    done={false}
                    status={OPEN}
                    working={null}
                    locale="en"
                    soundOn={false}
                    onToggleSound={() => {}}
                    pillLeft={16}
                    onBack={null}
                    onReturn={() => {}}
                />
            </>,
        );
        await waitFor(() => expect(caption()).toBe(line("route.store")));
    });
});

describe("GuideFoundationStep: going back", () => {
    it("switches the arrow off on the first step", () => {
        renderStep("shop", null, { onBack: null });
        expect((screen.getByTestId("merchant-guide-back") as HTMLButtonElement).disabled).toBe(true);
    });

    it("walks the product's fields back, then the step before", async () => {
        nav.pathname = "/products/new";
        const onBack = vi.fn();
        renderStep(
            "product",
            <>
                <div data-guide="product-name" />
                <div data-guide="product-media" />
            </>,
            { onBack },
        );
        await waitFor(() => expect(caption()).toBe(line("product.name")));
        fireEvent.click(screen.getByTestId("merchant-guide-next"));
        await waitFor(() => expect(caption()).toBe(line("product.photo")));
        fireEvent.click(screen.getByTestId("merchant-guide-back"));
        await waitFor(() => expect(caption()).toBe(line("product.name")));
        expect(onBack).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId("merchant-guide-back"));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("a finished step says so, and Next returns to where the merchant stopped", async () => {
        const onReturn = vi.fn();
        renderStep("shop", <a data-guide="nav-store" />, { done: true, onReturn });
        await waitFor(() => expect(caption()).toBe(line("route.store")));
        expect(screen.getByTestId("merchant-guide-step-done")).toBeTruthy();
        fireEvent.click(screen.getByTestId("merchant-guide-next"));
        expect(onReturn).toHaveBeenCalledTimes(1);
    });

    it("a finished first product leads to the list, not to a second new product", async () => {
        nav.pathname = "/products";
        renderStep("product", <button data-guide="products-add" />, { done: true });
        await waitFor(() => expect(caption()).toBe(line("step.doneAgain")));
        expect(screen.queryByTestId("merchant-guide-spot")).toBeNull();
    });
});

describe("GuideFoundationStep: the first product walks itself", () => {
    it("keeps the light on the field being typed in, and moves on once the merchant leaves it", async () => {
        nav.pathname = "/products/new";
        renderStep(
            "product",
            <>
                <div data-guide="product-name">
                    <input aria-label="name" />
                </div>
                <div data-guide="product-media" />
            </>,
        );
        await waitFor(() => expect(caption()).toBe(line("product.name")));
        const input = screen.getByLabelText("name");
        act(() => input.focus());
        // The first letter fills the name: the light stays while typing goes on (Ali, 28 Nov).
        act(() => useGuideSetup.setState({ productDraft: { name: "u", imageUrl: "", price: 0, stock: 0 } }));
        expect(caption()).toBe(line("product.name"));
        act(() => input.blur());
        await waitFor(() => expect(caption()).toBe(line("product.photo")));
    });
});
