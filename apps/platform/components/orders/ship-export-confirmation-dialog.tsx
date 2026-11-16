"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@scheniders/ui/dialog";
import { Truck, AlertTriangle, Package, CalendarClock, Copy, History, MapPinOff, Plus, Save, Trash2, SlidersHorizontal } from "lucide-react";
import { cn, getBaseOrderId } from "@/lib/utils";
import { getStatusBadgeStyle, formatScheduledDate } from "@/lib/order-format-utils";
import type { Order } from "@/types/order";
import { canShipWithoutSelection, partitionByShipDay } from "@/lib/order-bulk-scope";
import { findDuplicateDispatchPairs } from "@/lib/duplicate-window";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import {
    GENERAL_LAYOUT,
    layoutNameTaken,
    layoutProblem,
    ordersWithoutGovernorate,
    type SavedLayout,
    type ShipExportTarget,
} from "@/lib/shipping/export-columns";
import { useDeleteLayout, useSaveLayout, useSavedLayouts, useSentBefore } from "@/hooks/use-shipping-export";
import { ShipExportLayoutEditor, phoneSample, type ShipExportDraft } from "./ship-export-layout-editor";

const SAFE_EXPORT_TABS = ["confirmed", "in_transit", "return_pending", "refund_delivered", "refund_failed"] as const;

/** Which courier the file is for: a built-in sheet, a saved layout, or a new one. */
type Choice = "prime" | "waseet" | "other" | `saved:${string}`;

const lastChoiceKey = (tenantId: string | null) => `fermi.shipExport.courier.${tenantId ?? "none"}`;

/** The courier picked last time in this store; Prime (the old one-button export) before that. */
function readLastChoice(tenantId: string | null): Choice {
    try {
        const v = localStorage.getItem(lastChoiceKey(tenantId));
        if (v === "prime" || v === "waseet" || v === "other" || v?.startsWith("saved:")) return v as Choice;
    } catch {
        // Storage blocked (private window): the window opens on Prime, as before B4.
    }
    return "prime";
}

function writeLastChoice(tenantId: string | null, choice: Choice) {
    try {
        localStorage.setItem(lastChoiceKey(tenantId), choice);
    } catch {
        // Storage blocked: next time opens on Prime; the export itself is unaffected.
    }
}

const sameLayout = (draft: ShipExportDraft, saved: SavedLayout) =>
    JSON.stringify([draft.courierName.trim(), draft.layout]) === JSON.stringify([saved.name.trim(), saved.layout]);

/** What the export hands back: the courier, and which orders to leave home. */
export type ShipExportConfirm = {
    target: ShipExportTarget;
    includeScheduledLater: boolean;
    /** Orders that already went to a courier, left out because the merchant did not tick "again". */
    skipIds: string[];
};

interface ShipExportConfirmationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orders: Order[];
    currentTab: string;
    hasSelection: boolean;
    /**
     * Whether `orders` is the complete set matching the merchant's filter. When
     * false, "all visible orders" is only the loaded window, so the no-selection
     * path must not claim to be shipping everything.
     */
    ordersAreComplete?: boolean;
    /**
     * Orders scheduled for a later day are left out unless the merchant ticks
     * "include" here; orders already sent to a courier are left out unless the
     * merchant ticks "again". Both choices, and the courier, are passed back.
     */
    onConfirmExport: (options: ShipExportConfirm) => void;
    /**
     * A committed twin inside 48h for an order (lib/duplicate-window). Orders
     * that have one are listed in a warning: exporting them dispatches a
     * second courier to the same customer.
     */
    getDispatchTwin?: (orderId: string) => Order | undefined;
}

/**
 * Fermi B4 "Export for shipping": pick the courier (Prime, Al-Waseet, one of
 * the store's saved couriers, or another with its own columns), see what goes
 * in the file and what is held back, then download it.
 */
export function ShipExportConfirmationDialog({
    open,
    onOpenChange,
    orders,
    currentTab,
    hasSelection,
    ordersAreComplete = true,
    onConfirmExport,
    getDispatchTwin,
}: ShipExportConfirmationDialogProps) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const statusLabel = useStatusLabel();
    const { tenantId } = useAuth();
    const isUnsafeTab = !(SAFE_EXPORT_TABS as readonly string[]).includes(currentTab);
    const isAllTab = currentTab === "all" || !currentTab;
    const countdownDuration = isUnsafeTab ? 8 : 5;

    const [countdown, setCountdown] = useState(countdownDuration);
    const [isExporting, setIsExporting] = useState(false);
    // Off by default: shipping a postponed order early has to be a decision.
    const [includeScheduledLater, setIncludeScheduledLater] = useState(false);
    // Off by default: a parcel handed over twice is two delivery fees.
    const [sendAgain, setSendAgain] = useState(false);

    // ── The courier ────────────────────────────────────────────────
    const layoutsQuery = useSavedLayouts(open);
    const savedLayouts = useMemo(() => layoutsQuery.data ?? [], [layoutsQuery.data]);
    const [choice, setChoice] = useState<Choice>(() => readLastChoice(tenantId));
    const [drafts, setDrafts] = useState<Partial<Record<Choice, ShipExportDraft>>>({});
    const [editorOpen, setEditorOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const saveLayout = useSaveLayout();
    const deleteLayout = useDeleteLayout();

    const savedId = choice.startsWith("saved:") ? choice.slice("saved:".length) : null;
    const savedLayout = savedId ? savedLayouts.find((l) => l.id === savedId) : undefined;
    // A remembered courier that was deleted since falls back to Prime.
    const effective: Choice = savedId && !layoutsQuery.isLoading && !savedLayout ? "prime" : choice;
    const isLayout = effective !== "prime" && effective !== "waseet";

    const baseDraft: ShipExportDraft | null = effective === "other"
        ? { courierName: "", layout: GENERAL_LAYOUT }
        : savedLayout && effective === choice
            ? { courierName: savedLayout.name, layout: savedLayout.layout }
            : null;
    const draft = drafts[effective] ?? baseDraft;
    const setDraft = (next: ShipExportDraft) => setDrafts((prev) => ({ ...prev, [effective]: next }));
    const dirty = !!draft && (effective === "other" || (!!savedLayout && !sameLayout(draft, savedLayout)));

    const layoutIssue = !isLayout || !draft
        ? null
        : draft.courierName.trim() === ""
            ? "needName"
            : layoutProblem(draft.layout) === "noColumns"
                ? "needColumns"
                : layoutProblem(draft.layout) === "emptyHeader"
                    ? "needHeaders"
                    : null;
    const saveBlocked = !!layoutIssue || (!!draft && layoutNameTaken(savedLayouts, draft.courierName, savedLayout?.id));

    const target: ShipExportTarget | null = effective === "prime"
        ? { kind: "prime" }
        : effective === "waseet"
            ? { kind: "waseet" }
            : draft && !layoutIssue
                ? { kind: "layout", courierName: draft.courierName.trim(), layout: draft.layout }
                : null;

    const pick = (next: Choice) => {
        setChoice(next);
        setEditorOpen(false);
        setConfirmDelete(false);
    };

    const handleSave = () => {
        if (!draft || saveBlocked) return;
        saveLayout.mutate(
            { id: savedLayout?.id, name: draft.courierName, layout: draft.layout },
            {
                onSuccess: (saved) => {
                    setDrafts((prev) => {
                        const next = { ...prev };
                        delete next[effective];
                        delete next[`saved:${saved.id}`];
                        return next;
                    });
                    pick(`saved:${saved.id}`);
                    toast.success(t("shipExport.layout.saved"), t("shipExport.layout.savedBody", { courier: saved.name }));
                },
                onError: (err) => toast.error(t("shipExport.layout.saveFailed"), err.message),
            },
        );
    };

    const handleDelete = () => {
        if (!savedLayout) return;
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        deleteLayout.mutate(savedLayout.id, {
            onSuccess: () => pick("prime"),
            onError: (err) => {
                setConfirmDelete(false);
                toast.error(t("shipExport.layout.deleteFailed"), err.message);
            },
        });
    };

    // ── The orders ─────────────────────────────────────────────────
    const handleOpenChange = useCallback((v: boolean) => {
        if (!isExporting) {
            onOpenChange(v);
            if (v) {
                setCountdown(countdownDuration);
                setIsExporting(false);
            }
        }
    }, [isExporting, onOpenChange, countdownDuration]);

    useEffect(() => {
        if (!open || countdown <= 0) return;
        const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [open, countdown]);

    const { scheduledLater } = useMemo(() => partitionByShipDay(orders), [orders]);
    const orderIds = useMemo(() => orders.map(o => o.id), [orders]);
    const sentQuery = useSentBefore(orderIds, open);

    // Postponed orders first, then the ones that already went out: what is
    // left is exactly what the file will hold.
    const shipping = useMemo(() => {
        const later = new Set(scheduledLater.map(o => o.id));
        return orders.filter(o => includeScheduledLater || !later.has(o.id));
    }, [orders, scheduledLater, includeScheduledLater]);
    const sentBefore = useMemo(
        () => shipping.filter(o => sentQuery.data?.has(o.id)),
        [shipping, sentQuery.data],
    );
    const skipIds = useMemo(() => (sendAgain ? [] : sentBefore.map(o => o.id)), [sendAgain, sentBefore]);
    const exported = useMemo(() => {
        const skip = new Set(skipIds);
        return shipping.filter(o => !skip.has(o.id));
    }, [shipping, skipIds]);
    const exportCount = exported.length;

    // Only the orders this export will actually hand over can double-dispatch.
    const duplicatePairs = useMemo(() => {
        if (!getDispatchTwin) return [];
        return findDuplicateDispatchPairs(
            exported.map(o => o.id),
            new Map(exported.map(o => [o.id, o])),
            getDispatchTwin,
        );
    }, [exported, getDispatchTwin]);

    // Exported all the same, with the governorate empty: the courier decides.
    const noGovernorate = useMemo(() => ordersWithoutGovernorate(exported), [exported]);

    const tabLabel = isAllTab
        ? t("orders.status.all")
        : currentTab === "refunds"
            ? t("orders.status.refunds")
            : statusLabel(currentTab);

    const statusBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        orders.forEach(o => {
            counts[o.status] = (counts[o.status] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [orders]);

    // "Ship everything visible" is only meaningful when everything IS visible.
    const cannotShipWholeFilter = !canShipWithoutSelection({
        selectedCount: hasSelection ? 1 : 0,
        ordersAreComplete,
    });

    const checkingSent = sentQuery.isLoading;
    const blocked = countdown > 0 || isExporting || cannotShipWholeFilter || exportCount === 0 || !target || checkingSent;

    const handleConfirm = () => {
        if (blocked || !target) return;
        setIsExporting(true);
        writeLastChoice(tenantId, effective);
        onConfirmExport({ target, includeScheduledLater, skipIds });
        setTimeout(() => onOpenChange(false), 300);
    };

    const courierLabel = (c: "prime" | "waseet") => t(`shipExport.courier.${c}`);
    const listSeparator = language === "ar" ? "، " : ", ";

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="md:max-w-xl" aria-describedby="ship-export-desc">
                <DialogHeader>
                    <DialogTitle className={cn(
                        "flex items-center justify-end gap-2",
                        isUnsafeTab ? "text-amber-700" : "text-slate-800"
                    )}>
                        {t("shipExport.title")}
                        <div className={cn(
                            "p-2 rounded-xl",
                            isUnsafeTab ? "bg-amber-100" : "bg-slate-100"
                        )}>
                            <Truck className="h-5 w-5" />
                        </div>
                    </DialogTitle>
                    <DialogDescription id="ship-export-desc" dir={dir} className="text-right">
                        {t("shipExport.description")}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    {/* The courier */}
                    <div dir={dir} className="space-y-3 rounded-xl border border-[var(--card-border)] p-4" data-testid="ship-export-courier">
                        <div className="space-y-1.5">
                            <span className="block text-xs font-semibold text-muted">{t("shipExport.courier")}</span>
                            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("shipExport.courier")}>
                                <CourierChip selected={effective === "prime"} onClick={() => pick("prime")}>
                                    {courierLabel("prime")}
                                </CourierChip>
                                <CourierChip selected={effective === "waseet"} onClick={() => pick("waseet")}>
                                    {courierLabel("waseet")}
                                </CourierChip>
                                {savedLayouts.map((l) => (
                                    <CourierChip key={l.id} selected={effective === `saved:${l.id}`} onClick={() => pick(`saved:${l.id}`)}>
                                        {l.name}
                                    </CourierChip>
                                ))}
                                <CourierChip selected={effective === "other"} onClick={() => pick("other")}>
                                    <Plus className="h-3.5 w-3.5" />
                                    {t("shipExport.courier.other")}
                                </CourierChip>
                            </div>
                            {layoutsQuery.isLoading && savedId && (
                                <p className="text-[11px] text-muted">{t("shipExport.courier.loading")}</p>
                            )}
                        </div>

                        {!isLayout && (
                            <p className="text-xs text-muted">
                                {t("shipExport.courier.builtIn", { courier: courierLabel(effective === "waseet" ? "waseet" : "prime") })}
                            </p>
                        )}

                        {isLayout && draft && (
                            <>
                                {effective !== "other" && !editorOpen ? (
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs text-muted">
                                            {t("shipExport.layout.summary", {
                                                count: draft.layout.columns.length,
                                                phone: phoneSample(draft.layout.phoneFormat),
                                                file: t(`shipExport.file.${draft.layout.fileFormat}`),
                                            })}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setEditorOpen(true)}
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--background)]"
                                        >
                                            <SlidersHorizontal className="h-3.5 w-3.5" />
                                            {t("shipExport.layout.edit")}
                                        </button>
                                    </div>
                                ) : (
                                    <ShipExportLayoutEditor draft={draft} onChange={setDraft} />
                                )}

                                {layoutIssue && (
                                    <p className="text-xs font-medium text-rose-700" data-testid="ship-export-layout-issue">
                                        {t(`shipExport.layout.${layoutIssue}`)}
                                    </p>
                                )}
                                {!layoutIssue && dirty && layoutNameTaken(savedLayouts, draft.courierName, savedLayout?.id) && (
                                    <p className="text-xs font-medium text-amber-700">{t("shipExport.layout.nameTaken")}</p>
                                )}
                                {!layoutIssue && dirty && effective !== "other" && (
                                    <p className="text-[11px] text-muted">{t("shipExport.layout.unsaved")}</p>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                    {dirty && (
                                        <button
                                            type="button"
                                            onClick={handleSave}
                                            disabled={saveBlocked || saveLayout.isPending}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-white dark:text-slate-900"
                                        >
                                            <Save className="h-3.5 w-3.5" />
                                            {effective === "other" ? t("shipExport.layout.save") : t("shipExport.layout.saveChanges")}
                                        </button>
                                    )}
                                    {editorOpen && effective !== "other" && (
                                        <button
                                            type="button"
                                            onClick={() => setEditorOpen(false)}
                                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:bg-[var(--background)]"
                                        >
                                            {t("shipExport.layout.hide")}
                                        </button>
                                    )}
                                    {savedLayout && editorOpen && (
                                        <button
                                            type="button"
                                            onClick={handleDelete}
                                            disabled={deleteLayout.isPending}
                                            className={cn(
                                                "ms-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                                                confirmDelete ? "bg-rose-600 text-white hover:bg-rose-700" : "text-rose-700 hover:bg-rose-50",
                                            )}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            {confirmDelete ? t("shipExport.layout.deleteConfirm") : t("shipExport.layout.delete")}
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Summary Panel */}
                    <div className={cn(
                        "p-4 rounded-xl border space-y-3",
                        isUnsafeTab
                            ? "bg-amber-50/80 border-amber-200"
                            : "bg-slate-50 border-slate-200"
                    )}>
                        <div className="flex flex-row-reverse justify-between items-center">
                            <span className="text-sm text-gray-600">{t("shipExport.from")}</span>
                            <span className={cn(
                                "text-sm font-semibold px-2.5 py-1 rounded-lg",
                                isUnsafeTab
                                    ? "bg-amber-200/80 text-amber-800"
                                    : "bg-slate-200 text-slate-700"
                            )}>
                                {tabLabel}
                            </span>
                        </div>
                        <div className="flex flex-row-reverse justify-between items-center">
                            <span className="text-sm text-gray-600">{t("shipExport.count")}</span>
                            <span
                                data-testid="ship-export-count"
                                className={cn(
                                    "text-lg font-bold tabular-nums",
                                    exportCount > 30 ? "text-amber-700" : "text-slate-800"
                                )}
                            >
                                {exportCount}
                            </span>
                        </div>
                        {!hasSelection && (
                            ordersAreComplete ? (
                                <div dir={dir} className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-100/80 px-2.5 py-1.5 rounded-lg">
                                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                    {t("shipExport.allInFilter", { count: orders.length })}
                                </div>
                            ) : (
                                <div dir={dir} className="flex items-center gap-1.5 text-xs text-rose-700 bg-rose-100/80 px-2.5 py-1.5 rounded-lg">
                                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                    {t("shipExport.partFilter", { count: orders.length })}
                                </div>
                            )
                        )}
                        {/* Status breakdown for mixed statuses */}
                        {statusBreakdown.length > 1 && (
                            <div className="pt-2 border-t border-gray-200/60">
                                <p className="text-xs text-gray-500 mb-1.5 text-right">{t("shipExport.statusBreakdown")}</p>
                                <div className="flex flex-wrap justify-end gap-1.5">
                                    {statusBreakdown.map(([status, count]) => (
                                        <span
                                            key={status}
                                            className={cn(
                                                "text-xs px-2 py-0.5 rounded-md",
                                                getStatusBadgeStyle(status as Order["status"]),
                                            )}
                                        >
                                            {statusLabel(status)}{" "}
                                            <span className="font-semibold">{count}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Already sent to a courier: left out unless sent again on purpose */}
                    {sentBefore.length > 0 && (
                        <div
                            dir={dir}
                            data-testid="ship-export-sent-before"
                            className="p-4 rounded-xl border bg-violet-50 border-violet-200 flex gap-3 dark:bg-violet-400/10 dark:border-violet-400/30"
                        >
                            <History className="h-5 w-5 flex-shrink-0 mt-0.5 text-violet-600" />
                            <div className="space-y-2 min-w-0">
                                <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
                                    {t("shipExport.sent.title", { count: sentBefore.length })}
                                </p>
                                <p className="text-xs text-violet-800 dark:text-violet-200">
                                    {sendAgain ? t("shipExport.sent.included") : t("shipExport.sent.leftOut")}
                                </p>
                                <ul className="space-y-0.5 text-xs text-violet-800 dark:text-violet-200">
                                    {sentBefore.slice(0, 5).map((o) => {
                                        const sent = sentQuery.data?.get(o.id);
                                        return (
                                            <li key={o.id}>
                                                {t("shipExport.sent.row", {
                                                    order: getBaseOrderId(o.order_id),
                                                    courier: sent?.courier || t("shipExport.sent.unknownCourier"),
                                                    date: sent?.sentAt ? formatScheduledDate(sent.sentAt, language) : "",
                                                })}
                                            </li>
                                        );
                                    })}
                                    {sentBefore.length > 5 && <li>…</li>}
                                </ul>
                                <label className="flex items-center gap-2 text-xs font-medium text-violet-900 cursor-pointer dark:text-violet-100">
                                    <input
                                        type="checkbox"
                                        checked={sendAgain}
                                        onChange={(e) => setSendAgain(e.target.checked)}
                                        className="h-4 w-4 rounded border-violet-300"
                                    />
                                    {t("shipExport.sent.again")}
                                </label>
                            </div>
                        </div>
                    )}
                    {sentQuery.isError && (
                        <p dir={dir} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                            {t("shipExport.sent.checkFailed")}
                        </p>
                    )}

                    {/* No governorate: still exported, flagged so the merchant can fix it first */}
                    {noGovernorate.length > 0 && (
                        <div
                            dir={dir}
                            data-testid="ship-export-no-governorate"
                            className="p-4 rounded-xl border bg-amber-50 border-amber-200 flex gap-3"
                        >
                            <MapPinOff className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-600" />
                            <div className="space-y-1.5 min-w-0">
                                <p className="text-sm font-semibold text-amber-900">
                                    {t("shipExport.noGov.title", { count: noGovernorate.length })}
                                </p>
                                <p className="text-xs text-amber-800">{t("shipExport.noGov.body")}</p>
                                <p className="text-xs text-amber-800 font-mono">
                                    {noGovernorate.slice(0, 8).map(o => `#${getBaseOrderId(o.order_id)}`).join("  ")}
                                    {noGovernorate.length > 8 ? "  …" : ""}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Postponed orders — held back unless explicitly included */}
                    {scheduledLater.length > 0 && (
                        <div dir={dir} className="p-4 rounded-xl border bg-blue-50 border-blue-200 flex gap-3">
                            <CalendarClock className="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-600" />
                            <div className="space-y-2 min-w-0">
                                <p className="text-sm font-semibold text-blue-900">
                                    {t("shipExport.later.title", { count: scheduledLater.length })}
                                </p>
                                <p className="text-xs text-blue-800">
                                    {includeScheduledLater ? t("shipExport.later.include") : t("shipExport.later.exclude")}
                                    {" "}
                                    <span className="text-blue-700/80">
                                        ({scheduledLater.slice(0, 5).map(o => `#${getBaseOrderId(o.order_id)} → ${formatScheduledDate(o.scheduled_date, language)}`).join(listSeparator)}
                                        {scheduledLater.length > 5 ? `${listSeparator}…` : ""})
                                    </span>
                                </p>
                                <label className="flex items-center gap-2 text-xs font-medium text-blue-900 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={includeScheduledLater}
                                        onChange={(e) => setIncludeScheduledLater(e.target.checked)}
                                        className="h-4 w-4 rounded border-blue-300"
                                    />
                                    {t("shipExport.later.anyway")}
                                </label>
                            </div>
                        </div>
                    )}

                    {/* 48h duplicates — a second courier to the same customer */}
                    {duplicatePairs.length > 0 && (
                        <div
                            data-testid="ship-export-duplicate-warning"
                            className="p-4 rounded-xl border bg-rose-50 border-rose-300 flex gap-3"
                        >
                            <Copy className="h-5 w-5 flex-shrink-0 mt-0.5 text-rose-600" />
                            <div className="space-y-1.5 min-w-0">
                                <p className="text-sm font-semibold text-rose-900">
                                    {t("orders.duplicate.exportWarningTitle",
                                        "{count} of these orders already have a committed twin",
                                        { count: duplicatePairs.length })}
                                </p>
                                <p className="text-xs text-rose-800">
                                    {t("orders.duplicate.exportWarningBody",
                                        "Same customer within 48 hours — shipping both means two delivery fees. Cancel or merge the duplicate first, or deselect it.")}
                                </p>
                                <ul className="space-y-0.5 text-xs text-rose-800">
                                    {duplicatePairs.slice(0, 5).map(({ order, twin }) => (
                                        <li key={order.id} className="font-mono" dir="ltr">
                                            #{getBaseOrderId(order.order_id)} ↔ #{getBaseOrderId(twin.order_id)}
                                            {" · "}{statusLabel(twin.status)}
                                        </li>
                                    ))}
                                    {duplicatePairs.length > 5 && <li>…</li>}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Unsafe tab warning */}
                    {isUnsafeTab && (
                        <div dir={dir} className={cn(
                            "p-4 rounded-xl border flex gap-3",
                            isAllTab
                                ? "bg-red-50 border-red-200"
                                : "bg-amber-50 border-amber-200"
                        )}>
                            <AlertTriangle className={cn(
                                "h-5 w-5 flex-shrink-0 mt-0.5",
                                isAllTab ? "text-red-500" : "text-amber-500"
                            )} />
                            <div className="space-y-1">
                                <p className={cn(
                                    "text-sm font-semibold",
                                    isAllTab ? "text-red-800" : "text-amber-800"
                                )}>
                                    {isAllTab ? t("shipExport.unsafe.allTitle") : t("shipExport.unsafe.tabTitle", { tab: tabLabel })}
                                </p>
                                <p className={cn(
                                    "text-xs",
                                    isAllTab ? "text-red-700" : "text-amber-700"
                                )}>
                                    {isAllTab ? t("shipExport.unsafe.allBody") : t("shipExport.unsafe.tabBody")}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Large count warning */}
                    {orders.length > 30 && !isUnsafeTab && (
                        <div dir={dir} className="p-3 rounded-xl border bg-amber-50/60 border-amber-200 flex items-center gap-2">
                            <Package className="h-4 w-4 text-amber-600 flex-shrink-0" />
                            <p className="text-xs text-amber-700">
                                {t("shipExport.large", { count: orders.length })}
                            </p>
                        </div>
                    )}

                    {/* Order preview list */}
                    <div className="max-h-40 overflow-y-auto p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <ul className="space-y-1.5">
                            {orders.slice(0, 50).map(order => (
                                <li
                                    key={order.id}
                                    className="text-sm text-gray-700 flex flex-row-reverse justify-between items-center bg-white/70 px-2.5 py-1.5 rounded-lg border border-gray-100/50"
                                >
                                    <span className="font-medium truncate max-w-[200px]">{order.customer_name}</span>
                                    <div className="flex flex-row-reverse items-center gap-2">
                                        <span className={cn(
                                            "text-[11px] px-1.5 py-0.5 rounded",
                                            getStatusBadgeStyle(order.status),
                                        )}>
                                            {statusLabel(order.status)}
                                        </span>
                                        <span className="text-gray-500 font-mono text-xs font-bold px-1.5 py-0.5 bg-gray-100 rounded-md">
                                            #{getBaseOrderId(order.order_id)}
                                        </span>
                                    </div>
                                </li>
                            ))}
                            {orders.length > 50 && (
                                <li className="text-xs text-gray-400 text-center py-1">
                                    {t("shipExport.more", { count: orders.length - 50 })}
                                </li>
                            )}
                        </ul>
                    </div>
                </div>

                <DialogFooter>
                    <button
                        onClick={() => onOpenChange(false)}
                        disabled={isExporting}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                    >
                        {t("shipExport.cancel")}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={blocked}
                        className={cn(
                            "px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 min-w-[180px]",
                            blocked
                                ? isUnsafeTab
                                    ? "bg-red-200 text-red-400 cursor-not-allowed"
                                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                : isUnsafeTab
                                    ? "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20"
                                    : "bg-slate-800 text-white hover:bg-slate-700 shadow-lg shadow-slate-900/20"
                        )}
                    >
                        <Truck className="h-4 w-4" />
                        {cannotShipWholeFilter
                            ? t("shipExport.selectFirst")
                            : countdown > 0
                                ? t("shipExport.wait", { n: countdown })
                                : isExporting
                                    ? t("shipExport.exporting")
                                    : t("shipExport.confirm", { count: exportCount })
                        }
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CourierChip({
    selected,
    onClick,
    children,
}: {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onClick}
            className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                selected
                    ? "border-slate-800 bg-slate-800 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : "border-[var(--card-border)] hover:bg-[var(--background)]",
            )}
        >
            {children}
        </button>
    );
}
