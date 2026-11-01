"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Check, Copy, FileSpreadsheet, FileText, Printer, RefreshCw, ShieldOff, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@scheniders/ui/dialog";
import { Switch } from "@scheniders/ui/switch";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { doorCash, labelReceiptNumber } from "@/lib/dispatch-label";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { partitionByShipDay } from "@/lib/order-bulk-scope";
import { findDuplicateDispatchPairs, type DuplicateDispatchPair } from "@/lib/duplicate-window";
import { runFileNames } from "@/lib/shipping-labels";
import type { Order } from "@/lib/supabase";

interface ShipRunDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The ticked orders, in packing order. */
    orders: Order[];
    /** Packing groups of the ticked orders, for the breakdown line. */
    groups: ReadonlyArray<{ key: string; label: string; count: number }>;
    /** Orders in the queue that can't ship (no phone or address); never in `orders`. */
    heldBackCount: number;
    /** A committed order of the same customer inside 48h (lib/duplicate-window). */
    getDispatchTwin: (orderId: string) => Order | undefined;
    /** Take orders out of the run (unticks them on the desk). */
    onRemove: (orderIds: string[]) => void;
    shipping: boolean;
    /** Ship exactly these orders: labels PDF, Prime file, in transit. */
    onShip: (orders: Order[]) => void;
}

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * The one gate before orders leave the desk. It shows what the run is (orders,
 * pieces, cash both ways, packing groups), runs the checks that cost money when
 * missed (a second courier to one customer, a postponed order going early,
 * labels printing twice, orders left behind) with a fix next to each, and says
 * exactly what pressing the button does.
 */
export function ShipRunDialog({
    open,
    onOpenChange,
    orders,
    groups,
    heldBackCount,
    getDispatchTwin,
    onRemove,
    shipping,
    onShip,
}: ShipRunDialogProps) {
    const { t } = useLanguage();
    // Off on every open: shipping a postponed order early has to be a decision.
    const [includeLater, setIncludeLater] = useState(false);

    const { scheduledLater } = useMemo(() => partitionByShipDay(orders), [orders]);
    const shipNow = useMemo(() => {
        if (includeLater) return orders;
        const later = new Set(scheduledLater.map((o) => o.id));
        return orders.filter((o) => !later.has(o.id));
    }, [orders, scheduledLater, includeLater]);

    // A pair inside the run shows once, not once from each side.
    const duplicates = useMemo(() => {
        const pairs = findDuplicateDispatchPairs(
            shipNow.map((o) => o.id),
            new Map(shipNow.map((o) => [o.id, o])),
            getDispatchTwin
        );
        const seen = new Set<string>();
        return pairs.filter(({ order, twin }) => {
            const key = [order.id, twin.id].sort().join(":");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [shipNow, getDispatchTwin]);
    const inRun = useMemo(() => new Set(shipNow.map((o) => o.id)), [shipNow]);

    const totals = useMemo(() => {
        let collect = 0;
        let pay = 0;
        let payCount = 0;
        let pieces = 0;
        for (const o of shipNow) {
            const cash = doorCash(o);
            if (cash.direction === "collect") collect += cash.amount;
            if (cash.direction === "pay") {
                pay += cash.amount;
                payCount += 1;
            }
            pieces += mergeOrderItems(o.items).reduce((n, i) => n + i.quantity, 0);
        }
        return { collect, pay, payCount, pieces };
    }, [shipNow]);

    const reprints = shipNow.filter((o) => (o.print_count ?? 0) > 0).length;
    const names = runFileNames(shipNow.length);
    const count = shipNow.length;
    const risky = duplicates.length > 0;

    const handleOpenChange = (next: boolean) => {
        if (shipping) return;
        if (next) setIncludeLater(false);
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent hideCloseButton className="gap-0 p-0 md:max-w-[600px]">
                <div className="flex items-start gap-4 px-6 pb-4 pt-6">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--ink)] text-white">
                        <Truck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                            {t("printing.shipTitle", { count })}
                        </DialogTitle>
                        <DialogDescription className="mt-0.5 text-sm text-muted">{t("printing.shipSubtitle")}</DialogDescription>
                    </div>
                </div>

                <div className="max-h-[min(62vh,620px)] space-y-4 overflow-y-auto px-6 pb-5">
                    {/* The run at a glance */}
                    <dl className="grid grid-cols-3 divide-x divide-[var(--card-border)] rounded-2xl border border-[var(--card-border)] bg-[var(--background)]">
                        <Stat label={t("printing.statOrders")} value={numberFormat.format(count)} />
                        <Stat label={t("printing.statPieces")} value={numberFormat.format(totals.pieces)} />
                        <Stat label={t("printing.statCollect")} value={numberFormat.format(totals.collect)} unit="IQD" />
                    </dl>
                    {totals.payCount > 0 && (
                        <p className="-mt-2 text-xs text-rose-700 dark:text-rose-300">
                            {t("printing.statPay", { count: totals.payCount, amount: numberFormat.format(totals.pay) })}
                        </p>
                    )}

                    {groups.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {groups.map((g) => (
                                <span
                                    key={g.key}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] px-2.5 py-1 text-xs text-foreground"
                                >
                                    <span className="max-w-[180px] truncate">{g.label}</span>
                                    <span className="font-mono tabular-nums text-muted">{g.count}</span>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Checks: what would cost money if missed, each with its fix */}
                    <section aria-label={t("printing.checksTitle")} className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("printing.checksTitle")}</h3>

                        {risky ? (
                            <CheckRow tone="bad" icon={Copy} title={t("printing.checkDupTitle", { count: duplicates.length })} body={t("printing.checkDupBody")}>
                                <ul className="mt-2 space-y-1.5">
                                    {duplicates.map((pair) => (
                                        <DuplicateLine key={pair.order.id} pair={pair} twinInRun={inRun.has(pair.twin.id)} onRemove={onRemove} />
                                    ))}
                                </ul>
                            </CheckRow>
                        ) : (
                            <CheckRow tone="ok" icon={Check} title={t("printing.checkDupOk")} />
                        )}

                        {scheduledLater.length > 0 && (
                            <CheckRow
                                tone="info"
                                icon={CalendarClock}
                                title={t("printing.checkLaterTitle", { count: scheduledLater.length })}
                                body={t(includeLater ? "printing.checkLaterIn" : "printing.checkLaterOut")}
                            >
                                <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                                    <Switch checked={includeLater} onCheckedChange={setIncludeLater} />
                                    {t("printing.checkLaterToggle")}
                                </label>
                            </CheckRow>
                        )}

                        {reprints > 0 ? (
                            <CheckRow tone="warn" icon={Printer} title={t("printing.checkReprintTitle", { count: reprints })} body={t("printing.checkReprintBody")} />
                        ) : (
                            <CheckRow tone="ok" icon={Check} title={t("printing.checkReprintOk")} />
                        )}

                        {heldBackCount > 0 && (
                            <CheckRow tone="mute" icon={ShieldOff} title={t("printing.checkHeldTitle", { count: heldBackCount })} body={t("printing.checkHeldBody")} />
                        )}
                    </section>

                    {/* What the button does */}
                    <section aria-label={t("printing.shipStepsTitle")} className="rounded-2xl border border-dashed border-[var(--card-border)] p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("printing.shipStepsTitle")}</h3>
                        <ol className="mt-2.5 space-y-2 text-sm text-foreground">
                            <Step icon={FileText} text={names.labels} mono />
                            <Step icon={FileSpreadsheet} text={names.prime} mono />
                            <Step icon={Truck} text={t("printing.shipStepTransit", { count })} />
                        </ol>
                        <p className="mt-3 text-xs text-muted">{t("printing.shipStepsNote")}</p>
                    </section>
                </div>

                <div className="flex items-center gap-2 border-t border-[var(--card-border)] bg-[var(--background)] px-6 py-4">
                    {risky && <p className="me-auto text-xs font-medium text-rose-700 dark:text-rose-300">{t("printing.shipRiskHint")}</p>}
                    <button
                        type="button"
                        onClick={() => handleOpenChange(false)}
                        disabled={shipping}
                        className={cn(
                            "h-11 rounded-xl border border-[var(--card-border)] px-4 text-sm font-medium text-foreground hover:bg-[var(--card-bg)] disabled:opacity-50",
                            !risky && "ms-auto"
                        )}
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={() => onShip(shipNow)}
                        disabled={count === 0 || shipping}
                        className={cn(
                            "flex h-11 min-w-[190px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition-colors disabled:opacity-50",
                            risky ? "bg-rose-600 hover:bg-rose-700" : "bg-[var(--ink)] hover:opacity-90"
                        )}
                    >
                        {shipping ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                        {shipping
                            ? t("printing.shipping")
                            : t(risky ? "printing.shipAnyway" : "printing.shipConfirm", { count })}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
    return (
        <div className="px-4 py-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-0.5 flex items-baseline gap-1">
                <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
                {unit && <span className="text-xs text-muted">{unit}</span>}
            </dd>
        </div>
    );
}

const CHECK_TONES = {
    ok: { box: "border-transparent bg-[var(--background)]", icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
    bad: { box: "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30", icon: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
    warn: { box: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30", icon: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
    info: { box: "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/30", icon: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
    mute: { box: "border-transparent bg-[var(--background)]", icon: "bg-[var(--card-bg)] text-muted" },
} as const;

function CheckRow({
    tone,
    icon: Icon,
    title,
    body,
    children,
}: {
    tone: keyof typeof CHECK_TONES;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    body?: string;
    children?: React.ReactNode;
}) {
    return (
        <div className={cn("flex gap-3 rounded-2xl border px-3.5 py-3", CHECK_TONES[tone].box)}>
            <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", CHECK_TONES[tone].icon)}>
                <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
                <p className={cn("text-sm text-foreground", tone !== "ok" && tone !== "mute" && "font-semibold")}>{title}</p>
                {body && <p className="mt-0.5 text-xs text-muted">{body}</p>}
                {children}
            </div>
        </div>
    );
}

function DuplicateLine({
    pair,
    twinInRun,
    onRemove,
}: {
    pair: DuplicateDispatchPair;
    twinInRun: boolean;
    onRemove: (orderIds: string[]) => void;
}) {
    const { t } = useLanguage();
    const { order, twin } = pair;
    const twinState = twinInRun
        ? t("printing.twinInRun")
        : twin.status === "confirmed"
          ? t("printing.twinConfirmed")
          : t("printing.twinShipped");
    return (
        <li className="flex items-center gap-3 rounded-xl bg-[var(--card-bg)] px-3 py-2">
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{order.customer_name}</p>
                <p className="truncate text-xs text-muted">
                    <span className="font-mono tabular-nums">{labelReceiptNumber(order.order_id)}</span>
                    {" ↔ "}
                    <span className="font-mono tabular-nums">{labelReceiptNumber(twin.order_id)}</span>
                    {" · "}
                    {twinState}
                </p>
            </div>
            <button
                type="button"
                onClick={() => onRemove([order.id])}
                className="h-8 shrink-0 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
            >
                {t("printing.removeFromRun")}
            </button>
        </li>
    );
}

function Step({ icon: Icon, text, mono }: { icon: React.ComponentType<{ className?: string }>; text: string; mono?: boolean }) {
    return (
        <li className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 shrink-0 text-muted" />
            <span className={cn("min-w-0 truncate", mono && "text-[13px]")} dir="auto">
                {text}
            </span>
        </li>
    );
}
