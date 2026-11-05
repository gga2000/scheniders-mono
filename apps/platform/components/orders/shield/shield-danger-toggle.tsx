"use client";

import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { DANGER_LIMIT, useShieldDanger } from "@/hooks/use-shield-danger";
import { useOrderStore } from "@/store/use-order-store";

/**
 * Tools-bar switch on the orders page (Ali, 2026-11-05): opens the danger
 * panel (high / medium / low) and sorts the order cards so the lowest Shield
 * Trust score comes first. The badge counts the open orders under 80; it is
 * red when any is under 50.
 */
export function ShieldDangerToggle() {
    const { t } = useLanguage();
    const on = useOrderStore((s) => s.showDangerPanel);
    const setOn = useOrderStore((s) => s.setShowDangerPanel);
    const { count, red } = useShieldDanger();
    const label = on ? t("shield.sort.off") : t("shield.sort.on");

    return (
        <button
            type="button"
            data-shield-sort-toggle
            onClick={() => setOn(!on)}
            aria-pressed={on}
            className={cn(
                "relative p-2.5 rounded-xl transition-all duration-300",
                on
                    ? "bg-rose-100 text-rose-700 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                    : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5",
            )}
            title={label}
            aria-label={count ? `${label} (${count})` : label}
        >
            <ShieldAlert className="w-4 h-4" />
            {count > 0 && (
                <span
                    aria-hidden="true"
                    className={cn(
                        "absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold tabular-nums text-white",
                        red ? "bg-rose-600" : "bg-amber-500",
                    )}
                >
                    {count >= DANGER_LIMIT ? "99+" : count}
                </span>
            )}
        </button>
    );
}
