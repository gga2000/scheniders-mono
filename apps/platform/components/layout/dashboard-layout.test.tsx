/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import type { ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
const guard = vi.hoisted(() => ({ holding: false }));
vi.mock("@/components/auth/role-guard", () => ({
    // A restricted page still waiting for the member's role.
    PageGuard: ({ children }: { children: ReactNode }) =>
        guard.holding ? <div data-testid="page-skeleton" /> : <>{children}</>,
}));
vi.mock("@/components/billing/trial-banner", () => ({
    TrialBanner: () => <div data-testid="trial-banner" />,
}));
vi.mock("@/components/billing/tenant-paused-banner", () => ({
    TenantPausedBanner: () => <div data-testid="paused-banner" />,
}));
// The lock gate has its own tests (billing-lock-gate.test.tsx); here it lets the page through.
vi.mock("@/components/billing/billing-lock-gate", () => ({
    BillingLockGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./sidebar", () => ({ Sidebar: () => <nav data-testid="oms-sidebar" /> }));
vi.mock("./global-search", () => ({ TopBar: () => <header data-testid="oms-topbar" /> }));

import { DashboardLayout } from "./dashboard-layout";

afterEach(() => {
    cleanup();
    guard.holding = false;
});

describe("DashboardLayout", () => {
    it("wraps ordinary pages in the OMS sidebar and top bar", () => {
        pathname.current = "/orders";
        render(
            <DashboardLayout>
                <p data-testid="page" />
            </DashboardLayout>,
        );
        expect(screen.getByTestId("oms-sidebar")).toBeTruthy();
        expect(screen.getByTestId("oms-topbar")).toBeTruthy();
        expect(screen.getByTestId("page")).toBeTruthy();
    });

    it("gives /store/edit the full viewport but keeps the billing banners (UX-21)", () => {
        pathname.current = "/store/edit";
        render(
            <DashboardLayout>
                <p data-testid="page" />
                <aside data-testid="chat-runtime" />
            </DashboardLayout>,
        );
        expect(screen.queryByTestId("oms-sidebar")).toBeNull();
        expect(screen.queryByTestId("oms-topbar")).toBeNull();
        expect(screen.getByTestId("trial-banner")).toBeTruthy();
        expect(screen.getByTestId("paused-banner")).toBeTruthy();
        // Everything the root layout mounts beside the page still renders.
        expect(screen.getByTestId("page")).toBeTruthy();
        expect(screen.getByTestId("chat-runtime")).toBeTruthy();
    });

    it("paints the sidebar and top bar while a restricted page waits for the role (audit R2 speed #3)", () => {
        pathname.current = "/finances";
        guard.holding = true;
        render(
            <DashboardLayout>
                <p data-testid="page" />
            </DashboardLayout>,
        );
        expect(screen.getByTestId("oms-sidebar")).toBeTruthy();
        expect(screen.getByTestId("oms-topbar")).toBeTruthy();
        expect(screen.getByTestId("page-skeleton")).toBeTruthy();
        expect(screen.queryByTestId("page")).toBeNull();
    });
});
