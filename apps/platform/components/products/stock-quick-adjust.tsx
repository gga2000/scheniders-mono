"use client";

import { useState, useEffect, useRef } from "react";
import { Minus, Plus, Loader2, X } from "lucide-react";
import { cn, parseWholeNumber } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useAdjustStockMutation } from "@/hooks/use-products-query";
import { productWriteErrorKey } from "@/lib/product-write-error";

interface StockQuickAdjustProps {
    productId: string;
    productName: string;
    currentStock: number;
    /** Held by open orders; shown so "on hand" matches the card's available count. */
    reserved?: number;
    onClose: () => void;
    anchorRef?: React.RefObject<HTMLElement | null>;
}

const REASONS = [
    { value: "received", labelKey: "products.stockAdjust.received" },
    { value: "sold", labelKey: "products.stockAdjust.sold" },
    { value: "damaged", labelKey: "products.stockAdjust.damaged" },
    { value: "count", labelKey: "products.stockAdjust.count" },
    { value: "other", labelKey: "products.stockAdjust.other" },
] as const;

export function StockQuickAdjust({ productId, productName, currentStock, reserved = 0, onClose }: StockQuickAdjustProps) {
    const { t } = useLanguage();
    const [deltaText, setDeltaText] = useState("0");
    const delta = parseWholeNumber(deltaText, { allowNegative: true }) ?? 0;
    const [reason, setReason] = useState<string>("received");
    const [notes, setNotes] = useState("");
    const adjust = useAdjustStockMutation();
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        // Selected, so typing "5" replaces the starting 0 instead of making "05".
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const newQuantity = currentStock + delta;

    const belowZero = newQuantity < 0;

    const submit = async () => {
        if (belowZero) return;
        if (delta === 0) {
            onClose();
            return;
        }
        try {
            await adjust.mutateAsync({
                productId,
                delta,
                reason,
                notes: notes.trim() || undefined,
            });
            toast.success(t("products.stockAdjust.success").replace("{name}", productName));
            onClose();
        } catch (err) {
            toast.error(t(productWriteErrorKey(err)));
        }
    };

    return (
        <div
            onClick={(e) => e.stopPropagation()}
            className="w-80 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl space-y-3"
        >
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground truncate">
                    {t("products.stockAdjust.title")}
                </div>
                <button
                    onClick={onClose}
                    aria-label={t("common.close")}
                    className="p-1 hover:bg-[var(--background)] rounded-md transition-colors"
                >
                    <X className="w-4 h-4 text-muted" />
                </button>
            </div>

            <div className="flex items-center justify-between bg-[var(--background)] rounded-xl px-3 py-2">
                <span className="text-xs text-muted">
                    {t("products.stockAdjust.current")}
                </span>
                <span className="text-sm font-semibold text-foreground tabular-nums">
                    {currentStock}
                    {reserved > 0 && (
                        <span className="ms-1.5 text-xs font-normal text-muted">
                            {t("products.stock.reservedCount", { count: reserved })}
                        </span>
                    )}
                </span>
            </div>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setDeltaText(String(delta - 1))}
                    className="size-10 shrink-0 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-foreground flex items-center justify-center hover:bg-[var(--card-border)]"
                    aria-label={t("products.stockAdjust.decrease")}
                >
                    <Minus className="w-4 h-4" />
                </button>
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    aria-label={t("products.stockAdjust.change")}
                    value={deltaText}
                    onChange={(e) => setDeltaText(e.target.value)}
                    className="flex-1 min-w-0 h-10 px-3 text-center font-semibold tabular-nums bg-[var(--background)] border border-[var(--card-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                />
                <button
                    type="button"
                    onClick={() => setDeltaText(String(delta + 1))}
                    className="size-10 shrink-0 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-foreground flex items-center justify-center hover:bg-[var(--card-border)]"
                    aria-label={t("products.stockAdjust.increase")}
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            <div className="flex items-center justify-between text-xs">
                <span className="text-muted">{t("products.stockAdjust.new")}</span>
                <span
                    className={cn(
                        "font-semibold",
                        newQuantity > currentStock
                            ? "text-emerald-600 dark:text-emerald-400"
                            : newQuantity < currentStock
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-muted"
                    )}
                >
                    {newQuantity} {delta !== 0 && `(${delta > 0 ? "+" : ""}${delta})`}
                </span>
            </div>
            {belowZero && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                    {t("products.stockAdjust.belowZero")}
                </p>
            )}

            <div>
                <label className="block text-xs font-medium text-muted mb-1">
                    {t("products.stockAdjust.reason")}
                </label>
                <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                >
                    {REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                            {t(r.labelKey)}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-xs font-medium text-muted mb-1">
                    {t("products.stockAdjust.notes")}
                </label>
                <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("products.stockAdjust.notesPlaceholder")}
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                />
            </div>

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-3 py-2 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-border)] transition-colors"
                >
                    {t("products.bulk.cancel")}
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={adjust.isPending || delta === 0 || belowZero}
                    className="flex-1 px-3 py-2 text-sm bg-[var(--ink)] text-white rounded-lg font-medium whitespace-nowrap hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {adjust.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("products.stockAdjust.save")}
                </button>
            </div>
        </div>
    );
}
