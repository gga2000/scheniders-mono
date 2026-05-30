"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, ShieldAlert } from "lucide-react";
import { useInventoryQC } from "@/hooks/use-inventory-qc";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";
import { formatIQD } from "@/lib/utils";
import type { QCItem, QCResolution, QCStatus } from "@/types/product";

import { QCKpiHeader } from "./qc/qc-kpi-header";
import { QCInsightsBanner } from "./qc/qc-insights-banner";
import { QCSubTabs, type QCTab } from "./qc/qc-sub-tabs";
import { QCFilterBar, DEFAULT_QC_FILTERS, type QCFilters, type QCViewMode } from "./qc/qc-filter-bar";
import { QCTableView } from "./qc/qc-table-view";
import { QCCardGrid } from "./qc/qc-card-grid";
import { QCKanbanView } from "./qc/qc-kanban-view";
import { QCAnalyticsTab } from "./qc/qc-analytics-tab";
import { QCBulkBar, type QCBulkUndoSnapshot } from "./qc/qc-bulk-bar";
import { QCDetailDrawer } from "./qc/qc-detail-drawer";
import { QCEmptyState } from "./qc/qc-empty-state";
import { QCErrorState } from "./qc/qc-error-state";
import { QCKeyboardShortcuts } from "./qc/qc-keyboard-shortcuts";
import { QCShortcutsHelp } from "./qc/qc-shortcuts-help";
import {
    QCKpiSkeleton,
    QCTableSkeleton,
    QCCardGridSkeleton,
    QCKanbanSkeleton,
} from "./qc/qc-skeletons";
import { getAgingBucket, autoTagReason } from "./qc/qc-constants";

const RESOLVED_STATUSES: QCStatus[] = ["restocked", "written_off", "returned_to_supplier"];

// IQD threshold for the write-off guardrail. Items at or above this value
// require a photo or inspection note before a quick-action write-off — the
// drawer is opened so the inspector can attach evidence before confirming.
const HIGH_VALUE_WRITEOFF_THRESHOLD = 25000;

export function QCQuarantineTab() {
    const { t } = useLanguage();
    const { qcItems, isLoading, error, refetch, resolveItem, updateStatus, bulkResolve, bulkRevert } = useInventoryQC();

    const [activeTab, setActiveTab] = useState<QCTab>("pending");
    const [viewMode, setViewMode] = useState<QCViewMode>("table");
    const [filters, setFilters] = useState<QCFilters>(DEFAULT_QC_FILTERS);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [detailItem, setDetailItem] = useState<QCItem | null>(null);
    // Keyboard-driven focus cursor over the current filtered list. `null` = no
    // cursor yet; J/K on first press lands on index 0. Index, not id, so it
    // behaves naturally as the list filters change.
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    const counts = useMemo(() => {
        return {
            pending: qcItems.filter((i) => i.status === "pending_inspection").length,
            in_inspection: qcItems.filter((i) => i.status === "in_inspection").length,
            resolved: qcItems.filter((i) => RESOLVED_STATUSES.includes(i.status)).length,
        };
    }, [qcItems]);

    const tabScoped = useMemo(() => {
        if (activeTab === "pending") return qcItems.filter((i) => i.status === "pending_inspection");
        if (activeTab === "in_inspection") return qcItems.filter((i) => i.status === "in_inspection");
        if (activeTab === "resolved") return qcItems.filter((i) => RESOLVED_STATUSES.includes(i.status));
        return qcItems;
    }, [qcItems, activeTab]);

    const filteredItems = useMemo(() => {
        const q = filters.search.trim().toLowerCase();
        return tabScoped.filter((item) => {
            if (q) {
                const cat = item.reason_category || autoTagReason(item.reason);
                const hay = [
                    item.product?.name,
                    item.product?.sku,
                    item.reason,
                    item.order?.order_id,
                    item.rma_number,
                    cat,
                    t(`qc.reason.${cat}`),
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (filters.reasonCategories.length > 0) {
                const cat = item.reason_category || autoTagReason(item.reason);
                if (!filters.reasonCategories.includes(cat)) return false;
            }
            if (filters.ageBucket !== "all") {
                const bucket = getAgingBucket(item.created_at);
                const map = { fresh: "low", aging: "medium", stale: "high", critical: "critical" } as const;
                if (bucket.urgency !== map[filters.ageBucket]) return false;
            }
            if (filters.hasPhotos !== "all") {
                const has = (item.photos?.length || 0) > 0;
                if (filters.hasPhotos === "yes" && !has) return false;
                if (filters.hasPhotos === "no" && has) return false;
            }
            const value = (item.product?.cost || 0) * item.quantity;
            if (filters.valueMin != null && value < filters.valueMin) return false;
            if (filters.valueMax != null && value > filters.valueMax) return false;
            return true;
        });
    }, [tabScoped, filters]);

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelectedIds((prev) => {
            if (prev.size === filteredItems.length) return new Set();
            return new Set(filteredItems.map((i) => i.id));
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    // Keep focusedIndex in range as the filtered list shrinks/grows/swaps.
    useEffect(() => {
        if (focusedIndex === null) return;
        if (filteredItems.length === 0) {
            setFocusedIndex(null);
            return;
        }
        if (focusedIndex >= filteredItems.length) {
            setFocusedIndex(filteredItems.length - 1);
        }
    }, [filteredItems, focusedIndex]);

    // Reset focus when the user switches tab or view mode — a cursor from the
    // table view doesn't meaningfully survive into a kanban board.
    useEffect(() => {
        setFocusedIndex(null);
    }, [activeTab, viewMode]);

    const focusedId = useMemo(
        () =>
            focusedIndex !== null && focusedIndex >= 0 && focusedIndex < filteredItems.length
                ? filteredItems[focusedIndex].id
                : null,
        [focusedIndex, filteredItems]
    );

    // ---- Keyboard shortcut handlers ----

    const handleFocusSearch = useCallback(() => {
        const el = document.querySelector<HTMLInputElement>('[data-qc-search="true"]');
        if (el) {
            el.focus();
            el.select();
        }
    }, []);

    const handleMoveFocus = useCallback(
        (delta: 1 | -1) => {
            if (filteredItems.length === 0) return;
            setFocusedIndex((prev) => {
                if (prev === null) return delta > 0 ? 0 : filteredItems.length - 1;
                const next = prev + delta;
                if (next < 0) return 0;
                if (next >= filteredItems.length) return filteredItems.length - 1;
                return next;
            });
        },
        [filteredItems.length]
    );

    const handleToggleSelectFocused = useCallback(() => {
        if (focusedId) toggleSelect(focusedId);
    }, [focusedId]);

    // Bulk keyboard shortcuts resolve the selected items. For
    // `returned_to_supplier` we still need an RMA number, so we fall back to
    // opening the detail drawer on the first selected item instead of silently
    // resolving — same semantics as clicking the single-item return button.
    const bulkResolveSelectedForShortcut = useCallback(
        async (resolution: QCResolution) => {
            if (selectedIds.size === 0) return;
            const ids = Array.from(selectedIds);
            if (resolution === "returned_to_supplier") {
                const first = qcItems.find((i) => i.id === ids[0]);
                if (first) {
                    setDetailItem(first);
                    toast.warning(t("qc.toast.returnedRma"));
                }
                return;
            }
            try {
                await bulkResolve(ids, resolution);
                const key =
                    resolution === "restocked" ? "qc.bulk.toast.restocked" : "qc.bulk.toast.writtenOff";
                toast.success(t(key, { count: ids.length }));
                setSelectedIds(new Set());
            } catch {
                toast.error(t("qc.bulk.failed"));
            }
        },
        [selectedIds, qcItems, bulkResolve, t]
    );

    const handleBulkRestock = useCallback(
        () => bulkResolveSelectedForShortcut("restocked"),
        [bulkResolveSelectedForShortcut]
    );
    const handleBulkWriteOff = useCallback(
        () => bulkResolveSelectedForShortcut("written_off"),
        [bulkResolveSelectedForShortcut]
    );
    const handleBulkReturn = useCallback(
        () => bulkResolveSelectedForShortcut("returned_to_supplier"),
        [bulkResolveSelectedForShortcut]
    );

    const handleToggleHelp = useCallback(() => setShortcutsOpen((s) => !s), []);

    const handleQuickResolve = async (item: QCItem, resolution: QCResolution) => {
        if (resolution === "returned_to_supplier") {
            setDetailItem(item);
            toast.warning(t("qc.toast.returnedRma"));
            return;
        }
        if (resolution === "written_off") {
            const value = (item.product?.cost || 0) * item.quantity;
            const hasEvidence = (item.photos?.length || 0) > 0 || !!item.notes;
            if (value >= HIGH_VALUE_WRITEOFF_THRESHOLD && !hasEvidence) {
                setDetailItem(item);
                toast.warning(t("qc.toast.writeOffEvidenceRequired"));
                return;
            }
        }
        try {
            await resolveItem(item.id, resolution, item.product_id, item.quantity);
            toast.success(resolution === "restocked" ? t("qc.toast.restocked") : t("qc.toast.writtenOff"));
        } catch {
            toast.error(t("qc.toast.resolutionFailed"));
        }
    };

    const handleBulk = async (
        ids: string[],
        resolution: QCResolution
    ): Promise<QCBulkUndoSnapshot[]> => {
        const snapshots: QCBulkUndoSnapshot[] = qcItems
            .filter((i) => ids.includes(i.id))
            .map((i) => ({
                id: i.id,
                productId: i.product_id,
                quantity: i.quantity,
                previousStatus: i.status,
                appliedResolution: resolution,
            }));
        await bulkResolve(ids, resolution);
        return snapshots;
    };

    const handleBulkUndo = async (snapshots: QCBulkUndoSnapshot[]) => {
        await bulkRevert(snapshots);
    };

    const handleKanbanMove = async (item: QCItem, toStatus: QCStatus) => {
        try {
            if (toStatus === "restocked" || toStatus === "written_off" || toStatus === "returned_to_supplier") {
                if (toStatus === "returned_to_supplier") {
                    setDetailItem(item);
                    toast.warning(t("qc.toast.returnedRma"));
                    return;
                }
                await resolveItem(item.id, toStatus, item.product_id, item.quantity);
                toast.success(t("qc.toast.statusUpdated"));
            } else {
                await updateStatus(item.id, toStatus);
                toast.success(t("qc.toast.statusUpdated"));
            }
        } catch {
            toast.error(t("qc.detail.inspectionFailed"));
        }
    };

    const handleExport = () => {
        const rows = qcItems.filter((i) => selectedIds.has(i.id));
        const header = ["id", "product", "sku", "quantity", "cost", "value", "status", "reason", "reason_category", "created_at"].join(",");
        const body = rows
            .map((r) =>
                [
                    r.id,
                    JSON.stringify(r.product?.name || ""),
                    r.product?.sku || "",
                    r.quantity,
                    r.product?.cost || 0,
                    (r.product?.cost || 0) * r.quantity,
                    r.status,
                    JSON.stringify(r.reason),
                    r.reason_category || autoTagReason(r.reason),
                    r.created_at,
                ].join(",")
            )
            .join("\n");
        const csv = header + "\n" + body;
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `qc-export-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t("qc.toast.exportDownloaded"));
    };

    const handlePrintLabels = () => {
        const rows = qcItems.filter((i) => selectedIds.has(i.id));
        const w = window.open("", "_blank", "width=400,height=600");
        if (!w) {
            toast.error(t("qc.toast.popupBlocked"));
            return;
        }
        w.document.write(`
            <html>
                <head>
                    <title>QC Labels</title>
                    <style>
                        body { font-family: system-ui, sans-serif; padding: 0; margin: 0; }
                        .label { width: 58mm; min-height: 40mm; padding: 8px; border: 1px dashed #999; page-break-after: always; }
                        .sku { font-family: monospace; font-size: 11px; }
                        .name { font-weight: bold; font-size: 13px; margin: 4px 0; }
                        .reason { font-size: 11px; color: #b91c1c; }
                        .meta { font-size: 10px; color: #666; margin-top: 4px; }
                    </style>
                </head>
                <body>
                    ${rows
                        .map(
                            (r) => `
                        <div class="label">
                            <div class="sku">QC-${r.id.slice(0, 8).toUpperCase()}</div>
                            <div class="name">${(r.product?.name || "Unknown").replace(/</g, "&lt;")}</div>
                            <div class="sku">${r.product?.sku || ""}</div>
                            <div class="reason">⚠ ${r.reason.replace(/</g, "&lt;")}</div>
                            <div class="meta">Qty: ${r.quantity} • ${formatIQD((r.product?.cost || 0) * r.quantity)}</div>
                            <div class="meta">${new Date(r.created_at).toLocaleDateString()}</div>
                        </div>
                    `
                        )
                        .join("")}
                    <script>window.onload = () => window.print();</script>
                </body>
            </html>
        `);
        w.document.close();
    };

    const renderContent = () => {
        if (isLoading) {
            if (activeTab === "analytics") {
                return <QCCardGridSkeleton count={6} />;
            }
            if (viewMode === "kanban") return <QCKanbanSkeleton />;
            if (viewMode === "cards") return <QCCardGridSkeleton />;
            return <QCTableSkeleton />;
        }

        if (error) {
            return <QCErrorState error={error} onRetry={() => refetch()} />;
        }

        if (activeTab === "analytics") {
            return <QCAnalyticsTab items={qcItems} />;
        }

        if (tabScoped.length === 0) {
            return (
                <QCEmptyState
                    variant={activeTab === "resolved" ? "no-resolved" : "all-clear"}
                />
            );
        }

        if (filteredItems.length === 0) {
            return <QCEmptyState variant="no-matches" onClearFilters={() => setFilters(DEFAULT_QC_FILTERS)} />;
        }

        return (
            <AnimatePresence mode="wait">
                <motion.div
                    key={viewMode}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                >
                    {viewMode === "table" && (
                        <QCTableView
                            items={filteredItems}
                            selectedIds={selectedIds}
                            focusedId={focusedId}
                            onToggleSelect={toggleSelect}
                            onToggleAll={toggleAll}
                            onOpenDetail={setDetailItem}
                            onQuickResolve={handleQuickResolve}
                            showResolutionActions={activeTab !== "resolved"}
                        />
                    )}
                    {viewMode === "cards" && (
                        <QCCardGrid
                            items={filteredItems}
                            selectedIds={selectedIds}
                            focusedId={focusedId}
                            onToggleSelect={toggleSelect}
                            onOpenDetail={setDetailItem}
                            onQuickResolve={handleQuickResolve}
                            showResolutionActions={activeTab !== "resolved"}
                        />
                    )}
                    {viewMode === "kanban" && (
                        <QCKanbanView
                            items={filteredItems}
                            focusedId={focusedId}
                            onOpenDetail={setDetailItem}
                            onMoveStatus={handleKanbanMove}
                        />
                    )}
                </motion.div>
            </AnimatePresence>
        );
    };

    const showFilterBar = activeTab !== "analytics";
    const showBulkBar = activeTab !== "analytics" && activeTab !== "resolved";

    return (
        <div className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <ShieldAlert className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">{t("qc.title")}</h2>
                        <p className="text-sm text-muted">{t("qc.subtitle")}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShortcutsOpen(true)}
                        title={t("qc.shortcuts.button")}
                        aria-label={t("qc.shortcuts.button")}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-muted hover:text-foreground hover:border-amber-500/40 transition text-xs font-medium"
                    >
                        <Keyboard className="w-3.5 h-3.5" />
                        <kbd className="hidden sm:inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded border border-[var(--card-border)] bg-[var(--background)] text-[10px] font-semibold">
                            ?
                        </kbd>
                    </button>
                </div>
            </div>

            {isLoading ? <QCKpiSkeleton /> : <QCKpiHeader items={qcItems} />}

            {!isLoading && (
                <QCInsightsBanner
                    items={qcItems}
                    onInsightClick={({ productName }) => {
                        if (productName) setFilters({ ...DEFAULT_QC_FILTERS, search: productName });
                    }}
                />
            )}

            <QCSubTabs
                active={activeTab}
                onChange={(t) => {
                    setActiveTab(t);
                    setSelectedIds(new Set());
                }}
                counts={counts}
            />

            {showFilterBar && (
                <QCFilterBar
                    filters={filters}
                    onChange={setFilters}
                    view={viewMode}
                    onViewChange={setViewMode}
                    totalCount={tabScoped.length}
                    filteredCount={filteredItems.length}
                />
            )}

            {renderContent()}

            {showBulkBar && (
                <QCBulkBar
                    selectedIds={Array.from(selectedIds)}
                    onClearSelection={clearSelection}
                    onBulkResolve={handleBulk}
                    onBulkUndo={handleBulkUndo}
                    onExport={handleExport}
                    onPrintLabels={handlePrintLabels}
                />
            )}

            <QCDetailDrawer item={detailItem} allItems={qcItems} onClose={() => setDetailItem(null)} />

            {/* Headless keyboard-shortcut binder. Disabled while the analytics
                tab, detail drawer, or help overlay is active so we don't fight
                the focus trap / irrelevant context. */}
            <QCKeyboardShortcuts
                enabled={activeTab !== "analytics" && detailItem === null && !shortcutsOpen}
                itemCount={filteredItems.length}
                selectedCount={selectedIds.size}
                onFocusSearch={handleFocusSearch}
                onMoveFocus={handleMoveFocus}
                onToggleSelectFocused={handleToggleSelectFocused}
                onClearSelection={clearSelection}
                onBulkRestock={handleBulkRestock}
                onBulkWriteOff={handleBulkWriteOff}
                onBulkReturn={handleBulkReturn}
                onToggleHelp={handleToggleHelp}
            />

            <QCShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </div>
    );
}
