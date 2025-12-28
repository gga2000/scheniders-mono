"use client";

import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Settings,
    LogOut,
    Package,
    Users,
    Printer,
    ShoppingBag,
    ChevronLeft,
    ChevronRight,
    BarChart3,
    X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/" },
    { label: "Orders", icon: Package, href: "/orders" },
    { label: "Customers", icon: Users, href: "/customers" },
    { label: "Products", icon: ShoppingBag, href: "/products" },
    { label: "Analytics", icon: BarChart3, href: "/analytics" },
    { label: "Printing", icon: Printer, href: "/printing" },
    { label: "Settings", icon: Settings, href: "/settings" },
];

interface SidebarProps {
    collapsed: boolean;
    setCollapsed: (v: boolean) => void;
    isMobile?: boolean;
    mobileMenuOpen?: boolean;
    setMobileMenuOpen?: (v: boolean) => void;
}

export function Sidebar({
    collapsed,
    setCollapsed,
    isMobile = false,
    mobileMenuOpen = false,
    setMobileMenuOpen
}: SidebarProps) {
    const pathname = usePathname();

    // On mobile, always show expanded sidebar in the drawer
    const isCollapsed = isMobile ? false : collapsed;

    // Handle nav click on mobile - close menu
    const handleNavClick = () => {
        if (isMobile && setMobileMenuOpen) {
            setMobileMenuOpen(false);
        }
    };

    // Desktop sidebar
    if (!isMobile) {
        return (
            <aside
                className={cn(
                    "fixed left-4 top-4 bottom-4 bg-[#1E1E1E] rounded-[32px] flex flex-col py-6 text-white shadow-2xl z-50",
                    "transition-all duration-500 ease-in-out",
                    collapsed ? "w-[72px]" : "w-64 px-6"
                )}
            >
                {/* Collapse Toggle Button */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="absolute -right-3 top-16 z-10 w-8 h-8 rounded-full bg-[#E4B5D1] hover:bg-[#d9a0c4] flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg border-[3px] border-[#1E1E1E]"
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? (
                        <ChevronRight className="w-4 h-4 text-zinc-800" strokeWidth={2.5} />
                    ) : (
                        <ChevronLeft className="w-4 h-4 text-zinc-800" strokeWidth={2.5} />
                    )}
                </button>

                {/* Logo Section */}
                <div className={cn(
                    "flex items-center mb-8 transition-all duration-500",
                    collapsed ? "justify-center flex-col gap-2" : "gap-3 px-2"
                )}>
                    <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Package className="w-5 h-5" />
                    </div>
                    <span className={cn(
                        "font-bold tracking-tight transition-all duration-500 overflow-hidden",
                        collapsed ? "text-[0px] w-0 opacity-0" : "text-xl opacity-100"
                    )}>
                        Schenider
                    </span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden scrollbar-hide px-2">
                    {!collapsed && (
                        <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-1 transition-opacity duration-300">
                            General
                        </div>
                    )}

                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                                    collapsed
                                        ? "justify-center w-full"
                                        : "gap-3 px-3",
                                    isActive
                                        ? "bg-white/10 text-white"
                                        : "text-zinc-500 hover:text-white hover:bg-white/[0.03]"
                                )}
                                title={collapsed ? item.label : undefined}
                            >
                                <item.icon className={cn(
                                    "w-[22px] h-[22px] transition-colors flex-shrink-0",
                                    isActive ? "text-white" : "text-zinc-500 group-hover:text-white"
                                )} />

                                <span className={cn(
                                    "font-medium text-[15px] transition-all duration-500 whitespace-nowrap",
                                    collapsed ? "w-0 opacity-0 hidden" : "opacity-100"
                                )}>
                                    {item.label}
                                </span>

                                {isActive && !collapsed && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-pastel-rose shadow-[0_0_10px_rgba(244,199,207,0.6)]" />
                                )}

                                {isActive && collapsed && (
                                    <div className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-pastel-rose shadow-[0_0_10px_rgba(244,199,207,0.6)]" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Bottom Section */}
                <div className="pt-4 border-t border-white/5 px-2">
                    <button
                        className={cn(
                            "flex items-center py-3 rounded-2xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/5 w-full transition-all duration-300",
                            collapsed ? "justify-center" : "gap-3 px-3"
                        )}
                        title={collapsed ? "Log out" : undefined}
                    >
                        <LogOut className="w-[22px] h-[22px] flex-shrink-0" />
                        <span className={cn(
                            "font-medium text-[15px] transition-all duration-500 whitespace-nowrap",
                            collapsed ? "w-0 opacity-0 hidden" : "opacity-100"
                        )}>
                            Log out
                        </span>
                    </button>
                </div>
            </aside>
        );
    }

    // Mobile sidebar drawer
    return (
        <AnimatePresence>
            {mobileMenuOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setMobileMenuOpen?.(false)}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                    />

                    {/* Drawer */}
                    <motion.aside
                        initial={{ x: "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "-100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-[#1E1E1E] flex flex-col py-6 px-4 text-white shadow-2xl z-60"
                        style={{ paddingTop: "calc(var(--safe-area-top) + 1.5rem)" }}
                    >
                        {/* Header with Close Button */}
                        <div className="flex items-center justify-between mb-8 px-2">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <Package className="w-5 h-5" />
                                </div>
                                <span className="font-bold text-xl tracking-tight">
                                    Schenider
                                </span>
                            </div>
                            <button
                                onClick={() => setMobileMenuOpen?.(false)}
                                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Navigation */}
                        <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide">
                            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-3">
                                General
                            </div>

                            {NAV_ITEMS.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={handleNavClick}
                                        className={cn(
                                            "flex items-center gap-4 py-4 px-4 rounded-2xl transition-all duration-200",
                                            isActive
                                                ? "bg-white/10 text-white"
                                                : "text-zinc-400 hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        <item.icon className="w-5 h-5 flex-shrink-0" />
                                        <span className="font-medium text-base">
                                            {item.label}
                                        </span>
                                        {isActive && (
                                            <div className="ml-auto w-2 h-2 rounded-full bg-pastel-rose shadow-[0_0_10px_rgba(244,199,207,0.6)]" />
                                        )}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Bottom Section */}
                        <div className="pt-4 border-t border-white/10">
                            <button
                                className="flex items-center gap-4 py-4 px-4 rounded-2xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 w-full transition-all duration-200"
                            >
                                <LogOut className="w-5 h-5 flex-shrink-0" />
                                <span className="font-medium text-base">
                                    Log out
                                </span>
                            </button>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
