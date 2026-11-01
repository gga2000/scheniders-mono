"use client";

import { Boxes, Layers, Package, Repeat, Undo2 } from "lucide-react";
import type { PackKind } from "@/lib/dispatch-queue";
import { useLanguage } from "@/hooks/use-language";

interface PackGroupHeaderProps {
    kind: PackKind;
    label: string;
    orderCount: number;
    /** Units to pull from the shelf for the group (single-product groups only). */
    pieces: number | null;
    allTicked: boolean;
    /** False when nothing in the group can print. */
    canTick: boolean;
    onToggle: () => void;
}

const ICON = { item: Package, single: Boxes, multi: Layers, replacement: Repeat, refund: Undo2 } as const;

/** One packing group's band: tick the whole group, see how many to pull. */
export function PackGroupHeader({ kind, label, orderCount, pieces, allTicked, canTick, onToggle }: PackGroupHeaderProps) {
    const { t } = useLanguage();
    const Icon = ICON[kind];
    return (
        <div className="flex items-center gap-3 border-b border-[var(--card-border)] bg-[var(--background)] px-5 py-2.5">
            <input
                type="checkbox"
                checked={allTicked}
                disabled={!canTick}
                onChange={onToggle}
                aria-label={label}
                className="h-[18px] w-[18px] cursor-pointer rounded-md accent-[var(--foreground)] disabled:cursor-not-allowed"
            />
            <Icon className="h-4 w-4 text-muted" />
            <span className="text-sm font-semibold text-foreground">{label}</span>
            <span className="font-mono text-xs tabular-nums text-muted">{t("printing.groupOrders", { count: orderCount })}</span>
            {pieces !== null && (
                <span className="ms-auto rounded-full bg-[var(--card-bg)] px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {t("printing.groupPieces", { count: pieces })}
                </span>
            )}
        </div>
    );
}
