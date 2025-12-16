"use client";

import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Settings,
    LogOut,
    Package,
    Users,
    Wallet,
    CalendarDays,
    FileText
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/" },
    { label: "Orders", icon: Package, href: "/orders" }, // Assuming orders table is here or main
    { label: "Patients", icon: Users, href: "/customers" },
    { label: "Schedules", icon: CalendarDays, href: "/schedule" },
    { label: "Billing", icon: Wallet, href: "/billing" },
    { label: "Documents", icon: FileText, href: "/documents" },
    { label: "Settings", icon: Settings, href: "/settings" },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="fixed left-4 top-4 bottom-4 w-64 bg-[#1E1E1E] rounded-[32px] flex flex-col p-6 text-white shadow-2xl z-50">
            {/* 1. Logo Section */}
            <div className="flex items-center gap-3 mb-10 px-2">
                <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center">
                    <Package className="w-5 h-5" />
                </div>
                <span className="text-2xl font-bold tracking-tight">Schenider</span>
            </div>

            {/* 2. Navigation */}
            <nav className="flex-1 space-y-2 overflow-y-auto no-scrollbar">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 px-2">
                    General
                </div>

                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-4 px-4 py-3.5 rounded-[20px] transition-all duration-300 group",
                                isActive
                                    ? "bg-white/10 text-white font-medium"
                                    : "text-zinc-500 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <item.icon className={cn(
                                "w-5 h-5 transition-colors",
                                isActive ? "text-white" : "text-zinc-500 group-hover:text-white"
                            )} />
                            <span>{item.label}</span>

                            {isActive && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-pastel-rose shadow-[0_0_8px_rgba(244,199,207,0.8)]" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* 3. Bottom Actions */}
            <div className="mt-auto pt-6 border-t border-white/5 space-y-2">
                <button className="flex items-center gap-4 px-4 py-3.5 rounded-[20px] text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 w-full transition-all">
                    <LogOut className="w-5 h-5" />
                    <span>Log out</span>
                </button>
            </div>
        </aside>
    );
}
