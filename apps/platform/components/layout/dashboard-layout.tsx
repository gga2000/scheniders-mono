"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./global-search";
import { MobileNav } from "./mobile-nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { PageGuard } from "@/components/auth/role-guard";

// Sidebar state context — lets child pages know if the sidebar is expanded
const SidebarContext = createContext<{ sidebarExpanded: boolean; setMobileMenuOpen?: (open: boolean) => void }>({ sidebarExpanded: false });
export function useSidebar() { return useContext(SidebarContext); }

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    // Default to collapsed to prevent open→close flicker on refresh.
    // Synchronously read localStorage during init for instant correct state.
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("sidebarCollapsed");
            // Default to collapsed (true) if no preference saved
            return saved !== "false";
        }
        return true;
    });
    const [mounted, setMounted] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isMobile = useIsMobile();

    // Check if we are on an auth page
    const isAuthPage = pathname?.startsWith('/login') ||
        pathname?.startsWith('/forgot-password') ||
        pathname?.startsWith('/reset-password');

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted) {
            localStorage.setItem("sidebarCollapsed", String(isCollapsed));
        }
    }, [isCollapsed, mounted]);

    useEffect(() => {
        if (!isMobile && mobileMenuOpen) {
            setMobileMenuOpen(false);
        }
    }, [isMobile, mobileMenuOpen]);

    if (isAuthPage) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <div key={pathname}>
                    {children}
                </div>
            </div>
        );
    }

    const getMainMargin = () => {
        if (!mounted) return "0px";
        if (isMobile) return "0px";
        return isCollapsed ? "88px" : "272px";
    };

    return (
        <PageGuard>
            <SidebarContext.Provider value={{ sidebarExpanded: !isCollapsed && !isMobile, setMobileMenuOpen }}>
                <div className="flex min-h-screen bg-background text-foreground">
                    {isMobile && mobileMenuOpen && (
                        <div
                            className="mobile-overlay active"
                            onClick={() => setMobileMenuOpen(false)}
                        />
                    )}

                    <Sidebar
                        collapsed={isCollapsed}
                        setCollapsed={setIsCollapsed}
                        isMobile={isMobile}
                        mobileMenuOpen={mobileMenuOpen}
                        setMobileMenuOpen={setMobileMenuOpen}
                    />

                    <main
                        className={cn(
                            "flex-1 min-w-0 transition-all duration-500 ease-in-out"
                        )}
                        style={{
                            marginLeft: getMainMargin(),
                            paddingBottom: "0",
                        }}
                    >
                        <TopBar
                            onMenuClick={() => setMobileMenuOpen(true)}
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
