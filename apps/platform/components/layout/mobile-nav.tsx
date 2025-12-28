"use client";

import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Package,
    Users,
    ShoppingBag,
    MoreHorizontal,
    Printer,
    Settings,
    BarChart3,
    X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const PRIMARY_NAV_ITEMS = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/" },
    { label: "Orders", icon: Package, href: "/orders" },
    { label: "Customers", icon: Users, href: "/customers" },
    { label: "Products", icon: ShoppingBag, href: "/products" },
];

const MORE_NAV_ITEMS = [
    { label: "Analytics", icon: BarChart3, href: "/analytics" },
    { label: "Printing", icon: Printer, href: "/printing" },
    { label: "Settings", icon: Settings, href: "/settings" },
];

export function MobileNav() {
    const pathname = usePathname();
    const [showMore, setShowMore] = useState(false);

    // Check if any "more" item is active
    const isMoreActive = MORE_NAV_ITEMS.some(item => pathname === item.href);

    return (
        <>
            {/* More Menu Sheet */}
            <AnimatePresence>
                {showMore && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowMore(false)}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                        />

                        {/* Sheet */}
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--card-bg)] rounded-t-3xl shadow-2xl"
                            style={{ paddingBottom: "var(--safe-area-bottom)" }}
                        >
                            {/* Handle */}
                            <div className="flex justify-center pt-3 pb-2">
                                <div className="w-10 h-1 rounded-full bg-[var(--card-border)]" />
                            </div>

                            {/* Header */}
                            <div className="flex items-center justify-between px-6 pb-4">
                                <h3 className="text-lg font-semibold text-foreground">More</h3>
                                <button
                                    onClick={() => setShowMore(false)}
                                    className="w-8 h-8 rounded-full bg-[var(--background)] flex items-center justify-center"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Menu Items */}
                            <div className="px-4 pb-6 space-y-1">
                                {MORE_NAV_ITEMS.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setShowMore(false)}
                                            className={cn(
                                                "flex items-center gap-4 px-4 py-4 rounded-2xl transition-all",
                                                isActive
                                                    ? "bg-[var(--foreground)] text-white"
                                                    : "text-foreground hover:bg-[var(--background)]"
                                            )}
                                        >
                                            <item.icon className="w-5 h-5" />
                                            <span className="font-medium">{item.label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Bottom Navigation Bar */}
            <nav className="mobile-bottom-nav hide-desktop">
                {PRIMARY_NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "mobile-nav-item",
                                isActive && "active"
                            )}
                        >
                            <item.icon className={cn(
                                "w-6 h-6 transition-transform",
                                isActive && "scale-110"
                            )} />
                            <span>{item.label}</span>
                            {isActive && (
                                <motion.div
                                    layoutId="mobile-nav-indicator"
                                    className="absolute -top-0.5 w-8 h-1 rounded-full bg-[var(--pastel-yellow)]"
                                />
                            )}
                        </Link>
                    );
                })}

                {/* More Button */}
                <button
                    onClick={() => setShowMore(true)}
                    className={cn(
                        "mobile-nav-item relative",
                        isMoreActive && "active"
                    )}
                >
                    <MoreHorizontal className={cn(
                        "w-6 h-6 transition-transform",
                        isMoreActive && "scale-110"
                    )} />
                    <span>More</span>
                    {isMoreActive && (
                        <div className="absolute -top-0.5 w-8 h-1 rounded-full bg-[var(--pastel-yellow)]" />
                    )}
                </button>
            </nav>
        </>
    );
}
