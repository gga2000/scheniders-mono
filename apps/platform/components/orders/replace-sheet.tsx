"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Minus, Plus, Trash2, Truck, Store } from "lucide-react";
import {
    Dialog,
    DialogContent,
    BottomSheetContent,
    DialogTitle,
    DialogDescription,
} from "@scheniders/ui/dialog";
import { Textarea } from "@scheniders/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";
import { previewReplacement } from "@/lib/after-sale/replacement-math";
import type { RefundableLine, RefundSelection } from "@/lib/refunds/refund-math";
import { cn, formatIQD } from "@/lib/utils";
import { ProductPicker } from "./product-picker";

export interface ReplacementOutItem {
    productId: string;
    name: string;
    price: number;
    quantity: number;
}

export interface ReplacementRequest {
    lines: RefundSelection[];
    outItems: ReplacementOutItem[];
    chargeFee: boolean;
    note: string;
}

interface ReplaceSheetProps {
    open: boolean;
    onClose: () => void;
    /** The original order's number, as shown to staff (e.g. 3951). */
    orderNumber: string;
    lines: RefundableLine[];
    /** The store's default delivery fee for a replacement trip. */
    defaultFee: number;
    onSubmit: (request: ReplacementRequest) => Promise<{ success: boolean; error?: string }>;
}

/**
 * The replace sheet: pick what comes back, pick what goes out, choose who
 * pays the trip, and read what the courier does at the door. The total is a
 * preview; create_after_sale_order prices both sides itself.
 */
export function ReplaceSheet({ open, onClose, orderNumber, lines, defaultFee, onSubmit }: ReplaceSheetProps) {
    const isMobile = useIsMobile();
    const { t } = useLanguage();

    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [outItems, setOutItems] = useState<ReplacementOutItem[]>([]);
    const [chargeFee, setChargeFee] = useState(true);
    const [note, setNote] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // A single-item order is the usual swap, so its item starts selected.
    useEffect(() => {
        if (!open) return;
        const only = lines.length === 1 ? lines[0] : null;
        setQuantities(only ? { [only.index]: only.remainingQuantity } : {});
        setOutItems([]);
        setChargeFee(defaultFee > 0);
        setNote("");
        setError(null);
    }, [open, lines, defaultFee]);

    const selection: RefundSelection[] = lines.map((l) => ({ index: l.index, quantity: quantities[l.index] ?? 0 }));
    const preview = previewReplacement(lines, selection, outItems, defaultFee, chargeFee);
    const canSubmit = preview.backLines.length > 0 && outItems.length > 0 && !submitting;

    const setBackQuantity = (line: RefundableLine, next: number) =>
        setQuantities((q) => ({ ...q, [line.index]: Math.min(line.remainingQuantity, Math.max(0, next)) }));

    const setOutQuantity = (i: number, next: number) =>
        setOutItems((items) => items.map((item, j) => (j === i ? { ...item, quantity: Math.max(1, next) } : item)));

    async function handleSubmit() {
        setSubmitting(true);
        setError(null);
        const result = await onSubmit({
            lines: preview.backLines.map((l) => ({ index: l.index, quantity: l.quantity })),
            outItems,
            chargeFee,
            note: note.trim(),
        });
        setSubmitting(false);
        if (result.success) onClose();
        else setError(result.error ?? t("replace.error"));
    }

    const ContentWrapper = isMobile ? BottomSheetContent : DialogContent;
    const collect = preview.courierAmount >= 0;

    return (
        <>
            <Dialog open={open} onOpenChange={(o) => { if (!o && !pickerOpen) onClose(); }} modal={!pickerOpen}>
                <ContentWrapper className={isMobile ? "" : "max-w-lg"} {...(isMobile ? { onClose } : {})}>
                    <div className="flex flex-col gap-5" data-testid="replace-sheet">
                        <div>
                            <DialogTitle className="flex items-center gap-2 text-lg">
                                <ArrowLeftRight className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                                {t("replace.title", { number: orderNumber })}
                            </DialogTitle>
                            <DialogDescription className="mt-1">{t("replace.subtitle")}</DialogDescription>
                        </div>

                        <section aria-labelledby="replace-back">
                            <h3 id="replace-back" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                                {t("replace.comesBack")}
                            </h3>
                            <ul className="divide-y divide-(--card-border) rounded-xl border border-(--card-border)">
                                {lines.map((line) => {
                                    const qty = quantities[line.index] ?? 0;
                                    const done = line.remainingQuantity === 0;
                                    return (
                                        <li key={line.index} className={cn("flex items-center gap-3 p-3", done && "opacity-60")}>
                                            <div className="min-w-0 flex-1">
                                                <p className={cn("truncate text-sm font-medium text-foreground", done && "line-through")}>{line.name}</p>
                                                <p className="text-xs text-muted tabular-nums">
                                                    {line.refundedQuantity > 0
                                                        ? t("replace.alreadyBack", { count: line.refundedQuantity })
                                                        : t("refund.paidForLine", { amount: formatIQD(line.paid) })}
                                                </p>
                                            </div>
                                            {!done && (
                                                <Stepper
                                                    value={t("refund.qtyOf", { qty, total: line.remainingQuantity })}
                                                    onLess={() => setBackQuantity(line, qty - 1)}
                                                    onMore={() => setBackQuantity(line, qty + 1)}
                                                    lessDisabled={qty === 0}
                                                    moreDisabled={qty >= line.remainingQuantity}
                                                    lessLabel={t("replace.less")}
                                                    moreLabel={t("replace.more")}
                                                />
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>

                        <section aria-labelledby="replace-out">
                            <h3 id="replace-out" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                                {t("replace.goesOut")}
                            </h3>
                            {outItems.length > 0 && (
                                <ul className="mb-2 divide-y divide-(--card-border) rounded-xl border border-violet-200 dark:border-violet-500/30">
                                    {outItems.map((item, i) => (
                                        <li key={`${item.productId}-${i}`} className="flex items-center gap-3 p-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                                                <p className="text-xs text-muted tabular-nums">{formatIQD(item.price * item.quantity)}</p>
                                            </div>
                                            <Stepper
                                                value={String(item.quantity)}
                                                onLess={() => setOutQuantity(i, item.quantity - 1)}
                                                onMore={() => setOutQuantity(i, item.quantity + 1)}
                                                lessDisabled={item.quantity <= 1}
                                                moreDisabled={false}
                                                lessLabel={t("replace.less")}
                                                moreLabel={t("replace.more")}
                                            />
                                            <button
                                                type="button"
                                                aria-label={t("replace.removeItem")}
                                                onClick={() => setOutItems((items) => items.filter((_, j) => j !== i))}
                                                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-rose-600"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <button
                                type="button"
                                onClick={() => setPickerOpen(true)}
                                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 text-sm font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
                            >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                {t("replace.addItem")}
                            </button>
                        </section>

                        {defaultFee > 0 && (
                            <section aria-labelledby="replace-fee">
                                <h3 id="replace-fee" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                                    {t("replace.deliveryFee", { amount: formatIQD(defaultFee) })}
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <FeeOption
                                        selected={chargeFee}
                                        onSelect={() => setChargeFee(true)}
                                        icon={<Truck className="h-4 w-4" aria-hidden="true" />}
                                        label={t("replace.customerPays")}
                                    />
                                    <FeeOption
                                        selected={!chargeFee}
                                        onSelect={() => setChargeFee(false)}
                                        icon={<Store className="h-4 w-4" aria-hidden="true" />}
                                        label={t("replace.storePays")}
                                    />
                                </div>
                            </section>
                        )}

                        <section>
                            <label htmlFor="replace-note" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                                {t("replace.note")}
                            </label>
                            <Textarea id="replace-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                        </section>

                        <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-(--card-border) bg-(--background) px-4 py-4 md:-mx-6 md:-mb-6 md:px-6">
                            <dl className="space-y-1 text-sm tabular-nums">
                                <div className="flex justify-between text-muted">
                                    <dt>{t("replace.newItems")}</dt>
                                    <dd>{formatIQD(preview.newItemsTotal)}</dd>
                                </div>
                                <div className="flex justify-between text-muted">
                                    <dt>{t("replace.creditOld")}</dt>
                                    <dd>−{formatIQD(preview.credit)}</dd>
                                </div>
                                {preview.feeKept > 0 && (
                                    <div className="flex justify-between text-muted">
                                        <dt>{t("replace.feeLine")}</dt>
                                        <dd>+{formatIQD(preview.feeKept)}</dd>
                                    </div>
                                )}
                                <div className="flex items-baseline justify-between pt-1 font-semibold text-foreground">
                                    <dt>{collect ? t("replace.courierCollects") : t("replace.courierPays")}</dt>
                                    <dd className={cn("text-lg", !collect && "text-emerald-700 dark:text-emerald-400")}>
                                        {formatIQD(Math.abs(preview.courierAmount))}
                                    </dd>
                                </div>
                            </dl>
                            {error && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={!canSubmit}
                                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
                            >
                                {submitting
                                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    : <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}
                                {t("replace.create")}
                            </button>
                        </div>
                    </div>
                </ContentWrapper>
            </Dialog>
            <ProductPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={(p) =>
                    setOutItems((items) => [
                        ...items,
                        { productId: p.product_id, name: p.name, price: p.price, quantity: p.quantity },
                    ])
                }
            />
        </>
    );
}

function Stepper({ value, onLess, onMore, lessDisabled, moreDisabled, lessLabel, moreLabel }: {
    value: string;
    onLess: () => void;
    onMore: () => void;
    lessDisabled: boolean;
    moreDisabled: boolean;
    lessLabel: string;
    moreLabel: string;
}) {
    return (
        <div className="flex items-center rounded-lg border border-(--card-border)">
            <button
                type="button"
                aria-label={lessLabel}
                onClick={onLess}
                disabled={lessDisabled}
                className="flex h-11 w-11 items-center justify-center text-foreground disabled:opacity-30"
            >
                <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-10 text-center text-sm font-semibold tabular-nums text-foreground">{value}</span>
            <button
                type="button"
                aria-label={moreLabel}
                onClick={onMore}
                disabled={moreDisabled}
                className="flex h-11 w-11 items-center justify-center text-foreground disabled:opacity-30"
            >
                <Plus className="h-4 w-4" />
            </button>
        </div>
    );
}

function FeeOption({ selected, onSelect, icon, label }: {
    selected: boolean;
    onSelect: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors",
                selected
                    ? "border-foreground bg-foreground/5 font-semibold text-foreground"
                    : "border-(--card-border) text-muted hover:text-foreground",
            )}
        >
            {icon}
            {label}
        </button>
    );
}
