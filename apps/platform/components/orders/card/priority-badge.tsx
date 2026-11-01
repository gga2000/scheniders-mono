"use client";

import { Flame, Flag } from "lucide-react";
import type { Order } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";

export function PriorityBadge({ priority }: { priority: Order["priority"] }) {
    const { t } = useLanguage();
    if (priority === "urgent") {
        return (
            <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-bold rounded-full bg-red-100 text-red-700 uppercase tracking-wider animate-pulse">
                <Flame className="w-3 h-3" />
                {t("common.urgent")}
            </span>
        );
    }
    if (priority === "high") {
        return (
            <span className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-bold rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">
                <Flag className="w-3 h-3" />
                {t("common.high")}
            </span>
        );
    }
    return null;
}
