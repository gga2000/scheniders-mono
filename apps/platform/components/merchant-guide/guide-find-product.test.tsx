// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { GUIDE_LINES } from "@/lib/merchant-guide/script";
import type { FoundationStatus } from "@/lib/merchant-guide/foundation";
import { GuideFindProduct } from "./guide-find-product";
import type { GuideTourRecord } from "./use-merchant-guide-data";

const nav = vi.hoisted(() => ({ pathname: "/products/new", push: vi.fn() }));

vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
    useRouter: () => ({ push: nav.push }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-sidebar-collapsed", () => ({ useSidebarCollapsed: () => false }));

// jsdom lays nothing out: every element gets a box, so "on screen" means "in the page".
const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = () => DOMRect.fromRect({ x: 40, y: 40, width: 120, height: 32 });
    HTMLElement.prototype.scrollIntoView = () => {};
    // The caption reads along word by word; reduced motion shows it whole.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query }) as MediaQueryList);
    nav.pathname = "/products/new";
    nav.push.mockReset();
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    HTMLElement.prototype.getBoundingClientRect = realRect;
});

const STATUS: FoundationStatus = { shop: true, product: true, delivery: false, open: false };
/** Short enough for a test, long enough to see the light stay off first. */
const HINT_MS = 300;

function renderPractice(page: ReactNode, record: GuideTourRecord | undefined, onRecord = vi.fn()) {
    const props = {
        status: STATUS,
        locale: "en" as const,
        soundOn: false,
        onToggleSound: () => {},
        pillLeft: 16,
        saving: false,
        onRecord,
        onBack: () => {},
        hintAfterMs: HINT_MS,
    };
    const view = render(
        <>
            {page}
            <GuideFindProduct record={record} {...props} />
        </>,
    );
    const rerender = (next: GuideTourRecord | undefined) =>
        view.rerender(
            <>
                {page}
                <GuideFindProduct record={next} {...props} />
            </>,
        );
    return { onRecord, rerender };
}

const caption = (): string => screen.getByTestId("merchant-guide-card").querySelector("p")?.textContent?.trim() ?? "";
const line = (id: keyof typeof GUIDE_LINES): string => GUIDE_LINES[id].en;

describe("GuideFindProduct: back to the first product, alone", () => {
    it("starts by taking the merchant to Orders", () => {
        const { onRecord } = renderPractice(null, undefined);
        expect(caption()).toBe(line("practice.intro"));
        fireEvent.click(screen.getByTestId("merchant-guide-next"));
        expect(nav.push).toHaveBeenCalledWith("/orders");
        expect(onRecord).toHaveBeenCalledWith({ started_at: expect.any(String) });
    });

    it("keeps the light off while the merchant tries, then lights the next click", async () => {
        nav.pathname = "/orders";
        renderPractice(<a data-guide="nav-products" />, { started_at: "2026-11-28T10:00:00Z" });
        expect(caption()).toBe(line("practice.find"));
        expect(screen.queryByTestId("merchant-guide-spot")).toBeNull();
        expect(screen.queryByTestId("merchant-guide-next")).toBeNull();
        await waitFor(() => expect(screen.getByTestId("merchant-guide-spot").dataset.raised).toBe("true"));
        expect(caption()).toBe(line("route.products"));
    });

    it("ticks back on the products page, and Next finishes the practice", () => {
        nav.pathname = "/orders";
        const started = { started_at: "2026-11-28T10:00:00Z" };
        const { onRecord, rerender } = renderPractice(null, started);
        nav.pathname = "/products";
        rerender(started);
        expect(caption()).toBe(line("practice.found"));
        expect(screen.getByTestId("merchant-guide-step-done")).toBeTruthy();
        fireEvent.click(screen.getByTestId("merchant-guide-next"));
        expect(onRecord).toHaveBeenCalledWith({ started_at: started.started_at, done_at: expect.any(String) });
    });

    it("doesn't tick the products page it starts from while Orders is still opening", () => {
        nav.pathname = "/products";
        const { rerender } = renderPractice(null, undefined);
        fireEvent.click(screen.getByTestId("merchant-guide-next"));
        expect(nav.push).toHaveBeenCalledWith("/orders");
        // The saved start comes back before the page changes.
        const started = { started_at: "2026-11-28T10:00:00Z" };
        rerender(started);
        expect(caption()).toBe(line("practice.intro"));
        nav.pathname = "/orders";
        rerender(started);
        expect(caption()).toBe(line("practice.find"));
        nav.pathname = "/products";
        rerender(started);
        expect(caption()).toBe(line("practice.found"));
    });

    it("counts the products page after the guide starts over on the way (Ali, 28 Nov: it sent him back to Orders)", () => {
        // The guide waits while Orders loads its list, so it can start over
        // there, or the page reloads: what it knew in between is gone.
        nav.pathname = "/products";
        renderPractice(null, { started_at: "2026-11-28T10:00:00Z" });
        expect(caption()).toBe(line("practice.found"));
        expect(screen.getByTestId("merchant-guide-step-done")).toBeTruthy();
        expect(nav.push).not.toHaveBeenCalled();
    });
});
