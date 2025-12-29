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
    Shield,
    UserCircle,
    UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/auth/auth-provider";

const NAV_ITEMS = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/" },
    { label: "Orders", icon: Package, href: "/orders" },
    { label: "Customers", icon: Users, href: "/customers" },
    { label: "Products", icon: ShoppingBag, href: "/products" },
    { label: "Analytics", icon: BarChart3, href: "/analytics" },
    { label: "Printing", icon: Printer, href: "/printing" },
    { label: "Settings", icon: Settings, href: "/settings" },
];

// Admin-only nav items
const ADMIN_NAV_ITEMS = [
    { label: "Team", icon: UsersRound, href: "/settings/team" },
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
    const { profile, signOut, isAdmin, loading } = useAuth();

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

    // Get role badge styling
    const getRoleBadge = () => {
        if (!profile) return null;

        const roleConfig = {
            admin: { label: "مسؤول", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
            employee: { label: "موظف", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
            viewer: { label: "مشاهد", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
        };

        const config = roleConfig[profile.role];
        return (
            <span className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                config.color
            )}>
                {config.label}
            </span>
        );
    };

    // Get all nav items (including admin-only if applicable)
    const allNavItems = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;

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

                    {allNavItems.map((item) => {
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

                {/* User Section */}
                {profile && (
                    <div className={cn(
                        "pt-4 border-t border-white/5 px-2 mb-2",
                        collapsed ? "flex justify-center" : ""
                    )}>
                        <div className={cn(
                            "flex items-center gap-3 rounded-2xl p-2 bg-white/5",
                            collapsed ? "justify-center p-3" : ""
                        )}>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0">
                                <UserCircle className="w-5 h-5 text-primary" />
                            </div>
                            {!collapsed && (
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">
                                        {profile.display_name || profile.email.split("@")[0]}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {getRoleBadge()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Logout Button */}
                <div className="px-2">
                    <button
                        onClick={handleLogout}
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

                        {/* User Info on Mobile */}
                        {profile && (
                            <div className="px-2 pb-4 mb-4 border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                                        <UserCircle className="w-6 h-6 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-white">
                                            {profile.display_name || profile.email.split("@")[0]}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            {getRoleBadge()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Navigation */}
                        <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide">
                            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-3">
                                General
                            </div>

                            {allNavItems.map((item) => {
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
                                onClick={handleLogout}
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

