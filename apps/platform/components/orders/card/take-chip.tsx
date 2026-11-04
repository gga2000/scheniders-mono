"use client";

import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { TakeKind } from "@/types/order";

/** Marks stock taken in person (not a sale): "Taken · Staff". */
export function TakeChip({ kind, className }: { kind: TakeKind | null | undefined; className?: string }) {
    const { t } = useLanguage();
    if (!kind) return null;
    return (
        <span
            title={t("orders.create.takeNote")}
            className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold",
                "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-400/15 dark:text-slate-200 dark:border-slate-400/30",
                className,
            )}
        >
            <Gift className="w-3 h-3" aria-hidden="true" />
            {t("orders.create.typeTake")} · {t(`orders.create.takeKind.${kind}`)}
        </span>
    );
}
