"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function FormatCard({
    active,
    onClick,
    icon,
    label,
    ext
}: {
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    ext: string
}) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-200 relative",
                active
                    ? "bg-[var(--card-bg)] border-[var(--vault-border)] shadow-[var(--card-shadow)] ring-1 ring-[var(--vault-border)]"
                    : "bg-[var(--background)] border-[var(--card-border)] hover:border-[var(--border-hover)]"
            )}
        >
            {active && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[var(--vault-accent)] text-[var(--vault-accent-contrast)] flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
            )}
            {icon}
            <div className="text-center mt-1">
                <div className={cn("text-sm font-medium", active ? "text-[var(--foreground)]" : "text-[var(--foreground-muted)]")}>{label}</div>
                <div className="text-[10px] text-[var(--foreground-subtle)] mt-0.5 uppercase tracking-wide">{ext}</div>
            </div>
        </button>
    );
}
