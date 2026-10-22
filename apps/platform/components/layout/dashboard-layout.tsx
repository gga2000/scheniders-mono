"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, Suspense } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./global-search";
import { useIsMobile } from "@/hooks/use-mobile";
import { setSidebarCollapsed, useHydrated, useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { cn } from "@/lib/utils";
import { PageGuard } from "@/components/auth/role-guard";
import { TrialBanner } from "@/components/billing/trial-banner";
import { TenantPausedBanner } from "@/components/billing/tenant-paused-banner";

// Sidebar state context — lets child pages know if the sidebar is expanded
const SidebarContext = createContext<{ sidebarExpanded: boolean; setMobileMenuOpen?: (open: boolean) => void }>({ sidebarExpanded: false });
export function useSidebar() { return useContext(SidebarContext); }

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    // The saved preference, server-safe (hooks/use-sidebar-collapsed.ts). The
    // sidebar is keyed on `hydrated` so the saved state replaces the server's
    // default by a fresh mount, not by an animation on every page load.
    const isCollapsed = useSidebarCollapsed();
    const hydrated = useHydrated();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isMobile = useIsMobile();

    const handleSetMobileMenuOpen = useCallback((open: boolean) => {
        setMobileMenuOpen(open);
    }, []);

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!isMobile && mobileMenuOpen) {
            setMobileMenuOpen(false);
        }
    }, [isMobile, mobileMenuOpen]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Check if we are on an auth page
    const isAuthPage = pathname?.startsWith('/login') ||
        pathname?.startsWith('/forgot-password') ||
        pathname?.startsWith('/reset-password') ||
        pathname?.startsWith('/signup') ||
        pathname?.startsWith('/landing');

    if (isAuthPage) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <div key={pathname}>
                    {children}
                </div>
            </div>
        );
    }

    // UX-21: the store-builder editor gets the full viewport — no OMS
    // sidebar/top bar double-chrome around a screen that has its own
    // toolbar and back-navigation. Billing banners stay: they gate
    // whether the store can operate at all. `children` still carries
    // everything the root layout mounts beside the page (ChatRuntime).
    const isImmersivePage = pathname?.startsWith("/store/edit");
    if (isImmersivePage) {
        return (
            <PageGuard>
                <div className="flex h-screen flex-col bg-background text-foreground">
                    <div className="shrink-0">
                        <TrialBanner />
                        <TenantPausedBanner />
                    </div>
                    <div key={pathname} className="min-h-0 flex-1">
                        {children}
                    </div>
                </div>
            </PageGuard>
        );
    }

    const getMainMargin = () => {
        if (!hydrated) return "0px";
        if (isMobile) return "0px";
        return isCollapsed ? "88px" : "272px";
    };

    return (
        <PageGuard>
            <SidebarContext.Provider value={{ sidebarExpanded: !isCollapsed && !isMobile, setMobileMenuOpen: handleSetMobileMenuOpen }}>
                <div className="flex min-h-screen bg-background text-foreground">
                    {isMobile && mobileMenuOpen && (
                        <div
                            className="mobile-overlay active"
                            onClick={() => handleSetMobileMenuOpen(false)}
                        />
                    )}

                    <Suspense fallback={<div className={cn("shrink-0 transition-all duration-500", isCollapsed ? "w-[88px]" : "w-[272px]")} />}>
                        <Sidebar
                            key={hydrated ? "client" : "server"}
                            collapsed={isCollapsed}
                            setCollapsed={setSidebarCollapsed}
                            isMobile={isMobile}
                            mobileMenuOpen={mobileMenuOpen}
                            setMobileMenuOpen={handleSetMobileMenuOpen}
                        />
                    </Suspense>

                    <main
                        className={cn(
                            "flex-1 min-w-0 transition-all duration-500 ease-in-out"
                        )}
                        style={{
                            marginLeft: getMainMargin(),
                            paddingBottom: "0",
                            // Exposes the sidebar offset to the sticky header so its
                            // surface can bleed full-width behind the floating sidebar.
                            ["--app-sidebar-gutter" as string]: getMainMargin(),
                        }}
                    >
                        <TrialBanner />
                        <TenantPausedBanner />
                        <TopBar
                            onMenuClick={() => handleSetMobileMenuOpen(true)}
                            isMobile={isMobile}
                        />

                        <div key={pathname} className="max-w-[1800px] mx-auto">
                            {children}
                        </div>
                    </main>
                </div>
            </SidebarContext.Provider>
        </PageGuard>
    );
}
