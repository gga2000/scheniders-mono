import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/*
 * Handoff A1: a billing-locked shop keeps its orders, shipping, labels,
 * export, returns and the billing page; every other page shows the lock
 * screen. An unlocked shop, and the house tier, never see it.
 */

const state = vi.hoisted(() => ({
    pathname: "/products",
    section: null as string | null,
    tenant: { status: "trial", plan: "starter" } as null | { status: string; plan: string },
    lock: undefined as undefined | Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
    usePathname: () => state.pathname,
    useSearchParams: () => new URLSearchParams(state.section ? { section: state.section } : {}),
    useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-tenant", () => ({ useTenant: () => ({ data: state.tenant }) }));
vi.mock("@/hooks/use-billing-lock", () => ({
    useBillingLock: (enabled: boolean) => ({ data: enabled ? state.lock : undefined }),
    usePayBillingLock: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/providers/language-provider", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));

const { BillingLockGate } = await import("./billing-lock-gate");
const { useSupportStore } = await import("@/store/use-support-store");

const LOCKED = {
    locked: true, reason: "trial_ended", since: "2026-11-15T18:36:20Z", orders_left: 50, allowance: 50,
    plan: "starter", price_iqd: 9000, balance_iqd: 0, can_pay: true,
};

const show = () => render(<BillingLockGate><p>page</p></BillingLockGate>);

beforeEach(() => {
    state.pathname = "/products";
    state.section = null;
    state.tenant = { status: "trial", plan: "starter" };
    state.lock = LOCKED;
});
afterEach(cleanup);

describe("BillingLockGate", () => {
    it("shows the lock screen on a page a locked shop cannot use", () => {
        show();
        expect(screen.getByTestId("billing-lock-screen")).toBeTruthy();
        expect(screen.queryByText("page")).toBeNull();
    });

    it("keeps the orders page open", () => {
        state.pathname = "/orders";
        show();
        expect(screen.getByText("page")).toBeTruthy();
    });

    it("keeps only the billing section of settings open", () => {
        state.pathname = "/settings";
        state.section = "billing";
        show();
        expect(screen.getByText("page")).toBeTruthy();
        cleanup();
        state.section = "team";
        show();
        expect(screen.getByTestId("billing-lock-screen")).toBeTruthy();
    });

    it("never locks an unlocked shop or the house tier", () => {
        state.lock = { ...LOCKED, locked: false, reason: null };
        show();
        expect(screen.getByText("page")).toBeTruthy();
        cleanup();
        state.lock = LOCKED;
        state.tenant = { status: "trial", plan: "internal" };
        show();
        expect(screen.getByText("page")).toBeTruthy();
    });

    it("opens the support chat with the lock attached", () => {
        show();
        fireEvent.click(screen.getByText("support.contactButton"));
        const support = useSupportStore.getState();
        expect(support.isOpen).toBe(true);
        expect(support.errorPrefill?.errorCode).toBe("billing.lock.titleTrial");
    });

    it("renders the page while the lock is still loading", () => {
        state.lock = undefined;
        show();
        expect(screen.getByText("page")).toBeTruthy();
    });
});
