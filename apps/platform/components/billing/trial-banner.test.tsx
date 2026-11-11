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
}));

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (k: string) => k }),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/orders",
}));
vi.mock("@/hooks/use-tenant", () => ({ useTenant: () => ({ data: state.tenant }) }));
vi.mock("@/hooks/use-billing", () => ({
    useTrialOrderCount: () => ({ data: state.used }),
    useTrialOrderCap: () => ({ data: state.cap }),
}));

const { TrialBanner } = await import("./trial-banner");

const inDays = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
    state.tenant = { status: "trial", plan: "starter", trial_ends_at: inDays(6) };
    state.used = 0;
    state.cap = 50;
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
        expect(screen.getByText("billing.trialOrdersLeft")).toBeTruthy();
    });

    it("warns on days in the last three days", () => {
        state.tenant = { status: "trial", plan: "starter", trial_ends_at: inDays(2.5) };
        render(<TrialBanner />);
        expect(screen.getByText("billing.trialDaysLeft")).toBeTruthy();
    });

    it("never shows for the house tier", () => {
        state.tenant = { status: "trial", plan: "internal", trial_ends_at: inDays(1) };
        state.used = 49;
        const { container } = render(<TrialBanner />);
        expect(container.innerHTML).toBe("");
    });
});
