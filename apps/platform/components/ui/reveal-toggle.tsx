"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface RevealToggleProps {
    className?: string;
    /** Icon size in px. Defaults to 14. */
    size?: number;
}

/**
 * Eye icon that reveals/hides financial data. Privileged users toggle global
 * reveal state; everyone else gets a brief "no permission" message.
 */
export function RevealToggle({ className, size = 14 }: RevealToggleProps) {
    const { revealed, canReveal, toggle } = useFinancialVisibility();
    const { language } = useLanguage();
    const [denied, setDenied] = useState(false);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (canReveal) {
            toggle();
            return;
        }
        setDenied(true);
        window.setTimeout(() => setDenied(false), 1500);
    };

    if (denied) {
        return (
            <span
                className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 whitespace-nowrap",
                    className
                )}
            >
                <Lock style={{ width: size - 2, height: size - 2 }} />
                {language === "ar" ? "لا تملك صلاحية" : "No permission"}
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            aria-label={revealed ? "Hide financial data" : "Show financial data"}
            title={revealed ? "Hide" : "Show"}
            className={cn(
                "inline-flex items-center justify-center text-muted hover:text-foreground transition-colors shrink-0",
                className
            )}
        >
            {revealed ? (
                <EyeOff style={{ width: size, height: size }} />
            ) : (
                <Eye style={{ width: size, height: size }} />
            )}
        </button>
    );
}
