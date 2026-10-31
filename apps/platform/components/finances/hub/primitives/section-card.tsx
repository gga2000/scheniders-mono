"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SectionCardProps {
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    accent?: "emerald" | "rose" | "amber" | "violet" | "cyan" | "slate";
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
    dense?: boolean;
}

const accentMap: Record<NonNullable<SectionCardProps["accent"]>, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    rose: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
    cyan: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
    slate: "text-slate-600 dark:text-slate-400 bg-slate-500/10",
};

export function SectionCard({
    title,
    subtitle,
    icon: Icon,
    accent = "slate",
    action,
    children,
    className,
    bodyClassName,
    dense = false,
}: SectionCardProps) {
    return (
        <section
            className={cn(
                "rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden",
                className
            )}
        >
            <header className={cn("flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3", dense ? "p-4" : "p-5")}>
                <div className="flex items-center gap-3 min-w-0">
                    {Icon && (
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", accentMap[accent])}>
                            <Icon className="w-4.5 h-4.5" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold text-foreground sm:truncate">{title}</h3>
                        {subtitle && <p className="text-xs text-muted mt-0.5 sm:truncate">{subtitle}</p>}
                    </div>
                </div>
                {action && <div className="min-w-0 max-w-full sm:shrink-0">{action}</div>}
            </header>
            <div className={cn(dense ? "px-4 pb-4" : "px-5 pb-5", bodyClassName)}>{children}</div>
        </section>
    );
}
