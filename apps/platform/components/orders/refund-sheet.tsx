"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Undo2, Truck, Hand } from "lucide-react";
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
import { useOrderReasons } from "@/hooks/use-order-reasons";
import { isFallbackReason, type OrderReason } from "@/lib/order-reasons";
import { previewRefund, type RefundableLine, type RefundSelection } from "@/lib/refunds/refund-math";
import { cn, formatIQD } from "@/lib/utils";

export interface RefundRequest {
    lines: RefundSelection[];
    reasonId: string | null;
    reasonLabel: string;
    note: string;
    /** false when the customer keeps the item (money back, no pickup). */
    expectsBack: boolean;
    pickupFeeKept: number;
}

interface RefundSheetProps {
    open: boolean;
    onClose: () => void;
    /** The original order's number, as shown to staff (e.g. 3951). */
    orderNumber: string;
    orderStatusLabel: string;
    paidTotal: number;
    lines: RefundableLine[];
    /** The store's default pickup fee, kept from the refund when the courier collects. */
    defaultPickupFee: number;
    /** Owners and admins may refund without the item coming back. */
    canRefundWithoutPickup: boolean;
    onSubmit: (request: RefundRequest) => Promise<{ success: boolean; error?: string }>;
}

/**
 * The refund sheet: everything still refundable is pre-selected, so a full
 * refund is Refund → reason → Create refund. Lowering a quantity makes it a
 * partial refund. The amount shown is a preview; the database computes the
 * same number from the same rules when the refund is created.
 */
export function RefundSheet({
    open,
    onClose,
    orderNumber,
    orderStatusLabel,
    paidTotal,
    lines,
    defaultPickupFee,
    canRefundWithoutPickup,
    onSubmit,
}: RefundSheetProps) {
    const isMobile = useIsMobile();
    const { t, language } = useLanguage();
    const { reasons } = useOrderReasons("refund", { enabledOnly: true, enabled: open });

    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [reasonId, setReasonId] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [expectsBack, setExpectsBack] = useState(true);
    const [keepPickupFee, setKeepPickupFee] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Every open starts from "refund everything still refundable".
    useEffect(() => {
        if (!open) return;
        setQuantities(Object.fromEntries(lines.map((l) => [l.index, l.remainingQuantity])));
        setReasonId(null);
        setNote("");
        setExpectsBack(true);
        setKeepPickupFee(defaultPickupFee > 0);
        setError(null);
    }, [open, lines, defaultPickupFee]);

    const selection: RefundSelection[] = lines.map((l) => ({ index: l.index, quantity: quantities[l.index] ?? 0 }));
    // No pickup, no pickup fee.
    const deductions = expectsBack && keepPickupFee ? defaultPickupFee : 0;
    const preview = previewRefund(lines, selection, deductions);

    const reason: OrderReason | undefined = reasons.find((r) => r.id === reasonId);
    const reasonLabel = (r: OrderReason) => (language === "en" && r.label_en) || r.label_ar;
    const noteRequired = Boolean(reason?.requires_note) || !expectsBack;
    const canSubmit = preview.lines.length > 0 && !!reason && (!noteRequired || note.trim().length > 0) && !submitting;

    const setQuantity = (line: RefundableLine, next: number) =>
        setQuantities((q) => ({ ...q, [line.index]: Math.min(line.remainingQuantity, Math.max(0, next)) }));

    async function handleSubmit() {
        if (!reason) return;
        setSubmitting(true);
        setError(null);
        const result = await onSubmit({
            lines: preview.lines.map((l) => ({ index: l.index, quantity: l.quantity })),
            reasonId: isFallbackReason(reason) ? null : reason.id,
            reasonLabel: reason.label_ar,
            note: note.trim(),
            expectsBack,
            pickupFeeKept: preview.deductions,
        });
        setSubmitting(false);
        if (result.success) onClose();
        else setError(result.error ?? t("refund.error"));
    }

    const ContentWrapper = isMobile ? BottomSheetContent : DialogContent;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <ContentWrapper className={isMobile ? "" : "max-w-lg"} {...(isMobile ? { onClose } : {})}>
                <div className="flex flex-col gap-5" data-testid="refund-sheet">
                    <div>
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Undo2 className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                            {t("refund.title", { number: orderNumber })}
                        </DialogTitle>
                        <DialogDescription className="mt-1">
                            {t("refund.subtitle", {
                                status: orderStatusLabel,
                                count: lines.reduce((s, l) => s + l.quantity, 0),
                                paid: formatIQD(paidTotal),
                            })}
                        </DialogDescription>
                    </div>

                    <section aria-labelledby="refund-items">
                        <h3 id="refund-items" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                            {t("refund.whatComesBack")}
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
                                                    ? t("refund.alreadyRefunded", { count: line.refundedQuantity })
                                                    : t("refund.paidForLine", { amount: formatIQD(line.paid) })}
                                            </p>
                                        </div>
                                        {!done && (
                                            <div className="flex items-center rounded-lg border border-(--card-border)">
                                                <button
                                                    type="button"
                                                    aria-label={t("refund.less")}
                                                    onClick={() => setQuantity(line, qty - 1)}
                                                    disabled={qty === 0}
                                                    className="flex h-11 w-11 items-center justify-center text-foreground disabled:opacity-30"
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </button>
                                                <span className="min-w-14 text-center text-sm font-semibold tabular-nums text-foreground">
                                                    {t("refund.qtyOf", { qty, total: line.remainingQuantity })}
                                                </span>
                                                <button
                                                    type="button"
                                                    aria-label={t("refund.more")}
                                                    onClick={() => setQuantity(line, qty + 1)}
                                                    disabled={qty >= line.remainingQuantity}
                                                    className="flex h-11 w-11 items-center justify-center text-foreground disabled:opacity-30"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    <section aria-labelledby="refund-reason">
                        <h3 id="refund-reason" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                            {t("refund.reason")}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {reasons.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setReasonId(r.id)}
                                    aria-pressed={reasonId === r.id}
                                    className={cn(
                                        "min-h-11 rounded-full border px-4 text-sm transition-colors",
                                        reasonId === r.id
                                            ? "border-foreground bg-foreground/5 font-semibold text-foreground"
                                            : "border-(--card-border) text-muted hover:text-foreground",
                                    )}
                                >
                                    {reasonLabel(r)}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section aria-labelledby="refund-pickup">
                        <h3 id="refund-pickup" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                            {t("refund.pickup")}
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            <PickupOption
                                selected={expectsBack}
                                onSelect={() => setExpectsBack(true)}
                                icon={<Truck className="h-4 w-4" aria-hidden="true" />}
                                label={t("refund.courierPicksUp")}
                            />
                            <PickupOption
                                selected={!expectsBack}
                                onSelect={() => setExpectsBack(false)}
                                disabled={!canRefundWithoutPickup}
                                icon={<Hand className="h-4 w-4" aria-hidden="true" />}
                                label={t("refund.customerKeeps")}
                            />
                        </div>
                        {!canRefundWithoutPickup && (
                            <p className="mt-1.5 text-xs text-muted">{t("refund.keepOwnersOnly")}</p>
                        )}
                        {expectsBack && defaultPickupFee > 0 && (
                            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    checked={keepPickupFee}
                                    onChange={(e) => setKeepPickupFee(e.target.checked)}
                                    className="h-5 w-5 rounded"
                                />
                                {t("refund.keepPickupFee", { amount: formatIQD(defaultPickupFee) })}
                            </label>
                        )}
                    </section>

                    {noteRequired && (
                        <section>
                            <label htmlFor="refund-note" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                                {t("refund.note")}
                            </label>
                            <Textarea id="refund-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                        </section>
                    )}

                    <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-(--card-border) bg-(--background) px-4 py-4 md:-mx-6 md:-mb-6 md:px-6">
                        <dl className="space-y-1 text-sm tabular-nums">
                            <div className="flex justify-between text-muted">
                                <dt>{t("refund.itemsRefunded")}</dt>
                                <dd>{formatIQD(preview.itemsTotal)}</dd>
                            </div>
                            {preview.deductions > 0 && (
                                <div className="flex justify-between text-muted">
                                    <dt>{t("refund.pickupFeeKept")}</dt>
                                    <dd>−{formatIQD(preview.deductions)}</dd>
                                </div>
                            )}
                            <div className="flex items-baseline justify-between pt-1 font-semibold text-foreground">
                                <dt>{t("refund.customerReceives")}</dt>
                                <dd className="text-lg">{formatIQD(preview.customerReceives)}</dd>
                            </div>
                        </dl>
                        {error && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
                        >
                            {submitting
                                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                : <Undo2 className="h-4 w-4" aria-hidden="true" />}
                            {t("refund.create", { amount: formatIQD(preview.customerReceives) })}
                        </button>
                    </div>
                </div>
            </ContentWrapper>
        </Dialog>
    );
}

function PickupOption({ selected, onSelect, disabled, icon, label }: {
    selected: boolean;
    onSelect: () => void;
    disabled?: boolean;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors disabled:opacity-40",
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
