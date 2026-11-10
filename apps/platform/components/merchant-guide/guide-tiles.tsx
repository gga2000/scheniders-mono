"use client";

import type { LucideIcon } from "lucide-react";
import { useTextDir } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export interface GuideTileOption<T extends string> {
    id: T;
    label: string;
    hint: string;
    icon: LucideIcon;
}

/** Two big answer tiles with an icon and a short line under each. */
export function GuideTiles<T extends string>({
    options,
    value,
    onChange,
    label,
}: {
    options: readonly GuideTileOption<T>[];
    value: T | null;
    onChange: (id: T) => void;
    label: string;
}) {
    const dir = useTextDir();
    return (
        <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
            {options.map((o) => {
                const on = value === o.id;
                const Icon = o.icon;
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(o.id)}
                        data-testid={`merchant-guide-tile-${o.id}`}
                        className={cn(
                            "grid gap-1.5 rounded-xl border-[1.5px] p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900",
                            on
                                ? "border-neutral-900 bg-[#FBFFD1] text-neutral-900 shadow-[inset_0_0_0_2px_#EFFF00]"
                                : "border-[var(--card-border)] bg-[var(--background)] text-foreground hover:border-neutral-400",
                        )}
                    >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                        <span dir={dir} className="text-sm font-bold">
                            {o.label}
                        </span>
                        <span dir={dir} className={cn("text-xs", on ? "text-neutral-600" : "text-muted-foreground")}>
                            {o.hint}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
