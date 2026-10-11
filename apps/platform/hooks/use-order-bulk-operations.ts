"use client";

import { useState, useEffect } from "react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { toast, dismissToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/supabase";
import { getStatusLabel } from "@/lib/utils";
import { reportOrderError } from "@/lib/order-telemetry";
import { restoreDeletedOrders } from "@/app/actions/deleted-orders";
import { canShipWithoutSelection, partitionByShipDay } from "@/lib/order-bulk-scope";
import { exportOrdersToPrimeCSV, exportOrdersToWaseetXLSX } from "@/lib/export-utils";

/**
 * Every bulk operation on the orders page, and the state its dialogs need.
 *
 * ARCH-1: this lived inline in `page.tsx` — ~340 lines of state, status
 * handlers, the courier export and the post-export "move to In Transit" prompt,
 * interleaved with rendering. Extracting the markup alone would have meant
 * threading eighteen props back into it; moving the state with the behaviour is
 * what makes the dialogs cheap to extract, and it is a real seam rather than a
 * cut: nothing here is about layout.
 *
 * Everything it needs comes from the shared context and the store, so the hook
 * takes no arguments and there is no wiring to get wrong at the call site.
 */
export function useOrderBulkOperations() {
    const {
        orders,
        filteredOrders,
        bulkUpdateStatus,
        bulkArchive,
        bulkUnarchive,
        bulkDelete,
        createBatch,
        ordersAreComplete,
        fetchOrders: refreshOrders,
    } = useOrdersContext();

    const selectedOrders = useOrderStore((s) => s.selectedOrders);
    const setSelectedOrders = useOrderStore((s) => s.setSelectedOrders);
    const { tenantId } = useAuth();
    const { t } = useLanguage();

    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    const withProcessing = async (
        action: () => Promise<{ success: boolean; error?: string } | undefined>,
        fallbackMsg: string,
        successMsg: string,
        onSuccess?: () => void
    ) => {
        if (isBulkProcessing) return;
        setIsBulkProcessing(true);
        const pt = t("orders.processing");
        const loadingMsg = (pt && pt !== "orders.processing") ? pt : fallbackMsg;
        const toastId = toast.loading(loadingMsg);
        try {
            const result = await action();
            dismissToast(toastId);
            if (result?.success || result === undefined) {
                toast.success(successMsg);
                if (onSuccess) onSuccess();
            } else {
                toast.error(t("toast.updateFailed"), result?.error || "Unknown error");
            }
        } catch (error) {
            dismissToast(toastId);
            toast.error(t("toast.updateFailed"), String(error));
        } finally {
            setIsBulkProcessing(false);
        }
    };

    // Handle bulk actions
    /**
     * ARCH-1: nine bulk handlers were byte-identical apart from the status, and
     * three of them shared one message — bulk "deliver" and bulk "reject" both
     * told the operator the orders had been *confirmed*. One factory removes the
     * duplication and makes the message follow the status it actually applied.
     */
    const makeBulkStatusHandler = (status: Order["status"]) => async () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, status),
            `Updating ${ids.length} orders...`,
            t("toast.statusUpdatedDescCount")
                .replace("{count}", String(ids.length))
                .replace("{status}", getStatusLabel(status)),
            () => setSelectedOrders(new Set())
        );
    };

    const handleBulkConfirm = makeBulkStatusHandler("confirmed");
    const handleBulkDeliver = makeBulkStatusHandler("delivered");
    const handleBulkReject = makeBulkStatusHandler("rejected");

    const handleBulkArchive = async () => {
        if (isBulkProcessing) return;
        const ids = Array.from(selectedOrders);
        setIsBulkProcessing(true);
        const pt = t("orders.processing");
        const loadingMsg = (pt && pt !== "orders.processing") ? pt : `Archiving ${ids.length} orders...`;
        const toastId = toast.loading(loadingMsg);
        try {
            const result = await bulkArchive(ids);
            dismissToast(toastId);
            if (result?.success || result === undefined) {
                setSelectedOrders(new Set());
                toast({
                    title: t("toast.ordersArchived"),
                    description: t("toast.ordersArchivedDesc").replace("{count}", String(ids.length)),
                    variant: "success",
                    action: {
                        label: t("toast.undo") || "Undo",
                        onClick: async () => {
                            const undoRes = await bulkUnarchive(ids);
                            if (undoRes.success) {
                                toast.success(t("toast.ordersRestored") || "Restored", t("toast.ordersRestoredDesc") || "Orders returned to the active list");
                            } else {
                                toast.error(t("toast.updateFailed"), undoRes.error);
                            }
                        }
                    }
                });
            }
            else if (result?.error) toast.error(t("toast.archiveFailed"), result.error);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    // Delete confirmation dialog state
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteCountdown, setDeleteCountdown] = useState(5);
    const [isDeleting, setIsDeleting] = useState(false);
    // Ship export confirmation dialog state
    const [shipConfirmOpen, setShipConfirmOpen] = useState(false);
    const [shipConfirmCompany, setShipConfirmCompany] = useState<'prime' | 'waseet'>('prime');
    const [shipConfirmKey, setShipConfirmKey] = useState(0);
    // Post-export: prompt to move newly-exported orders from Confirmed → In Transit
    const [moveTransitOpen, setMoveTransitOpen] = useState(false);
    const [pendingTransitIds, setPendingTransitIds] = useState<string[]>([]);
    const [pendingTransitPrevStatuses, setPendingTransitPrevStatuses] = useState<{ id: string; status: string }[]>([]);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (deleteConfirmOpen && deleteCountdown > 0) {
            timer = setTimeout(() => setDeleteCountdown(prev => prev - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [deleteConfirmOpen, deleteCountdown]);

    const handleBulkDelete = async () => {
        setDeleteCountdown(5);
        setDeleteConfirmOpen(true);
    };

    const executeDelete = async () => {
        setIsDeleting(true);
        const ids = Array.from(selectedOrders);
        const toastId = toast.loading(`Deleting ${ids.length} orders...`);
        const result = await bulkDelete(ids);
        dismissToast(toastId);
        setIsDeleting(false);
        setDeleteConfirmOpen(false);
        setDeleteCountdown(5);

        if (!result.success && (!result.count || result.count === 0)) {
            toast.error(t("toast.deleteFailed"), result.error || t("toast.deleteFailedDesc"));
            return;
        }

        const deletedCount = result.count || 0;
        if (deletedCount < ids.length) {
            const deletedIdSet = new Set(result.deletedIds || []);
            setSelectedOrders(new Set(ids.filter(id => !deletedIdSet.has(id))));

            toast.warning(
                `Partially deleted`,
                `${deletedCount} of ${ids.length} orders were deleted. Remaining orders stayed selected.`
            );
            return;
        }

        // WF-2: delete is a soft delete, so the rows are recoverable until the
        // 30-day purge. Offer that directly rather than making the operator find
        // the trash screen.
        const deletedIds = result.deletedIds ?? ids;
        toast({
            title: t("toast.ordersDeleted"),
            description: t("toast.ordersDeletedDesc").replace("{count}", String(deletedCount)),
            variant: "success",
            duration: 20000,
            action: {
                label: t("toast.undo") || "Undo",
                onClick: async () => {
                    const res = await restoreDeletedOrders(deletedIds);
                    if (!res.success) {
                        toast.error(t("toast.updateFailed"), res.error);
                        return;
                    }
                    await refreshOrders();
                    toast.success(
                        t("toast.ordersRestored") || "Restored",
                        `${res.restored} orders returned to the list`,
                    );
                },
            },
        });
        setSelectedOrders(new Set());
    };

    // Additional bulk status handlers
    const handleBulkNew = makeBulkStatusHandler("new");
    const handleBulkContacted = makeBulkStatusHandler("contacted");
    /**
     * Bulk "In Transit" hands orders to the courier, so it skips any order
     * scheduled for a later day — shipping it would silently undo the
     * postponement. The export flow asks; this quick action holds them back
     * and says so. Move one individually to send it early.
     */
    const handleBulkInTransit = async () => {
        const selected = orders.filter(o => selectedOrders.has(o.id));
        const { scheduledLater } = partitionByShipDay(selected);
        if (scheduledLater.length === 0) {
            return makeBulkStatusHandler("in_transit")();
        }

        const heldBack = new Set(scheduledLater.map(o => o.id));
        const ids = Array.from(selectedOrders).filter(id => !heldBack.has(id));
        toast.warning(
            `${scheduledLater.length} scheduled for a later day kept back`,
            "Orders postponed to a later day are not shipped in bulk. Open one to move it individually.",
        );
        if (ids.length === 0) return;
        withProcessing(
            () => bulkUpdateStatus(ids, "in_transit"),
            `Updating ${ids.length} orders...`,
            t("toast.statusUpdatedDescCount")
                .replace("{count}", String(ids.length))
                .replace("{status}", getStatusLabel("in_transit")),
            // Leave the held-back orders selected so the merchant sees which they were.
            () => setSelectedOrders(new Set(heldBack)),
        );
    };
    const handleBulkCompleted = makeBulkStatusHandler("completed");
    const handleBulkNoResponse = makeBulkStatusHandler("no_response");
    const handleBulkSuspend = makeBulkStatusHandler("suspended");

    // ARCH-1: passed to OrdersFilterBar as one object. Ten separate props
    // for ten handlers that differ only by status would have made the
    // extraction's interface larger than the markup it removed.
    const bulkActions = {
        confirm: handleBulkConfirm,
        contacted: handleBulkContacted,
        deliver: handleBulkDeliver,
        reject: handleBulkReject,
        completed: handleBulkCompleted,
        inTransit: handleBulkInTransit,
        noResponse: handleBulkNoResponse,
        setNew: handleBulkNew,
        suspend: handleBulkSuspend,
        archive: handleBulkArchive,
        remove: handleBulkDelete,
    };

    const handleShipExport = async (
        company: 'prime' | 'waseet',
        { includeScheduledLater = false }: { includeScheduledLater?: boolean } = {},
    ) => {
        // Shipping with nothing selected means "everything matching my filter".
        // That is only true while the cached list IS the complete filtered set;
        // against a windowed list it would hand the courier whichever orders
        // happened to be loaded. Refuse rather than dispatch the wrong set.
        if (!canShipWithoutSelection({ selectedCount: selectedOrders.size, ordersAreComplete })) {
            toast.warning(
                "Select the orders to ship",
                "Only part of this filter is loaded, so \"all visible\" would not be all of them.",
            );
            return;
        }

        const inScope: Order[] = selectedOrders.size > 0
            ? orders.filter(o => selectedOrders.has(o.id))
            : filteredOrders;

        // Orders postponed to a later day stay home unless the merchant ticked
        // "include" in the confirmation dialog: handing one to the courier
        // today would silently undo the postponement.
        const { shippable, scheduledLater } = partitionByShipDay(inScope);
        const ordersToExport = includeScheduledLater ? inScope : shippable;
        const ids = ordersToExport.map(o => o.id);

        if (ids.length === 0) {
            toast.warning(
                "No orders to export",
                scheduledLater.length > 0
                    ? "Every order here is scheduled for a later day."
                    : "Select orders before exporting",
            );
            return;
        }

        const companyLabel = company === 'prime' ? 'Prime' : 'Al-Waseet';

        // OBS-3: shipping-submission failure rate was unanswerable because only
        // successful exports left a trace — `print_batches` is written on
        // success, and a failure showed a toast and nothing else. Every attempt
        // is now recorded, including which half of it failed. The tenant is
        // validated inside the function, not taken on trust.
        const recordExportOutcome = async (
            succeeded: boolean,
            failureStage?: 'file' | 'batch_record',
            errorMessage?: string,
        ) => {
            const { error } = await supabase.rpc('log_shipping_export', {
                p_tenant_id: tenantId,
                p_company: company,
                p_order_count: ids.length,
                p_succeeded: succeeded,
                p_failure_stage: failureStage ?? null,
                p_error_message: errorMessage ?? null,
            });
            if (error) {
                // Never let the audit write change what the operator is told
                // about their export — report it and carry on.
                reportOrderError(error, {
                    operation: "orders-ship-export-outcome-record",
                    extra: { company, orderCount: ids.length, succeeded },
                });
            }
        };

        try {
            // Generate the file before recording the batch. The batch row used to
            // be inserted first, so an export that threw left a committed row
            // claiming a shipment that never left.
            if (company === 'prime') {
                await exportOrdersToPrimeCSV(ids, ordersToExport);
            } else {
                await exportOrdersToWaseetXLSX(ids, ordersToExport);
            }

            const batchName = `${companyLabel} Export ${new Date().toLocaleDateString('en-GB')}`;
            const { success: batchSuccess, error: batchError } = await createBatch(
                batchName,
                ids,
                company,
                "invoice"
            );

            // Capture previous statuses for undo capability
            const previousStatuses = ordersToExport.map(o => ({ id: o.id, status: o.status }));
            setSelectedOrders(new Set());

            if (batchSuccess) {
                await recordExportOutcome(true);
                toast.success(
                    "Export successful",
                    `${ids.length} orders exported via ${companyLabel}` +
                        (!includeScheduledLater && scheduledLater.length > 0
                            ? `. ${scheduledLater.length} scheduled for a later day were kept back.`
                            : ""),
                );
            } else {
                await recordExportOutcome(false, 'batch_record', batchError || undefined);
                // The file is already in the operator's hands, so this is not an
                // export failure — say exactly what did and did not happen.
                reportOrderError(new Error(batchError || "Failed to create export batch"), {
                    operation: "orders-ship-export-batch-record",
                    extra: { company, orderCount: ids.length },
                });
                toast.warning(
                    "Exported, but not recorded",
                    `${ids.length} orders were exported via ${companyLabel}. The batch record could not be saved.`,
                );
            }

            // Prompt to move the exported orders to In Transit
            setPendingTransitIds(ids);
            setPendingTransitPrevStatuses(previousStatuses);
            setMoveTransitOpen(true);
        } catch (err) {
            await recordExportOutcome(
                false,
                'file',
                err instanceof Error ? err.message : "Could not complete the export process",
            );
            toast.error(
                "Export failed",
                err instanceof Error ? err.message : "Could not complete the export process"
            );
        }
    };

    const handleConfirmMoveToTransit = async () => {
        const ids = pendingTransitIds;
        const previousStatuses = pendingTransitPrevStatuses;
        if (ids.length === 0) return;

        await bulkUpdateStatus(ids, "in_transit");
        toast({
            title: `${ids.length} orders moved to In Transit`,
            description: "Click undo to restore previous statuses",
            variant: "success",
            duration: 20000,
            action: {
                label: "Undo",
                onClick: async () => {
                    const byStatus = new Map<string, string[]>();
                    previousStatuses.forEach(({ id, status }) => {
                        const group = byStatus.get(status) || [];
                        group.push(id);
                        byStatus.set(status, group);
                    });
                    for (const [status, orderIds] of byStatus) {
                        await bulkUpdateStatus(orderIds, status as Order["status"]);
                    }
                    toast.success("Undone", `${ids.length} orders restored to their previous statuses`);
                }
            }
        });
        setPendingTransitIds([]);
        setPendingTransitPrevStatuses([]);
    };

    return {
        isBulkProcessing,
        bulkActions,
        // Delete confirmation
        deleteConfirmOpen,
        setDeleteConfirmOpen,
        deleteCountdown,
        setDeleteCountdown,
        isDeleting,
        executeDelete,
        // Courier export
        shipConfirmOpen,
        setShipConfirmOpen,
        shipConfirmCompany,
        setShipConfirmCompany,
        shipConfirmKey,
        setShipConfirmKey,
        handleShipExport,
        // Post-export prompt
        moveTransitOpen,
        setMoveTransitOpen,
        pendingTransitIds,
        handleConfirmMoveToTransit,
    };
}

export type OrderBulkOperations = ReturnType<typeof useOrderBulkOperations>;
