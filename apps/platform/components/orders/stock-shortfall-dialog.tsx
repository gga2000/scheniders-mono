"use client";

import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import type { StockShortfall } from "@/lib/orders/stock-shortfall";

interface StockShortfallDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    shortfalls: StockShortfall[];
    /** Go ahead with the held confirm. */
    onConfirmAnyway: () => void;
}

/**
 * Shown before a confirm that needs more of a product than is free to sell.
 * Staff can still confirm (stock may arrive today); the point is that nobody
 * oversells without seeing it.
 */
export function StockShortfallDialog({ open, onOpenChange, shortfalls, onConfirmAnyway }: StockShortfallDialogProps) {
    const { t } = useLanguage();
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        {t("orders.stockShortfall.title", "Not enough stock")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("orders.stockShortfall.body", "Confirming will sell more than you have. Confirm anyway?")}
                    </DialogDescription>
                </DialogHeader>
                <ul className="my-3 space-y-2">
                    {shortfalls.map(s => (
                        <li key={s.key} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
                            <span className="min-w-0">
                                <span className="block truncate text-left text-sm font-semibold" dir="auto">{s.name}</span>
                                <span className="text-[11px] text-[var(--foreground-muted)]">
                                    {s.isOpenBox ? t("orders.stockToday.openBox", "Open box") : t("orders.stockToday.new", "New")}
                                </span>
                            </span>
                            <span className="shrink-0 text-right text-xs tabular-nums">
                                <span className="block font-semibold">{t("orders.stockShortfall.needs", "Needs {count}", { count: s.need })}</span>
                                <span className={s.left < 0 ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}>
                                    {s.left < 0
                                        ? t("orders.stockShortfall.alreadyOver", "Already {count} over", { count: Math.abs(s.left) })
                                        : t("orders.stockShortfall.onlyLeft", "Only {count} left", { count: s.left })}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
                <DialogFooter className="gap-2">
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:bg-white/10 dark:text-foreground"
                    >
                        {t("orders.stockShortfall.cancel", "Cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onOpenChange(false);
                            onConfirmAnyway();
                        }}
                        className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-amber-600"
                    >
                        {t("orders.stockShortfall.confirmAnyway", "Confirm anyway")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
