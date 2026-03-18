"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpandToggleProps {
    isExpanded: boolean;
    onToggle: () => void;
    label?: string;
}

export function ExpandToggle({ isExpanded, onToggle, label = "Details" }: ExpandToggleProps) {
    return (
        <button
            onClick={onToggle}
            className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Hide' : 'Show'} ${label}`}
        >
            <ChevronDown
                className={cn(
                    "w-4 h-4 transition-transform duration-300",
                    isExpanded && "rotate-180"
                )}
            />
            <span>{isExpanded ? "Hide" : "Show"} {label}</span>
        </button>
    );
}
