"use client";

import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { canAccessRoute } from "@/lib/route-permissions";

/** Tools-bar button that shows or hides today's Meta chips. Only people who can open /ads see it. */
export function AdsChipsToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
    const { t } = useLanguage();
    const { role, permissions } = useAuth();
    if (!canAccessRoute("/ads", role, permissions)) return null;
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={active}
            className={cn(
                "p-2.5 rounded-xl transition-all duration-300",
                active
                    ? "bg-sky-100 text-sky-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                    : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5",
            )}
            title={t("ads.chipsToggle")}
            aria-label={t("ads.chipsToggle")}
        >
            <Megaphone className="w-4 h-4" />
        </button>
    );
}
