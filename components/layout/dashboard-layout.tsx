"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./global-search";
import { MobileNav } from "./mobile-nav";
import { AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    // Initialize with consistent value for SSR - always false
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Mobile detection
    const isMobile = useIsMobile();

    // Load from localStorage only after mount (client-side)
    useEffect(() => {
        const saved = localStorage.getItem("sidebarCollapsed");
        if (saved === "true") {
            setIsCollapsed(true);
        }
        setMounted(true);
    }, []);

    // Save sidebar state to localStorage
    useEffect(() => {
        if (mounted) {
            localStorage.setItem("sidebarCollapsed", String(isCollapsed));
        }
    }, [isCollapsed, mounted]);

    // Close mobile menu when switching to desktop
    useEffect(() => {
        if (!isMobile && mobileMenuOpen) {
            setMobileMenuOpen(false);
        }
    }, [isMobile, mobileMenuOpen]);

    // Calculate main content margin - 0 on mobile
    const getMainMargin = () => {
        if (!mounted) return "0px"; // SSR: no margin
        if (isMobile) return "0px";
        return isCollapsed ? "88px" : "272px";
    };

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            {/* Mobile Menu Overlay */}
            {isMobile && mobileMenuOpen && (
                <div
                    className="mobile-overlay active"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar - Hidden on mobile, shown when menu is open */}
            <Sidebar
                collapsed={isCollapsed}
                setCollapsed={setIsCollapsed}
                isMobile={isMobile}
                mobileMenuOpen={mobileMenuOpen}
                setMobileMenuOpen={setMobileMenuOpen}
            />

            {/* Main Content Area with smooth transition */}
            <main
                className={cn(
                    "flex-1 min-w-0 transition-all duration-500 ease-in-out",
                    !isMobile && "overflow-hidden"
                )}
                style={{
                    marginLeft: getMainMargin(),
                    // Add bottom padding on mobile for nav bar
                    paddingBottom: isMobile ? "var(--mobile-nav-height)" : "0",
                }}
            >
                {/* Top Bar with Global Search - includes mobile hamburger */}
                <TopBar
                    onMenuClick={() => setMobileMenuOpen(true)}
                    isMobile={isMobile}
                />

                <AnimatePresence mode="wait">
                    <div className="max-w-[1800px] mx-auto">
                        {children}
                    </div>
                </AnimatePresence>
            </main>

            {/* Mobile Bottom Navigation */}
            {mounted && isMobile && <MobileNav />}
        </div>
    );
}
