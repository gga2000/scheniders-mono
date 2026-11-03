"use client";

import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/initials";

interface SupplierInitialsBadgeProps {
    name: string;
    size?: "xs" | "sm" | "md";
    className?: string;
}

const PALETTE = [
    "bg-teal-100 text-teal-700 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30",
    "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
    "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
    "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
    "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
    "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30",
    "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-500/30",
];

function colorFor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function SupplierInitialsBadge({
    name,
    size = "xs",
    className,
}: SupplierInitialsBadgeProps) {
    if (!name) return null;
    const initials = initialsOf(name);
    const color = colorFor(name);

    const sizing =
        size === "md"
            ? "w-7 h-7 text-[11px]"
            : size === "sm"
            ? "w-6 h-6 text-[10px]"
            : "w-5 h-5 text-[9px]";

    return (
        <span
            title={name}
            className={cn(
                "inline-flex items-center justify-center rounded-full ring-1 font-semibold tabular-nums",
                sizing,
                color,
                className
            )}
        >
            {initials}
        </span>
    );
}

interface SupplierStackProps {
    names: string[];
    max?: number;
    size?: "xs" | "sm" | "md";
}

export function SupplierInitialsStack({ names, max = 3, size = "xs" }: SupplierStackProps) {
    const unique = Array.from(new Set(names.filter(Boolean)));
    if (unique.length === 0) return null;
    const shown = unique.slice(0, max);
    const overflow = unique.length - shown.length;

    return (
        <div className="inline-flex items-center -space-x-1.5">
            {shown.map((n) => (
                <SupplierInitialsBadge
                    key={n}
                    name={n}
                    size={size}
                    className="ring-2 ring-[var(--card-bg)]"
                />
            ))}
            {overflow > 0 && (
                <span
                    title={unique.slice(max).join(", ")}
                    className={cn(
                        "inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600 ring-2 ring-[var(--card-bg)] font-semibold dark:bg-slate-500/15 dark:text-slate-300",
                        size === "md" ? "w-7 h-7 text-[11px]" : size === "sm" ? "w-6 h-6 text-[10px]" : "w-5 h-5 text-[9px]"
                    )}
                >
                    +{overflow}
                </span>
            )}
        </div>
    );
}
