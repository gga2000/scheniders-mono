"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./global-search";
import { MobileNav } from "./mobile-nav";
import { AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isMobile = useIsMobile();

    // Check if we are on an auth page
    const isAuthPage = pathname?.startsWith('/login') ||
        pathname?.startsWith('/forgot-password') ||
        pathname?.startsWith('/reset-password');

    // Load from localStorage after mount
    useEffect(() => {
        const saved = localStorage.getItem("sidebarCollapsed");
        if (saved === "true") {
            setIsCollapsed(true);
        }
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
                <AnimatePresence mode="wait">
                    {children}
                </AnimatePresence>
            </div>
        );
    }

    const getMainMargin = () => {
        if (!mounted) return "0px";
        if (isMobile) return "0px";
        return isCollapsed ? "88px" : "272px";
    };

    return (
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
                    "flex-1 min-w-0 transition-all duration-500 ease-in-out",
                    !isMobile && "overflow-hidden"
                )}
                style={{
                    marginLeft: getMainMargin(),
                    paddingBottom: isMobile ? "var(--mobile-nav-height)" : "0",
                }}
            >
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

            {mounted && isMobile && <MobileNav />}
        </div>
    );
}
