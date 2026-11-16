import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/*
 * The trial ends after its days OR its order cap, whichever comes first. The
 * banner used to warn only on days, so a shop at order 49 of 50 got no warning
 * before billing started.
 */

const state = vi.hoisted(() => ({
    tenant: null as null | { status: string; plan: string; trial_ends_at: string | null },
    used: undefined as number | undefined,
    cap: undefined as number | null | undefined,
    lock: undefined as undefined | Record<string, unknown>,
    pathname: "/orders",
    section: null as string | null,
}));

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${JSON.stringify(vars)}` : k) }),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => state.pathname,
    useSearchParams: () => new URLSearchParams(state.section ? { section: state.section } : {}),
}));
vi.mock("@/hooks/use-tenant", () => ({ useTenant: () => ({ data: state.tenant }) }));
vi.mock("@/hooks/use-billing", () => ({
    useTrialOrderCount: () => ({ data: state.used }),
    useTrialOrderCap: () => ({ data: state.cap }),
}));
vi.mock("@/hooks/use-billing-lock", () => ({
    useBillingLock: () => ({ data: state.lock }),
    usePayBillingLock: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const { TrialBanner } = await import("./trial-banner");

const inDays = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
    state.tenant = { status: "trial", plan: "starter", trial_ends_at: inDays(6) };
    state.used = 0;
    state.cap = 50;
    state.lock = { locked: false, reason: null, since: null, orders_left: null, allowance: 50, plan: "starter", price_iqd: 9000, balance_iqd: 0, daily_spend_iqd: null, can_pay: true };
    state.pathname = "/orders";
    state.section = null;
});

const locked = (over: Record<string, unknown> = {}) => ({
    locked: true, reason: "trial_ended", since: inDays(-1), orders_left: 12, allowance: 50,
    plan: "starter", price_iqd: 9000, balance_iqd: 0, daily_spend_iqd: null, can_pay: true, ...over,
});
afterEach(cleanup);

describe("TrialBanner", () => {
    it("shows nothing early in the trial", () => {
        const { container } = render(<TrialBanner />);
        expect(container.innerHTML).toBe("");
    });

    it("warns on orders when the order cap is about to run out", () => {
        state.used = 45;
        render(<TrialBanner />);
        expect(screen.getByText('billing.trialOrdersLeft:{"count":5,"cap":50}')).toBeTruthy();
    });

    it("warns on days in the last three days", () => {
        state.tenant = { status: "trial", plan: "starter", trial_ends_at: inDays(2.5) };
        render(<TrialBanner />);
        expect(screen.getByText(/^billing\.trialDaysLeft:\{"count":\d\}$/)).toBeTruthy();
    });

    it("says the trial ended, how many store orders are left, and how to pay", () => {
        state.tenant = { status: "trial", plan: "starter", trial_ends_at: inDays(-1) };
        state.lock = locked();
        render(<TrialBanner />);
        const text = screen.getByTestId("billing-lock-banner").textContent ?? "";
        expect(text).toContain("billing.lock.titleTrial");
        expect(text).toContain('billing.lock.ordersLeft:{"count":12}');
        // An empty wallet cannot pay the month: the action is to top it up.
        expect(text).toContain("billing.lock.topUp");
    });

    it("offers to pay from the wallet when it holds the month", () => {
        state.tenant = { status: "active", plan: "starter", trial_ends_at: null };
        state.lock = locked({ reason: "unpaid", orders_left: 0, balance_iqd: 12000 });
        render(<TrialBanner />);
        const text = screen.getByTestId("billing-lock-banner").textContent ?? "";
        expect(text).toContain("billing.lock.titleUnpaid");
        expect(text).toContain("billing.lock.paused");
        expect(text).toContain("billing.lock.payFromWallet");
    });

    it("leaves a locked page to the lock screen instead of repeating it", () => {
        state.tenant = { status: "trial", plan: "starter", trial_ends_at: inDays(-1) };
        state.lock = locked();
        state.pathname = "/products";
        const { container } = render(<TrialBanner />);
        expect(container.innerHTML).toBe("");
    });

    it("shows on the billing section of settings, where the shop pays, and not on other sections", () => {
        state.tenant = { status: "trial", plan: "starter", trial_ends_at: inDays(-1) };
        state.lock = locked();
        state.pathname = "/settings";
        state.section = "billing";
        render(<TrialBanner />);
        expect(screen.getByTestId("billing-lock-banner")).toBeTruthy();
        cleanup();
        state.section = "team";
        const { container } = render(<TrialBanner />);
        expect(container.innerHTML).toBe("");
    });

    it("never shows for the house tier", () => {
        state.tenant = { status: "trial", plan: "internal", trial_ends_at: inDays(1) };
        state.used = 49;
        const { container } = render(<TrialBanner />);
        expect(container.innerHTML).toBe("");
    });
});
