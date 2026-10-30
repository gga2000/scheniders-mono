"use client";

import { useMemo, useState } from "react";
import { Loader2, Package, Search, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@scheniders/ui/dialog";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useStockTodayQuery } from "@/hooks/use-stock-today-query";
import { ProductThumb } from "@/components/products/product-thumb";
import { StockTodayGlance } from "@/components/orders/stock-today-glance";
import {
    filterStockToday,
    STOCK_STATE_LABEL,
    stockTodaySummary,
    type StockFilter,
    type StockLane,
    type StockLaneFilter,
    type StockState,
    type StockTodayItem,
} from "@/lib/orders/stock-today";

const PAGE = 5;
/** Cards come in rows of two or three; six fills both. */
const GLANCE_PAGE = 6;

type StockView = "glance" | "detailed";
const VIEW_KEY = "stock-today-view";

/** Remembered per browser; storage can be blocked (private mode), then the default stands. */
function readView(): StockView {
    if (typeof window === "undefined") return "glance";
    try {
        return window.localStorage.getItem(VIEW_KEY) === "detailed" ? "detailed" : "glance";
    } catch {
        return "glance";
    }
}

function saveView(view: StockView) {
    try {
        window.localStorage.setItem(VIEW_KEY, view);
    } catch {
        // Not remembered when storage is blocked; the chosen view still applies now.
    }
}

const CHIP: Record<StockState, string> = {
    oversold: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    short: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    out: "bg-[var(--background)] text-[var(--foreground-muted)]",
    low: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

interface StockTodayDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Stock today: per product, how many new and open-box units are free to sell
 * after confirmed orders, so the team does not sell more than the shelf holds.
 * Left = on hand − reserved; waiting (new / contacted) orders hold nothing yet
 * and only show as "if they confirm". Worst products come first.
 */
export function StockTodayDialog({ open, onOpenChange }: StockTodayDialogProps) {
    const { t } = useLanguage();
    const { data, isLoading, isError, refetch, dataUpdatedAt } = useStockTodayQuery(open);
    const [filter, setFilter] = useState<StockFilter>("all");
    const [lane, setLane] = useState<StockLaneFilter>("both");
    const [query, setQuery] = useState("");
    // The dialog only renders content once opened in the browser, so reading
    // storage up front cannot cause a hydration mismatch.
    const [view, setView] = useState<StockView>(readView);
    const page = view === "glance" ? GLANCE_PAGE : PAGE;
    const [shown, setShown] = useState(page);

    const items = useMemo(() => data ?? [], [data]);
    const summary = useMemo(() => stockTodaySummary(items), [items]);
    const list = useMemo(
        () => filterStockToday(items, filter, view === "glance" ? "both" : lane, query),
        [items, filter, lane, query, view]
    );
    const rest = list.length - shown;

    const pick = (f: StockFilter) => {
        setFilter(prev => (prev === f && f !== "all" ? "all" : f));
        setShown(page);
    };

    const switchView = (next: StockView) => {
        setView(next);
        saveView(next);
        setShown(next === "glance" ? GLANCE_PAGE : PAGE);
        if (next === "glance" && filter === "today") setFilter("all");
    };

    const views: { key: StockView; label: string }[] = [
        { key: "glance", label: t("orders.stockToday.view.glance", "Simple") },
        { key: "detailed", label: t("orders.stockToday.view.detailed", "Detailed") },
    ];

    const tiles: { key: StockFilter; label: string; value: number; dot: string }[] = [
        { key: "all", label: t("orders.stockToday.all", "All"), value: summary.all, dot: "bg-[var(--foreground-muted)]" },
        { key: "oversold", label: t("orders.stockToday.oversold", "Oversold"), value: summary.oversold, dot: "bg-red-500" },
        { key: "attention", label: t("orders.stockToday.attention", "Need attention"), value: summary.attention, dot: "bg-amber-500" },
        { key: "today", label: t("orders.stockToday.todayUnits", "Units ordered today"), value: summary.todayUnits, dot: "bg-blue-500" },
    ];

    const lanes: { key: StockLaneFilter; label: string }[] = [
        { key: "both", label: t("orders.stockToday.both", "Both") },
        { key: "new", label: t("orders.stockToday.new", "New") },
        { key: "openBox", label: t("orders.stockToday.openBox", "Open box") },
    ];

    const cols = lane === "both" ? "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-4xl" hideCloseButton>
                <div className="sticky -top-4 z-10 -mx-4 md:-mx-6 -mt-4 px-4 md:px-6 pt-4 pb-3 bg-[var(--card-bg)] border-b border-[var(--card-border)] space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <DialogTitle className="text-lg font-bold tracking-tight">{t("orders.stockToday.title", "Stock today")}</DialogTitle>
                        <DialogDescription className="text-xs text-[var(--foreground-muted)] flex items-center gap-1.5 mt-0.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/20" />
                            {dataUpdatedAt
                                ? t("orders.stockToday.updated", "Left = on hand minus confirmed. Updated {time}", {
                                    time: new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
                                })
                                : t("orders.stockToday.loading", "Loading stock…")}
                        </DialogDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                    <div role="group" aria-label={t("orders.stockToday.view.label", "View")} className="flex rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-0.5">
                        {views.map(v => (
                            <button
                                key={v.key}
                                type="button"
                                onClick={() => switchView(v.key)}
                                aria-pressed={view === v.key}
                                className={cn(
                                    "rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors",
                                    view === v.key ? "bg-[var(--card-bg)] text-foreground shadow-sm" : "text-[var(--foreground-muted)]"
                                )}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>
                    <DialogClose className="shrink-0 rounded-xl p-2 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background)] hover:text-foreground">
                        <X className="h-5 w-5" />
                        <span className="sr-only">{t("orders.stockToday.close", "Close")}</span>
                    </DialogClose>
                    </div>
                    </div>

                    {view === "glance" ? (
                        <div role="group" aria-label={t("orders.stockToday.show", "Show")} className="flex flex-wrap gap-1.5">
                            {tiles.filter(tile => tile.key !== "today").map(tile => (
                                <button
                                    key={tile.key}
                                    type="button"
                                    onClick={() => pick(tile.key)}
                                    aria-pressed={filter === tile.key}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                        filter === tile.key
                                            ? "border-foreground bg-foreground text-background"
                                            : "border-[var(--card-border)] hover:border-[var(--foreground-muted)]"
                                    )}
                                >
                                    <i className={cn("w-2 h-2 rounded-full", tile.dot)} />
                                    {tile.label}
                                    <b className="tabular-nums">{tile.value}</b>
                                </button>
                            ))}
                        </div>
                    ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {tiles.map(tile => (
                            <button
                                key={tile.key}
                                type="button"
                                onClick={() => pick(tile.key)}
                                aria-pressed={filter === tile.key}
                                className={cn(
                                    "text-left rounded-xl border px-3 py-2 transition-colors",
                                    filter === tile.key
                                        ? "border-foreground bg-[var(--background)]"
                                        : "border-[var(--card-border)] hover:border-[var(--foreground-muted)]"
                                )}
                            >
                                <span className="flex items-center gap-1.5 text-[11px] text-[var(--foreground-muted)]">
                                    <i className={cn("w-2 h-2 rounded-[3px]", tile.dot)} />
                                    {tile.label}
                                </span>
                                <span className="block text-xl font-semibold tabular-nums font-mono">{tile.value}</span>
                            </button>
                        ))}
                    </div>
                    )}

                    <div className="flex items-center gap-2">
                        <label className="flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3">
                            <Search className="w-4 h-4 text-[var(--foreground-muted)] shrink-0" />
                            <input
                                id="stock-today-search"
                                type="search"
                                value={query}
                                onChange={e => { setQuery(e.target.value); setShown(page); }}
                                placeholder={t("orders.stockToday.search", "Search product or SKU")}
                                aria-label={t("orders.stockToday.search", "Search product or SKU")}
                                className="flex-1 min-w-0 bg-transparent py-2 text-sm outline-none"
                            />
                        </label>
                        {view === "detailed" && (
                        <div role="group" aria-label={t("orders.stockToday.which", "Which stock")} className="flex shrink-0 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-0.5">
                            {lanes.map(l => (
                                <button
                                    key={l.key}
                                    type="button"
                                    onClick={() => { setLane(l.key); setShown(PAGE); }}
                                    aria-pressed={lane === l.key}
                                    className={cn(
                                        "rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors",
                                        lane === l.key ? "bg-[var(--card-bg)] text-foreground shadow-sm" : "text-[var(--foreground-muted)]"
                                    )}
                                >
                                    {l.label}
                                </button>
                            ))}
                        </div>
                        )}
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-[var(--foreground-muted)]">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : isError ? (
                    <div className="py-12 text-center text-sm">
                        <p>{t("orders.stockToday.error", "Stock could not be loaded.")}</p>
                        <button type="button" onClick={() => refetch()} className="mt-3 rounded-xl border border-[var(--card-border)] px-4 py-2 font-medium">
                            {t("orders.stockToday.retry", "Try again")}
                        </button>
                    </div>
                ) : (
                    <>
                        {view === "glance" ? (
                            list.length === 0
                                ? <p className="py-12 text-center text-sm text-[var(--foreground-muted)]">{t("orders.stockToday.empty", "No products match.")}</p>
                                : <StockTodayGlance items={list.slice(0, shown)} />
                        ) : (
                        <>
                        <div className={cn("hidden md:grid gap-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-[var(--foreground-muted)]", cols)}>
                            <span>{t("orders.stockToday.product", "Product")}</span>
                            {lane !== "openBox" && <span>{t("orders.stockToday.new", "New")}</span>}
                            {lane !== "new" && <span>{t("orders.stockToday.openBox", "Open box")}</span>}
                        </div>
                        {list.length === 0 ? (
                            <p className="py-12 text-center text-sm text-[var(--foreground-muted)]">{t("orders.stockToday.empty", "No products match.")}</p>
                        ) : (
                            <ul>
                                {list.slice(0, shown).map(item => (
                                    <StockRow key={item.key} item={item} lane={lane} cols={cols} />
                                ))}
                            </ul>
                        )}
                        </>
                        )}
                        {(rest > 0 || shown > page) && (
                            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[var(--card-border)] pt-4 mt-1">
                                {rest > 0 ? (
                                    <>
                                        <span className="text-xs text-[var(--foreground-muted)]">
                                            {t("orders.stockToday.showing", "Showing {shown} of {total}", { shown, total: list.length })}
                                        </span>
                                        <button type="button" onClick={() => setShown(s => s + page)} className="rounded-xl border border-[var(--card-border)] px-3.5 py-2 text-sm font-medium hover:bg-[var(--background)]">
                                            {t("orders.stockToday.more", "Show {count} more", { count: Math.min(page, rest) })}
                                        </button>
                                        <button type="button" onClick={() => setShown(list.length)} className="rounded-xl bg-foreground text-background px-3.5 py-2 text-sm font-medium">
                                            {t("orders.stockToday.showAll", "Show all {count}", { count: list.length })}
                                        </button>
                                    </>
                                ) : (
                                    <button type="button" onClick={() => setShown(page)} className="rounded-xl border border-[var(--card-border)] px-3.5 py-2 text-sm font-medium hover:bg-[var(--background)]">
                                        {t("orders.stockToday.fewer", "Show fewer")}
                                    </button>
                                )}
                            </div>
                        )}
                        {view === "detailed" && <Legend />}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function StockRow({ item, lane, cols }: { item: StockTodayItem; lane: StockLaneFilter; cols: string }) {
    const { t } = useLanguage();
    const [stateKey, stateFallback] = STOCK_STATE_LABEL[item.state];
    return (
        <li className={cn("grid grid-cols-2 gap-3 md:gap-4 border-t border-[var(--card-border)] py-3.5 items-stretch md:items-center", cols)}>
            <div className="col-span-2 md:col-span-1 flex items-center gap-3 min-w-0">
                <div className="relative w-10 h-10 shrink-0 overflow-hidden rounded-[10px] bg-[var(--background)] flex items-center justify-center">
                    {item.imageUrl
                        ? <ProductThumb src={item.imageUrl} alt="" sizes="40px" />
                        : <Package className="w-4 h-4 text-[var(--foreground-muted)]" />}
                </div>
                <div className="min-w-0">
                    <p className="truncate text-left text-sm font-semibold" dir="auto" title={item.name}>
                        {item.name}{item.variantName ? ` · ${item.variantName}` : ""}
                    </p>
                    {item.sku && <p className="truncate font-mono text-[11px] text-[var(--foreground-muted)]">{item.sku}</p>}
                    <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", CHIP[item.state])}>
                        {t(stateKey, stateFallback)}
                    </span>
                </div>
            </div>
            {lane !== "openBox" && (
                <LaneCell lane={item.fresh} label={t("orders.stockToday.new", "New")} />
            )}
            {lane !== "new" && (
                item.openBox
                    ? <LaneCell lane={item.openBox} label={t("orders.stockToday.openBox", "Open box")} />
                    : <div className="rounded-xl bg-[var(--background)] p-2.5 md:bg-transparent md:p-0 text-xs text-[var(--foreground-muted)]">
                        <span className="md:hidden block text-[11px] uppercase tracking-wider mb-1">{t("orders.stockToday.openBox", "Open box")}</span>
                        {t("orders.stockToday.noOpenBox", "No open-box stock")}
                    </div>
            )}
        </li>
    );
}

function LaneCell({ lane, label }: { lane: StockLane; label: string }) {
    const { t } = useLanguage();
    const over = lane.left < 0;
    const after = lane.left - lane.waiting;
    const total = Math.max(lane.onHand, 1);
    const pct = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;

    return (
        <div className="min-w-0 space-y-1.5 rounded-xl bg-[var(--background)] p-2.5 md:bg-transparent md:p-0">
            <span className="md:hidden block text-[11px] uppercase tracking-wider text-[var(--foreground-muted)]">{label}</span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className={cn(
                    "font-mono text-[22px] font-semibold leading-none tabular-nums",
                    over ? "text-red-600 dark:text-red-400" : lane.left === 0 ? "text-[var(--foreground-muted)]" : lane.left - lane.waiting < 0 ? "text-amber-600 dark:text-amber-400" : ""
                )}>
                    {Math.abs(lane.left)}
                    <small className="ml-1 font-sans text-[11px] font-medium text-[var(--foreground-muted)]">
                        {over ? t("orders.stockToday.over", "over") : t("orders.stockToday.left", "left")}
                    </small>
                </span>
                {lane.waiting > 0 && (
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        {after < 0
                            ? t("orders.stockToday.ifConfirmOver", "If {waiting} waiting confirm: {count} over", { waiting: lane.waiting, count: Math.abs(after) })
                            : t("orders.stockToday.ifConfirmLeft", "If {waiting} waiting confirm: {count} left", { waiting: lane.waiting, count: after })}
                    </span>
                )}
            </div>
            <div
                className="flex h-2 overflow-hidden rounded-full bg-[var(--card-border)]"
                role="img"
                aria-label={t("orders.stockToday.barLabel", "{onHand} on hand, {reserved} reserved, {waiting} waiting", { onHand: lane.onHand, reserved: lane.reserved, waiting: lane.waiting })}
            >
                {over ? (
                    <span className="w-full bg-[repeating-linear-gradient(135deg,#f87171_0_4px,#fee2e2_4px_7px)] dark:bg-[repeating-linear-gradient(135deg,#b91c1c_0_4px,#450a0a_4px_7px)]" />
                ) : (
                    <>
                        <span className="bg-slate-700 dark:bg-slate-300" style={{ width: pct(lane.reserved) }} />
                        <span className="bg-[repeating-linear-gradient(135deg,#f6c27a_0_4px,transparent_4px_7px)] dark:bg-[repeating-linear-gradient(135deg,#a16207_0_4px,transparent_4px_7px)]" style={{ width: pct(Math.min(lane.waiting, lane.left)) }} />
                        <span className="bg-emerald-300 dark:bg-emerald-700" style={{ width: pct(Math.max(after, 0)) }} />
                    </>
                )}
            </div>
            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-[var(--foreground-muted)]">
                <span>{t("orders.stockToday.onHand", "On hand")} <b className="font-mono font-semibold text-foreground/80">{lane.onHand}</b></span>
                <span>{t("orders.stockToday.reserved", "Reserved")} <b className="font-mono font-semibold text-foreground/80">{lane.reserved}</b></span>
                <span>{t("orders.stockToday.today", "Today")} <b className="font-mono font-semibold text-foreground/80">{lane.today}</b></span>
                {lane.waiting > 0 && <span>{t("orders.stockToday.waiting", "Waiting")} <b className="font-mono font-semibold text-foreground/80">{lane.waiting}</b></span>}
            </div>
            {lane.onHand < 0 && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                    {t("orders.stockToday.recount", "Shelf count is below zero. Count it and fix the stock.")}
                </p>
            )}
        </div>
    );
}

function Legend() {
    const { t } = useLanguage();
    const items: [string, string, string][] = [
        ["bg-slate-700 dark:bg-slate-300", "orders.stockToday.legend.reserved", "Reserved (confirmed, not shipped)"],
        ["bg-[repeating-linear-gradient(135deg,#f6c27a_0_4px,transparent_4px_7px)]", "orders.stockToday.legend.waiting", "Waiting to confirm"],
        ["bg-emerald-300 dark:bg-emerald-700", "orders.stockToday.legend.free", "Free to sell"],
        ["bg-[repeating-linear-gradient(135deg,#f87171_0_4px,#fee2e2_4px_7px)]", "orders.stockToday.legend.over", "Oversold"],
    ];
    return (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--card-border)] pt-3 text-[11px] text-[var(--foreground-muted)]">
            {items.map(([sw, key, fallback]) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                    <i className={cn("h-2 w-3.5 rounded-[3px]", sw)} />
                    {t(key, fallback)}
                </span>
            ))}
        </div>
    );
}
