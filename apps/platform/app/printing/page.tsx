"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { usePrinting } from "@/hooks/use-printing";
import { useDispatchQueue, DISPATCH_QUEUE_KEY } from "@/hooks/use-dispatch-queue";
import { useDispatchRun } from "@/hooks/use-dispatch-run";
import { useDuplicateWindowAlerts } from "@/hooks/use-duplicate-window-alerts";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getQueueFlags, groupForPacking, hasBlockingFlag, type PackGroup } from "@/lib/dispatch-queue";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { ordersOfRun } from "@/lib/print-runs";
import { baghdadDayKey, type OrderWindow } from "@/lib/order-window";
import type { Order, PrintBatch } from "@/lib/supabase";
import { OrderCard } from "@/components/printing/order-card";
import { DeskToolbar, type DeskIssue } from "@/components/printing/desk-toolbar";
import { LabelPreviewRail } from "@/components/printing/label-preview-rail";
import { DispatchActionBar } from "@/components/printing/dispatch-action-bar";
import { RunHistory } from "@/components/printing/run-history";
import { PackGroupHeader } from "@/components/printing/pack-group-header";
import { ReprintWarningModal } from "@/components/printing/reprint-warning-modal";
import { ShipRunDialog } from "@/components/printing/ship-run-dialog";

type View = "today" | "history";

const ISSUE_TEST: Record<DeskIssue, (o: Order) => boolean> = {
    blocked: (o) => hasBlockingFlag(getQueueFlags(o)),
    printed: (o) => (o.print_count ?? 0) > 0,
};

const GROUP_LABEL_KEY = {
    single: "printing.groupSingle",
    multi: "printing.groupMulti",
    replacement: "printing.groupReplacement",
    refund: "printing.groupRefund",
} as const;

const canPrint = (o: Order) => !hasBlockingFlag(getQueueFlags(o));

/** Ticked unless it can't print or is postponed to a later day. */
const tickedByDefault = (o: Order) => {
    const flags = getQueueFlags(o);
    return !hasBlockingFlag(flags) && !flags.scheduledLater;
};

export default function PrintingPage() {
    const { bulkUpdateStatus } = useOrdersContext();
    const queue = useDispatchQueue();
    const printing = usePrinting();
    const queryClient = useQueryClient();
    const { t, language } = useLanguage();

    const [view, setView] = useState<View>("today");
    const [query, setQuery] = useState("");
    const [group, setGroup] = useState<string | null>(null);
    const [issue, setIssue] = useState<DeskIssue | null>(null);
    // Ticks the user changed by hand; every other order follows tickedByDefault.
    const [ticks, setTicks] = useState<ReadonlyMap<string, boolean>>(new Map());
    const [focusId, setFocusId] = useState<string | null>(null);
    const [reprintOpen, setReprintOpen] = useState(false);
    const [shipOpen, setShipOpen] = useState(false);
    const [busyRunId, setBusyRunId] = useState<string | null>(null);

    // The queue in packing order: each group's labels come off the printer together.
    const groups = useMemo(() => groupForPacking(queue.data ?? []), [queue.data]);
    const orders = useMemo(() => groups.flatMap((g) => g.orders), [groups]);
    const isTicked = (o: Order) => canPrint(o) && (ticks.get(o.id) ?? tickedByDefault(o));
    const selected = orders.filter(isTicked);

    const groupLabel = (g: PackGroup<Order>) =>
        g.kind === "item" ? (g.item ?? "") : t(GROUP_LABEL_KEY[g.kind]);

    // Groups after the search, group and problem filters; empty groups drop out.
    const visibleGroups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const keep = (o: Order) =>
            (!issue || ISSUE_TEST[issue](o)) &&
            (!q || o.customer_name.toLowerCase().includes(q) || o.phone.includes(q) || o.order_id.toLowerCase().includes(q));
        return groups
            .filter((g) => !group || g.key === group)
            .map((g) => ({ ...g, orders: g.orders.filter(keep) }))
            .filter((g) => g.orders.length > 0);
    }, [groups, group, query, issue]);
    const visible = visibleGroups.flatMap((g) => g.orders);

    const issueCounts = useMemo(
        () => ({
            blocked: orders.filter(ISSUE_TEST.blocked).length,
            printed: orders.filter(ISSUE_TEST.printed).length,
        }),
        [orders]
    );
    const groupChips = groups.map((g) => ({ key: g.key, label: groupLabel(g), count: g.orders.length }));

    const selectable = visible.filter(canPrint);
    const allSelected = selectable.length > 0 && selectable.every(isTicked);
    const focused = visible.find((o) => o.id === focusId) ?? visible[0] ?? null;
    const focusIndex = focused ? visible.indexOf(focused) : -1;

    const setTick = (ids: readonly string[], value: boolean) =>
        setTicks((prev) => {
            const next = new Map(prev);
            for (const id of ids) next.set(id, value);
            return next;
        });

    const refreshQueue = () => queryClient.invalidateQueries({ queryKey: DISPATCH_QUEUE_KEY });

    const run = useDispatchRun({ printing, bulkUpdateStatus });

    // The 48h double-dispatch check needs the queue's own span plus its margin:
    // a twin already handed to the courier is no longer in the queue.
    const queueWindow = useMemo((): OrderWindow => {
        const times = orders.map((o) => Date.parse(o.created_at)).filter((ms) => !Number.isNaN(ms));
        if (times.length === 0) return null;
        const fromInstant = Math.min(...times);
        const toInstant = Math.max(...times);
        return { fromInstant, toInstant, fromDay: baghdadDayKey(fromInstant), toDay: baghdadDayKey(toInstant) };
    }, [orders]);
    const { getConfirmBlockingTwin } = useDuplicateWindowAlerts(orders, queueWindow);

    const reprints = selected.filter(ISSUE_TEST.printed);

    // Straight to the printer; nothing ships. Orders printed before get a warning first.
    const printLabels = async (list: Order[]) => {
        await run.printLabels(list);
        // Printing bumps print counts; reload so the "printed" chips are current.
        await refreshQueue();
    };
    const startPrint = () => {
        if (reprints.length > 0) setReprintOpen(true);
        else void printLabels(selected);
    };

    const shipRun = async (list: Order[]) => {
        if (!(await run.ship(list))) return;
        setShipOpen(false);
        setTicks(new Map());
        await refreshQueue();
    };

    // The ship dialog's breakdown: the packing groups of the ticked orders only.
    const selectedGroups = groups
        .map((g) => ({ key: g.key, label: groupLabel(g), count: g.orders.filter(isTicked).length }))
        .filter((g) => g.count > 0);

    const fromRun = async (batch: PrintBatch, act: (runOrders: Order[]) => Promise<void>) => {
        setBusyRunId(batch.id);
        try {
            const runOrders = await ordersOfRun(batch, orders);
            if (runOrders.length === 0) {
                toast.warning(t("printing.historyGone"));
                return;
            }
            await act(runOrders);
        } catch (err) {
            toast.error(t("printing.historyLoadFailed"), err instanceof Error ? err.message : undefined);
        } finally {
            setBusyRunId(null);
        }
    };

    const today = new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Asia/Baghdad",
    }).format(new Date());

    return (
        <div className="min-h-screen p-6 md:p-8">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
                <header className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("printing.title")}</h1>
                        <p className="mt-1 text-muted">
                            {view === "today" ? t("printing.subtitle", { date: today }) : t("printing.historySubtitle")}
                        </p>
                    </div>
                    <div role="tablist" className="flex rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-1">
                        {(["today", "history"] as const).map((tab) => (
                            <button
                                key={tab}
                                role="tab"
                                aria-selected={view === tab}
                                onClick={() => setView(tab)}
                                className={cn(
                                    "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                                    view === tab ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                                )}
                            >
                                {tab === "today" ? t("printing.view_queue") : t("printing.view_history")}
                            </button>
                        ))}
                    </div>
                </header>

                {view === "history" ? (
                    <RunHistory
                        batches={printing.batches.data ?? []}
                        busyId={busyRunId}
                        onPdf={(batch) => void fromRun(batch, run.downloadLabels)}
                        onPrimeFile={(batch) => void fromRun(batch, run.primeFileAgain)}
                    />
                ) : queue.isPending ? (
                    <div className="grid h-64 place-items-center rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-sm text-muted">
                        {t("printing.loading")}
                    </div>
                ) : queue.isError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900 dark:bg-rose-950/40">
                        <p className="font-semibold text-rose-900 dark:text-rose-200">{t("printing.errorTitle")}</p>
                        <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{queue.error.message}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-5">
                        <div className="flex min-w-0 flex-col gap-3">
                            <section className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]">
                                <DeskToolbar
                                    selectedCount={selected.length}
                                    query={query}
                                    onQuery={setQuery}
                                    groups={groupChips}
                                    group={group}
                                    onGroup={setGroup}
                                    issueCounts={issueCounts}
                                    issue={issue}
                                    onIssue={setIssue}
                                    selectableCount={selectable.length}
                                    allSelected={allSelected}
                                    onSelectAll={() => setTick(selectable.map((o) => o.id), !allSelected)}
                                />
                                {visible.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <p className="font-medium text-foreground">
                                            {t(orders.length === 0 ? "printing.noOrders" : "printing.noMatches")}
                                        </p>
                                        {orders.length === 0 && <p className="mt-1 text-sm text-muted">{t("printing.noOrdersDesc")}</p>}
                                    </div>
                                ) : (
                                    visibleGroups.map((g) => {
                                        const printable = g.orders.filter(canPrint);
                                        const allTicked = printable.length > 0 && printable.every(isTicked);
                                        return (
                                            <div key={g.key}>
                                                <PackGroupHeader
                                                    kind={g.kind}
                                                    label={groupLabel(g)}
                                                    orderCount={g.orders.length}
                                                    pieces={
                                                        g.kind === "item"
                                                            ? g.orders.reduce((sum, o) => sum + mergeOrderItems(o.items).reduce((n, i) => n + i.quantity, 0), 0)
                                                            : null
                                                    }
                                                    allTicked={allTicked}
                                                    canTick={printable.length > 0}
                                                    onToggle={() => setTick(printable.map((o) => o.id), !allTicked)}
                                                />
                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2 p-3">
                                                    {g.orders.map((order) => (
                                                        <OrderCard
                                                            key={order.id}
                                                            order={order}
                                                            selected={isTicked(order)}
                                                            focused={focused?.id === order.id}
                                                            showItems={g.kind !== "item"}
                                                            onToggle={() => setTick([order.id], !isTicked(order))}
                                                            onFocus={() => setFocusId(order.id)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </section>
                            <DispatchActionBar
                                selectedCount={selected.length}
                                shipping={run.shipping}
                                onShip={() => setShipOpen(true)}
                                onPrint={startPrint}
                            />
                        </div>
                        <LabelPreviewRail
                            order={focused}
                            position={focusIndex + 1}
                            total={visible.length}
                            onStep={(delta) => {
                                if (visible.length === 0) return;
                                setFocusId(visible[(focusIndex + delta + visible.length) % visible.length].id);
                            }}
                        />
                    </div>
                )}
            </div>

            <ShipRunDialog
                open={shipOpen}
                onOpenChange={setShipOpen}
                orders={selected}
                groups={selectedGroups}
                heldBackCount={issueCounts.blocked}
                getDispatchTwin={getConfirmBlockingTwin}
                onRemove={(ids) => setTick(ids, false)}
                shipping={run.shipping}
                onShip={(list) => void shipRun(list)}
            />

            <ReprintWarningModal
                isOpen={reprintOpen}
                onClose={() => setReprintOpen(false)}
                reprintOrders={reprints}
                onConfirm={() => {
                    void printLabels(selected);
                    setReprintOpen(false);
                }}
                onPrintNewOnly={() => {
                    const fresh = selected.filter((o) => !ISSUE_TEST.printed(o));
                    if (fresh.length > 0) void printLabels(fresh);
                    setReprintOpen(false);
                }}
            />
        </div>
    );
}
