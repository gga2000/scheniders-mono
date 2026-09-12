"use client";

import { LayoutDashboard, Paintbrush, Star, ShoppingCart } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { TransitionLink } from "@/components/layout/transition-link";

/**
 * Reviews and cart recovery are storefront surfaces, not standalone destinations —
 * they used to sit in the sidebar as separate entries. They now live inside Store,
 * reached through this bar.
 */
const TABS = [
    { key: "nav.storeOverview", href: "/store", icon: LayoutDashboard },
    { key: "nav.storeEditor", href: "/store/edit", icon: Paintbrush },
    { key: "nav.reviews", href: "/store/reviews", icon: Star },
    { key: "nav.recovery", href: "/store/recovery", icon: ShoppingCart },
] as const;

export function StoreTabs() {
    const pathname = usePathname();
    const { t } = useLanguage();

    return (
        <nav
            aria-label={t("nav.store")}
            className="flex items-center gap-1 overflow-x-auto scrollbar-hide border-b border-[var(--card-border)] px-4 sm:px-6"
        >
            {TABS.map(tab => {
                const isActive = pathname === tab.href;
                const Icon = tab.icon;
                return (
                    <TransitionLink
                        key={tab.href}
                        href={tab.href}
                        className={cn(
                            "relative flex items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors",
                            isActive
                                ? "text-foreground"
                                : "text-muted hover:text-foreground"
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        {t(tab.key)}
                        {isActive && (
                            <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[var(--primary)]" />
                        )}
                    </TransitionLink>
                );
            })}
        </nav>
    );
}
