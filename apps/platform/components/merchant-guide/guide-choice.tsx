"use client";

import { cn } from "@/lib/utils";

/** A row of answer chips. */
export function GuideChoice<T extends string>({
    options,
    value,
    onChange,
    tone,
    label,
}: {
    options: readonly { id: T; label: string }[];
    value: T | null;
    onChange: (id: T) => void;
    tone: "dark" | "light";
    label: string;
}) {
    return (
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
            {options.map((o) => {
                const on = value === o.id;
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(o.id)}
                        className={cn(
                            "h-9 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2",
                            tone === "dark"
                                ? on
                                    ? "border-[#EFFF00] bg-[#EFFF00] font-bold text-neutral-900 focus-visible:ring-white"
                                    : "border-white/25 text-white hover:bg-white/10 focus-visible:ring-[#EFFF00]"
                                : on
                                    ? "border-neutral-900 bg-neutral-900 font-semibold text-white focus-visible:ring-[#EFFF00]"
                                    : "border-[var(--card-border)] text-foreground hover:bg-[var(--background)] focus-visible:ring-neutral-900",
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
