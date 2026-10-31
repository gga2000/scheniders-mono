"use client";

import { cn } from "@/lib/utils";

interface RestoreScopeRowProps {
    label: string;
    total: number;
    counts: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

/** One table in the restore preview: a visible checkbox, its name, and what restoring it would do. */
export function RestoreScopeRow({ label, total, counts, checked, onChange }: RestoreScopeRowProps) {
    return (
        <label
            className={cn(
                "flex items-center gap-3 rounded-lg border bg-[var(--card-bg)] px-3 py-2.5 cursor-pointer transition-opacity",
                checked ? "border-[var(--vault-accent)]" : "border-[var(--card-border)] opacity-60",
            )}
        >
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 flex-shrink-0 accent-[var(--vault-accent)]"
            />
            <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-[var(--foreground-subtle)]">{counts}</span>
            </span>
            <span className="text-lg font-semibold tabular-nums">{total}</span>
        </label>
    );
}
