"use client";

import { cn } from "@/lib/utils";
import {
    Settings,
    Package,
    ChevronRight,
    X,
    LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { usePrefetchProducts } from "@/hooks/use-products-query";
import { useLanguage } from "@/hooks/use-language";
import { useMemo, useState, type ComponentType } from "react";
import { canAccessRoute, filterNavSections } from "@/lib/route-permissions";
import { NotificationCenter } from "@/components/ui/notification-center";
import { LiquidNavPending, LiquidNavWater } from "@/components/ui/liquid-nav-water";
import { TransitionLink } from "./transition-link";
import {
    AnimatedDashboardIcon,
    AnimatedOrdersIcon,
    AnimatedCustomersIcon,
    AnimatedProductsIcon,
    AnimatedFinancesIcon,
    AnimatedReportsIcon,
    AnimatedPrintingIcon,
    AnimatedTeamIcon,
    AnimatedVaultIcon,
    AnimatedStoreIcon,
} from "./animated-nav-icons";

const ANIMATED_ICON_KEYS = new Set([
    "nav.dashboard", "nav.orders", "nav.customers", "nav.products",
    "nav.finances", "nav.reports", "nav.printing", "nav.team",
    "nav.vault", "nav.store",
]);

type NavItem = {
    key: string;
    icon: ComponentType<{ className?: string; active?: boolean }>;
    href: string;
    subItems?: { key: string; label: string; href: string; tab: string }[];
};

/**
 * The nav used to be one flat 13-item list under a single "General" header, with
 * Settings duplicating the gear in the account strip. Grouping by what an item is
 * *for* keeps each run scannable; headers reuse the existing "General" styling.
 */
const NAV_SECTIONS: { titleKey: string; items: NavItem[] }[] = [
    {
        titleKey: "nav.general",
        items: [
            { key: "nav.dashboard", icon: AnimatedDashboardIcon, href: "/dashboard" },
            { key: "nav.orders", icon: AnimatedOrdersIcon, href: "/orders" },
            { key: "nav.customers", icon: AnimatedCustomersIcon, href: "/customers" },
            {
                key: "nav.products",
                icon: AnimatedProductsIcon,
                href: "/products",
                subItems: [
                    { key: "nav.allProducts", label: "All Products", href: "/products", tab: "products" },
                    { key: "nav.categories", label: "Categories", href: "/products?tab=categories", tab: "categories" },
                    { key: "nav.attributes", label: "Attributes", href: "/products?tab=attributes", tab: "attributes" },
                    { key: "nav.internalSupplies", label: "Internal Supplies", href: "/products?tab=supplies", tab: "supplies" },
                ],
            },
            { key: "nav.printing", icon: AnimatedPrintingIcon, href: "/printing" },
        ],
    },
    {
        titleKey: "nav.groupMoney",
        items: [
            {
                key: "nav.finances",
                icon: AnimatedFinancesIcon,
                href: "/finances",
                subItems: [
                    // Ordered the way money actually moves: what came in, what is owed, what went out.
                    { key: "nav.financesOverview", label: "Overview", href: "/finances", tab: "overview" },
                    { key: "nav.financesRevenue", label: "Revenue & Profit", href: "/finances?tab=revenue", tab: "revenue" },
                    { key: "nav.financesCash", label: "Cash & COD", href: "/finances?tab=cash", tab: "cash" },
                    { key: "nav.financesInvoices", label: "Invoices", href: "/finances?tab=invoices", tab: "invoices" },
                    { key: "nav.financesPayouts", label: "Payouts", href: "/finances?tab=payouts", tab: "payouts" },
                    { key: "nav.financesRefunds", label: "Refunds & Returns", href: "/finances?tab=refunds", tab: "refunds" },
                    { key: "nav.financesExpenses", label: "Expenses", href: "/finances?tab=expenses", tab: "expenses" },
                    { key: "nav.financesSalaries", label: "Salaries", href: "/finances?tab=salaries", tab: "salaries" },
                    { key: "nav.financesPrint", label: "Print & Ship", href: "/finances?tab=print", tab: "print" },
                    { key: "nav.financesCustomers", label: "Customers", href: "/finances?tab=customers", tab: "customers" },
                    { key: "nav.financesProducts", label: "Products", href: "/finances?tab=products", tab: "products" },
                    { key: "nav.financesForecasts", label: "Forecasts", href: "/finances?tab=forecasts", tab: "forecasts" },
                    { key: "nav.financesReports", label: "Exports", href: "/finances?tab=reports", tab: "reports" },
                ],
            },
            { key: "nav.reports", icon: AnimatedReportsIcon, href: "/reports" },
        ],
    },
    {
        titleKey: "nav.groupWorkspace",
        items: [
            // Store owns its own sub-navigation in-page (Command Center / Editor /
            // Reviews / Cart Recovery), so the sidebar keeps a single entry.
            { key: "nav.store", icon: AnimatedStoreIcon, href: "/store" },
            { key: "nav.team", icon: AnimatedTeamIcon, href: "/team" },
            { key: "nav.vault", icon: AnimatedVaultIcon, href: "/vault" },
        ],
    },
];

// Flat list for the mobile drawer and for stable per-item shine offsets.
const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap(section => section.items);


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
    const searchParams = useSearchParams();
    const router = useRouter();
    const currentTab =
        searchParams?.get("tab") ||
        (pathname.startsWith("/finances") ? "overview" : "products");
    const { user, profile, role, permissions, profileLoaded, signOut, isLoading: authLoading } = useAuth();
    // Only the links this user may open: the same rules PageGuard enforces.
    const navSections = useMemo(() => filterNavSections(NAV_SECTIONS, role, permissions), [role, permissions]);
    // Until the role is known, filtering keeps only the ungated links, which
    // then jump to the full list. Hold placeholder rows in their place instead.
    const navPlaceholder = (
        <div aria-hidden className="space-y-0">
            {NAV_ITEMS.map((item) => (
                <div key={item.href} className={cn("flex items-center py-2.5", collapsed && !isMobile ? "justify-center" : "gap-3 px-3")}>
                    <div className="w-[22px] h-[22px] rounded-md bg-white/[0.06] animate-pulse flex-shrink-0" />
                    {!(collapsed && !isMobile) && <div className="h-3 w-24 rounded bg-white/[0.06] animate-pulse" />}
                </div>
            ))}
        </div>
    );
    const canOpenSettings = canAccessRoute("/settings", role, permissions);
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

    // Motion presets — tuned for a luxurious, responsive sidebar collapse
    const sidebarSpring = { type: "spring" as const, stiffness: 260, damping: 32, mass: 0.9 };
    const labelVariants = {
        collapsed: { opacity: 0, width: 0, transition: { duration: 0.16, ease: [0.65, 0, 0.35, 1] as const } },
        expanded: { opacity: 1, width: "auto" as const, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const, delay: 0.08 } },
    };
    const headerVariants = {
        collapsed: { opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.16, ease: [0.65, 0, 0.35, 1] as const } },
        expanded: { opacity: 1, height: "auto" as const, marginBottom: 12, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const, delay: 0.05 } },
    };

    // A section owns its nested routes: /store/reviews and /store/recovery are
    // reached through Store's own tabs, so Store stays lit while you are on them.
    const isItemActive = (item: NavItem) => pathname === item.href
        || pathname.startsWith(`${item.href}/`)
        || Boolean(item.subItems && pathname.startsWith(item.href));
    const activeHref = navSections.flatMap(section => section.items).find(isItemActive)?.href ?? null;

    const renderNavItem = (item: NavItem, index: number) => {
        const isActive = isItemActive(item);
        // Stagger shine per item with pseudo-random offsets so they never sweep together
        const shineDelay = `${((index * 2.137) % 9).toFixed(2)}s`;
        return (
            <div key={item.href} className="flex flex-col">
                <TransitionLink
                    href={item.href}
                    prefetch={true}
                    data-liquid-key={item.href}
                    onMouseEnter={() => {
                        // Intent-based rigorous prefetching
                        if (["/products", "/finances"].includes(item.href)) prefetchProducts();
                    }}
                    className={cn(
                        "flex items-center py-2.5 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                        collapsed
                            ? "justify-center w-full"
                            : "gap-3 px-3",
                        isActive
                            // The liquid drop marks the active item; the flat fill only
                            // shows until the water has measured the layout.
                            ? "text-white [[data-liquid-water=pending]_&]:bg-white/10"
                            : "text-zinc-500 hover:text-white hover:bg-white/[0.03]"
                    )}
                    title={collapsed ? t(item.key) : undefined}
                >
                    <LiquidNavPending navKey={item.href} />
                    <motion.span
                        transition={sidebarSpring}
                        className="nav-icon-shine flex-shrink-0 inline-flex items-center justify-center w-[22px] h-[22px]"
                        style={{ ['--shine-delay' as string]: shineDelay }}
                    >
                        {ANIMATED_ICON_KEYS.has(item.key) ? (
                            (() => {
                                const AnimIcon = item.icon as ComponentType<{ className?: string; active?: boolean }>;
                                return (
                                    <AnimIcon
                                        className={cn(
                                            "w-[22px] h-[22px] transition-colors",
                                            isActive ? "text-white" : "text-zinc-500 group-hover:text-white"
                                        )}
                                        active={isActive || undefined}
                                    />
                                );
                            })()
                        ) : (
                            <motion.span
                                key={isActive ? `${item.href}-on` : `${item.href}-off`}
                                initial={isActive ? { scale: 0.55, rotate: -14 } : false}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: "spring", stiffness: 480, damping: 14, mass: 0.7 }}
                                className="inline-flex"
                            >
                                <item.icon className={cn(
                                    "w-[22px] h-[22px] transition-colors",
                                    isActive ? "text-white" : "text-zinc-500 group-hover:text-white"
                                )} />
                            </motion.span>
                        )}
                    </motion.span>

                    <motion.span
                        initial={false}
                        animate={collapsed ? "collapsed" : "expanded"}
                        variants={labelVariants}
                        className="font-medium text-[15px] whitespace-nowrap overflow-hidden inline-block"
                    >
                        {t(item.key)}
                    </motion.span>

                </TransitionLink>

                {/* Sub Navigation for Desktop Sidebar */}
                <AnimatePresence initial={false}>
                    {item.subItems && isActive && !collapsed && !isMobile && (
                        <motion.div
                            key="subnav"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="relative mt-3 mb-0">
                                <div className="absolute left-[22px] top-0 bottom-3 w-[2px] bg-white/10 rounded-full" />
                                <motion.div
                                    initial="hidden"
                                    animate="visible"
                                    variants={{
                                        hidden: {},
                                        visible: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } },
                                    }}
                                    className="flex flex-col gap-0 pl-[42px] pr-3"
                                >
                                    {item.subItems.map(subItem => {
                                        const isSubActive = currentTab === subItem.tab;
                                        return (
                                            <motion.div
                                                key={subItem.href}
                                                variants={{
                                                    hidden: { opacity: 0, x: -6 },
                                                    visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
                                                }}
                                            >
                                                <TransitionLink
                                                    href={subItem.href}
                                                    className={cn(
                                                        "text-[14px] py-1.5 px-3 rounded-xl transition-all relative flex items-center group",
                                                        isSubActive
                                                            ? "text-white bg-white/10 font-medium shadow-sm ring-1 ring-white/5"
                                                            : "text-zinc-400 hover:text-white hover:bg-white/5"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "absolute -left-[22px] w-[6px] h-[6px] rounded-full transition-all duration-300 ring-[4px] ring-[#1E1E1E]",
                                                        isSubActive
                                                            ? "bg-[#E4B5D1] shadow-[0_0_10px_rgba(228,181,209,0.8)] scale-110"
                                                            : "bg-zinc-700 group-hover:bg-zinc-500"
                                                    )} />
                                                    {t(subItem.key)}
                                                </TransitionLink>
                                            </motion.div>
                                        );
                                    })}
                                </motion.div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    // Desktop sidebar
    if (!isMobile) {
        return (
            <motion.aside
                initial={false}
                animate={{
                    width: collapsed ? 72 : 256,
                    paddingLeft: collapsed ? 0 : 24,
                    paddingRight: collapsed ? 0 : 24,
                }}
                transition={sidebarSpring}
                className="fixed left-4 top-4 bottom-4 w-[256px] px-6 bg-[#1E1E1E] rounded-[32px] flex flex-col py-6 text-white shadow-lg shadow-black/20 z-50 border border-white/5"
            >
                {/* Collapse Toggle Button */}
                <motion.button
                    onClick={() => setCollapsed(!collapsed)}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    className="absolute -right-3 top-16 z-10 w-8 h-8 rounded-full bg-[#E4B5D1] hover:bg-[#d9a0c4] flex items-center justify-center shadow-md hover:shadow-lg border-[3px] border-[#1E1E1E]"
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    <motion.span
                        animate={{ rotate: collapsed ? 0 : 180 }}
                        transition={{ type: "spring", stiffness: 300, damping: 24 }}
                        className="flex"
                    >
                        <ChevronRight className="w-4 h-4 text-zinc-800" strokeWidth={2.5} />
                    </motion.span>
                </motion.button>

                {/* Logo Section */}
                <motion.div
                    initial={false}
                    animate={{
                        paddingLeft: collapsed ? 18 : 8,
                        gap: collapsed ? 0 : 12,
                    }}
                    transition={sidebarSpring}
                    className="flex items-center mb-8 overflow-hidden pl-2 gap-3"
                >
                    <div className="w-9 h-9 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center flex-shrink-0 dark:shadow-[0_0_15px_rgba(239,255,0,0.3)]">
                        <Package className="w-5 h-5" />
                    </div>
                    <motion.span
                        initial={false}
                        animate={collapsed ? "collapsed" : "expanded"}
                        variants={labelVariants}
                        className="font-bold tracking-tight text-xl whitespace-nowrap overflow-hidden inline-block flex-shrink-0"
                    >
                        Schenider
                    </motion.span>
                </motion.div>

                {/* Navigation */}
                {/* p-2 leaves the liquid drop room to draw its rim at the edges, top and bottom included. */}
                <nav className="flex-1 space-y-0 overflow-y-auto overflow-x-hidden scrollbar-hide p-2">
                    {!profileLoaded ? navPlaceholder : (
                        <LiquidNavWater activeKey={activeHref}>
                            {navSections.map((section, sectionIndex) => (
                                <div key={section.titleKey} className={sectionIndex > 0 ? (collapsed ? "mt-2" : "mt-5") : undefined}>
                                    <motion.div
                                        initial={false}
                                        animate={collapsed ? "collapsed" : "expanded"}
                                        variants={headerVariants}
                                        className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-1 overflow-hidden mb-3"
                                    >
                                        {t(section.titleKey)}
                                    </motion.div>
                                    {section.items.map(item => renderNavItem(item, NAV_ITEMS.indexOf(item)))}
                                </div>
                            ))}
                        </LiquidNavWater>
                    )}
                </nav>

                {/* User Section */}
                {user && (
                    <div className={cn(
                        "mt-4 pt-4 border-t border-white/10 px-2",
                        collapsed ? "flex flex-col items-center" : ""
                    )}>
                        <motion.div
                            initial={false}
                            animate={collapsed ? "collapsed" : "expanded"}
                            variants={headerVariants}
                            className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-1 overflow-hidden mb-3"
                        >
                            {t("nav.account")}
                        </motion.div>

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
                            <AnimatePresence initial={false}>
                                {!collapsed && (
                                    <motion.div
                                        key="user-info"
                                        initial={{ opacity: 0, width: 0 }}
                                        animate={{ opacity: 1, width: "auto" }}
                                        exit={{ opacity: 0, width: 0 }}
                                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                                        className="flex-1 min-w-0 overflow-hidden"
                                    >
                                        <p className="text-white text-sm font-medium truncate">
                                            {profile?.display_name || user.email?.split("@")[0]}
                                        </p>
                                        <p className="text-zinc-500 text-xs truncate">
                                            {user.email}
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Action Group: Notifications · Settings · Logout */}
                        {!showLogoutConfirm ? (
                            <div className={cn(
                                collapsed
                                    ? "flex flex-col items-center gap-1.5"
                                    : "flex items-stretch bg-white/4 rounded-2xl border border-white/6 p-1 mx-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                            )}>
                                <div className={cn(
                                    collapsed ? "" : "flex-1 flex items-center justify-center [&>button]:w-full [&>button]:bg-transparent [&>button]:border-0 [&>button]:rounded-xl [&>button]:h-9"
                                )}>
                                    <NotificationCenter />
                                </div>
                                {canOpenSettings && !collapsed && <div className="w-px self-center h-5 bg-white/8" />}
                                {canOpenSettings && <Link
                                    href="/settings"
                                    className={cn(
                                        "flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/6 transition-all",
                                        collapsed ? "w-10 h-10" : "flex-1 h-9"
                                    )}
                                    title={t("nav.settings")}
                                >
                                    <Settings className="w-[18px] h-[18px]" />
                                </Link>}
                                {!collapsed && <div className="w-px self-center h-5 bg-white/8" />}
                                <button
                                    onClick={() => setShowLogoutConfirm(true)}
                                    className={cn(
                                        "flex items-center justify-center rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all",
                                        collapsed ? "w-10 h-10" : "flex-1 h-9"
                                    )}
                                    title={t("nav.logout")}
                                >
                                    <LogOut className="w-[18px] h-[18px]" />
                                </button>
                            </div>
                        ) : (
                            <div className={cn(
                                "space-y-2",
                                collapsed ? "w-full" : ""
                            )}>
                                {!collapsed && (
                                    <p className="text-xs text-zinc-400 px-3">{t("nav.logoutConfirm")}</p>
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
                                        {collapsed ? t("common.yes") : t("nav.logout")}
                                    </button>
                                    <button
                                        onClick={() => setShowLogoutConfirm(false)}
                                        className={cn(
                                            "flex-1 py-2 rounded-xl text-xs font-medium transition-colors",
                                            "bg-white/10 text-zinc-400 hover:bg-white/20",
                                            collapsed ? "px-2" : ""
                                        )}
                                    >
                                        {collapsed ? t("common.no") : t("common.cancel")}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </motion.aside>
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
                            {!profileLoaded ? navPlaceholder : navSections.map((section, sectionIndex) => (
                                <div key={section.titleKey} className={sectionIndex > 0 ? "mt-5" : undefined}>
                                    <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3 px-3">
                                        {t(section.titleKey)}
                                    </div>
                                    {section.items.map((item) => {
                                        const isActive = pathname === item.href;
                                        return (
                                        <TransitionLink
                                            key={item.href}
                                            href={item.href}
                                            prefetch={true}
                                            onClick={handleNavClick}
                                            onMouseEnter={() => {
                                                // Intent-based rigorous prefetching
                                                if (["/products", "/finances"].includes(item.href)) prefetchProducts();
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
                                </div>
                            ))}
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
