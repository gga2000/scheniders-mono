"use client";

import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Settings,
    Package,
    Users,
    Printer,
    ShoppingBag,
    ChevronLeft,
    ChevronRight,
    BarChart3,
    X,
    UsersRound,
    LogOut,
    FileBarChart,
    Database,
    Store,
    Layers,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { usePrefetchOrders } from "@/hooks/use-orders-query";
import { usePrefetchCustomers } from "@/hooks/use-customers-query";
import { usePrefetchProducts } from "@/hooks/use-products-query";
import { useLanguage } from "@/hooks/use-language";
import { useState } from "react";
import { NotificationCenter } from "@/components/ui/notification-center";
import { TransitionLink } from "./transition-link";

const NAV_ITEMS = [
    { key: "nav.dashboard", icon: LayoutDashboard, href: "/" },
    { key: "nav.orders", icon: Package, href: "/orders" },
    { key: "nav.customers", icon: Users, href: "/customers" },
    { key: "nav.products", icon: ShoppingBag, href: "/products" },
    { key: "nav.categories", icon: Layers, href: "/categories" },
    { key: "nav.analytics", icon: BarChart3, href: "/analytics" },
    { key: "nav.reports", icon: FileBarChart, href: "/reports" },
    { key: "nav.printing", icon: Printer, href: "/printing" },
    { key: "nav.team", icon: UsersRound, href: "/team" },
    { key: "nav.vault", icon: Database, href: "/vault" },
    { key: "nav.store", icon: Store, href: "/store" },
    { key: "nav.settings", icon: Settings, href: "/settings" },
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
    const router = useRouter();
    const { user, profile, signOut, isLoading: authLoading } = useAuth();
    const prefetchOrders = usePrefetchOrders();
    const prefetchCustomers = usePrefetchCustomers();
    const prefetchProducts = usePrefetchProducts();
    const { t } = useLanguage();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    // On mobile, always show expanded sidebar in the drawer
    const isCollapsed = isMobile ? false : collapsed;

    // Handle nav click on mobile - close menu
    const handleNavClick = () => {
        if (isMobile && setMobileMenuOpen) {
            setMobileMenuOpen(false);
        }
    };

    // Handle logout
    const handleLogout = async () => {
        await signOut();
        router.push("/login");
    };

    // Desktop sidebar
    if (!isMobile) {
        return (
            <aside
                className={cn(
                    "fixed left-4 top-4 bottom-4 bg-[#1E1E1E] rounded-[32px] flex flex-col py-6 text-white shadow-lg shadow-black/20 z-50 border border-white/5",
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
                    <div className="w-9 h-9 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center flex-shrink-0 dark:shadow-[0_0_15px_rgba(239,255,0,0.3)]">
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
                            {t("nav.general")}
                        </div>
                    )}

                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <TransitionLink
                                key={item.href}
                                href={item.href}
                                prefetch={true}
                                onMouseEnter={() => {
                                    // Intent-based rigorous prefetching
                                    if (["/", "/orders", "/analytics", "/printing"].includes(item.href)) prefetchOrders();
                                    if (["/customers", "/analytics"].includes(item.href)) prefetchCustomers();
                                    if (["/products", "/analytics"].includes(item.href)) prefetchProducts();
                                }}
                                className={cn(
                                    "flex items-center py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                                    collapsed
                                        ? "justify-center w-full"
                                        : "gap-3 px-3",
                                    isActive
                                        ? "bg-white/10 text-white"
                                        : "text-zinc-500 hover:text-white hover:bg-white/[0.03]"
                                )}
                                title={collapsed ? t(item.key) : undefined}
                            >
                                <item.icon className={cn(
                                    "w-[22px] h-[22px] transition-colors flex-shrink-0",
                                    isActive ? "text-white" : "text-zinc-500 group-hover:text-white"
                                )} />

                                <span className={cn(
                                    "font-medium text-[15px] transition-all duration-500 whitespace-nowrap",
                                    collapsed ? "w-0 opacity-0 hidden" : "opacity-100"
                                )}>
                                    {t(item.key)}
                                </span>

                                {isActive && !collapsed && (
                                    <div className="ml-auto w-1.5 h-1.5 rounded-[2px] bg-[var(--primary)] shadow-[0_0_10px_rgba(239,255,0,0.6)]" />
                                )}

                                {isActive && collapsed && (
                                    <div className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-[2px] bg-[var(--primary)] shadow-[0_0_10px_rgba(239,255,0,0.6)]" />
                                )}
                            </TransitionLink>
                        );
                    })}
                </nav>

                {/* User Section */}
                {user && (
                    <div className={cn(
                        "mt-4 pt-4 border-t border-white/10 px-2",
                        collapsed ? "flex flex-col items-center" : ""
                    )}>
                        {!collapsed && (
                            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-1">
                                {t("nav.account")}
                            </div>
                        )}

                        {/* User Info */}
                        <div className={cn(
                            "flex items-center gap-3 mb-3",
                            collapsed ? "justify-center" : "px-3"
                        )}>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center flex-shrink-0 overflow-hidden">
                                {profile?.avatar_url ? (
                                    <img loading="lazy" decoding="async" src={profile.avatar_url} alt={profile.display_name || "User"} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-[#1E1E1E] font-semibold text-sm">
                                        {(profile?.display_name || user.email)?.charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            {!collapsed && (
                                <>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-sm font-medium truncate">
                                            {profile?.display_name || user.email?.split("@")[0]}
                                        </p>
                                        <p className="text-zinc-500 text-xs truncate">
                                            {user.email}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 bg-white/5 rounded-xl border border-white/5 p-1">
                                        <NotificationCenter />
                                        <div className="w-[1px] h-4 bg-white/10 mx-1" />
                                        <Link
                                            href="/settings"
                                            className="w-[34px] h-[34px] flex items-center justify-center rounded-xl bg-transparent hover:bg-white/10 transition-colors text-zinc-500 hover:text-white"
                                            title="Settings"
                                        >
                                            <Settings className="w-4 h-4" />
                                        </Link>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Logout Button */}
                        {!showLogoutConfirm ? (
                            <button
                                onClick={() => setShowLogoutConfirm(true)}
                                className={cn(
                                    "flex items-center gap-3 py-3 rounded-2xl transition-all duration-200 w-full",
                                    "text-zinc-500 hover:text-white hover:bg-white/[0.05]",
                                    collapsed ? "justify-center" : "px-3"
                                )}
                                title={collapsed ? t("nav.logout") : undefined}
                            >
                                <LogOut className="w-[20px] h-[20px]" />
                                {!collapsed && (
                                    <span className="text-sm font-medium">{t("nav.logout")}</span>
                                )}
                            </button>
                        ) : (
                            <div className={cn(
                                "space-y-2",
                                collapsed ? "w-full" : ""
                            )}>
                                {!collapsed && (
                                    <p className="text-xs text-zinc-400 px-3">Are you sure?</p>
                                )}
                                <div className={cn(
                                    "flex gap-2",
                                    collapsed ? "flex-col px-1" : "px-3"
                                )}>
                                    <button
                                        onClick={handleLogout}
                                        disabled={authLoading}
                                        className={cn(
                                            "flex-1 py-2 rounded-xl text-xs font-medium transition-colors",
                                            "bg-red-500/20 text-red-400 hover:bg-red-500/30",
                                            collapsed ? "px-2" : ""
                                        )}
                                    >
                                        {collapsed ? "Yes" : t("nav.logout")}
                                    </button>
                                    <button
                                        onClick={() => setShowLogoutConfirm(false)}
                                        className={cn(
                                            "flex-1 py-2 rounded-xl text-xs font-medium transition-colors",
                                            "bg-white/10 text-zinc-400 hover:bg-white/20",
                                            collapsed ? "px-2" : ""
                                        )}
                                    >
                                        {collapsed ? "No" : t("common.cancel")}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
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
                                <div className="w-9 h-9 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center flex-shrink-0 dark:shadow-[0_0_15px_rgba(239,255,0,0.3)]">
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
                                {t("nav.general")}
                            </div>

                            {NAV_ITEMS.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <TransitionLink
                                        key={item.href}
                                        href={item.href}
                                        prefetch={true}
                                        onClick={handleNavClick}
                                        onMouseEnter={() => {
                                            // Intent-based rigorous prefetching
                                            if (["/", "/orders", "/analytics", "/printing"].includes(item.href)) prefetchOrders();
                                            if (["/customers", "/analytics"].includes(item.href)) prefetchCustomers();
                                            if (["/products", "/analytics"].includes(item.href)) prefetchProducts();
                                        }}
                                        className={cn(
                                            "flex items-center gap-4 py-4 px-4 rounded-2xl transition-all duration-200",
                                            isActive
                                                ? "bg-white/10 text-white"
                                                : "text-zinc-400 hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        <item.icon className="w-5 h-5 flex-shrink-0" />
                                        <span className="font-medium text-base">
                                            {t(item.key)}
                                        </span>
                                        {isActive && (
                                            <div className="ml-auto w-2 h-2 rounded-[2px] bg-[var(--primary)] shadow-[0_0_10px_rgba(239,255,0,0.6)]" />
                                        )}
                                    </TransitionLink>
                                );
                            })}
                        </nav>

                        {/* Mobile User Section */}
                        {user && (
                            <div className="mt-auto border-t border-white/10 p-4">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FBE38E] to-[#F4C7CF] flex items-center justify-center flex-shrink-0 overflow-hidden">
                                        {profile?.avatar_url ? (
                                            <img loading="lazy" decoding="async" src={profile.avatar_url} alt={profile.display_name || "User"} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[#1E1E1E] font-semibold text-base">
                                                {(profile?.display_name || user.email)?.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-base font-medium truncate">
                                            {profile?.display_name || user.email?.split("@")[0]}
                                        </p>
                                        <p className="text-zinc-500 text-sm truncate">
                                            {user.email}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleLogout}
                                    disabled={authLoading}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
                                >
                                    <LogOut className="w-5 h-5" />
                                    <span>{t("nav.logout")}</span>
                                </button>
                            </div>
                        )}
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
