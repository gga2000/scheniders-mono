"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface DarkModeToggleProps {
    darkMode: boolean;
    onChange: (dark: boolean) => void;
}

export function DarkModeToggle({ darkMode, onChange }: DarkModeToggleProps) {
    return (
        <button
            type="button"
            onClick={() => onChange(!darkMode)}
            aria-label={darkMode ? "Switch to light mode preview" : "Switch to dark mode preview"}
            className={cn(
                "p-1.5 rounded-lg border transition-colors",
                darkMode
                    ? "bg-zinc-800 border-zinc-700 text-yellow-400"
                    : "bg-white border-(--card-border) text-zinc-500 hover:text-zinc-700"
            )}
        >
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
    );
}
