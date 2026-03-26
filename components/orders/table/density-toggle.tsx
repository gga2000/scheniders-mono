"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { AlignJustify, List, StretchHorizontal } from "lucide-react";

export type TableDensity = "compact" | "comfortable" | "spacious";

interface DensityToggleProps {
    density: TableDensity;
    onChange: (density: TableDensity) => void;
}

const options: Array<{ value: TableDensity; icon: typeof List; label: string }> = [
    { value: "compact", icon: AlignJustify, label: "Compact" },
    { value: "comfortable", icon: List, label: "Comfortable" },
    { value: "spacious", icon: StretchHorizontal, label: "Spacious" },
];

export const DensityToggle = memo(function DensityToggle({ density, onChange }: DensityToggleProps) {
    return (
        <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/50 p-0.5">
            {options.map((opt) => {
                const Icon = opt.icon;
                return (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            "p-1.5 rounded-md transition-all text-xs",
                            density === opt.value
                                ? "bg-white shadow-sm text-primary"
                                : "text-muted hover:text-foreground"
                        )}
                        title={opt.label}
                    >
                        <Icon className="w-3.5 h-3.5" />
                    </button>
                );
            })}
        </div>
    );
});
