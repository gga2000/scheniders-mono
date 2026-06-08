 
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { Order } from "@/lib/supabase";
import { exportOrdersToPrimeCSV } from "@/lib/export-utils";

interface UseOrderBulkActionsProps {
    selectedOrders: Set<string>;
    setSelectedOrders: (orders: Set<string>) => void;
    filteredOrders: Order[];
    orders: Order[];
    t: (key: string) => string;
    bulkUpdateStatus: (ids: string[], status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    bulkArchive: (ids: string[]) => Promise<{ success: boolean; error?: string }>;
    bulkUnarchive: (ids: string[]) => Promise<{ success: boolean; error?: string }>;
    bulkDelete: (ids: string[]) => Promise<{ success: boolean; count?: number; deletedIds?: string[]; error?: string }>;
    createBatch: (name: string, orderIds: string[], platform: string, type: string) => Promise<{ success: boolean; error?: string }>;
    exportOrders: (ids: string[], format?: "csv" | "xlsx") => { success: boolean; count: number; };
}

export const useOrderBulkActions = ({
    selectedOrders,
    setSelectedOrders,
    filteredOrders,
    orders,
    t,
    bulkUpdateStatus,
    bulkArchive,
    bulkUnarchive,
    bulkDelete,
    createBatch,
    exportOrders
}: UseOrderBulkActionsProps) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const withProcessing = async (
        action: () => Promise<{ success: boolean; error?: string } | undefined>,
        loadingMsg: string,
        successMsg: string,
        onSuccess?: () => void
    ) => {
        if (isProcessing) return;
        setIsProcessing(true);
        const toastId = toast.loading(loadingMsg);
        try {
            const result = await action();
            toast.dismiss(toastId);
            if (result?.success || result === undefined) {
                toast.success(successMsg);
                if (onSuccess) onSuccess();
            } else {
                toast.error(t("toast.updateFailed"), result.error);
            }
        } catch (error) {
            toast.dismiss(toastId);
            toast.error(t("toast.updateFailed"), String(error));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBulkConfirm = () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, "confirmed"),
            `Updating ${ids.length} orders...`,
            t("toast.ordersConfirmedDesc").replace("{count}", String(ids.length)),
            () => setSelectedOrders(new Set())
        );
    };

    const handleBulkDeliver = () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, "delivered"),
            `Updating ${ids.length} orders...`,
            t("toast.ordersConfirmedDesc").replace("{count}", String(ids.length)),
            () => setSelectedOrders(new Set())
        );
    };

    const handleBulkReject = () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, "rejected"),
            `Updating ${ids.length} orders...`,
            t("toast.ordersConfirmedDesc").replace("{count}", String(ids.length)),
            () => setSelectedOrders(new Set())
        );
    };

    const handleBulkArchive = async () => {
        if (isProcessing) return;
        const ids = Array.from(selectedOrders);
        setIsProcessing(true);
        const toastId = toast.loading(`Archiving ${ids.length} orders...`);
        try {
            const result = await bulkArchive(ids);
            toast.dismiss(toastId);
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
            setIsProcessing(false);
        }
    };

    const handleBulkDelete = async () => {
        if (isProcessing) return;
        if (!confirm(`Are you sure you want to delete ${selectedOrders.size} orders? This action cannot be undone.`)) {
            return;
        }
        const ids = Array.from(selectedOrders);
        setIsProcessing(true);
        const toastId = toast.loading(`Deleting ${ids.length} orders...`);
        try {
            const result = await bulkDelete(ids);
            toast.dismiss(toastId);

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

            toast.success(t("toast.ordersDeleted"), t("toast.ordersDeletedDesc").replace("{count}", String(deletedCount)));
            setSelectedOrders(new Set());
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBulkNew = () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, "new"),
            `Updating ${ids.length} orders...`,
            t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "New"),
            () => setSelectedOrders(new Set())
        );
    };

    const handleBulkContacted = () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, "contacted"),
            `Updating ${ids.length} orders...`,
            t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "Contacted"),
            () => setSelectedOrders(new Set())
        );
    };

    const handleBulkInTransit = () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, "in_transit"),
            `Updating ${ids.length} orders...`,
            t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "In Transit"),
            () => setSelectedOrders(new Set())
        );
    };

    const handleBulkCompleted = () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, "completed"),
            `Updating ${ids.length} orders...`,
            t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "Completed"),
            () => setSelectedOrders(new Set())
        );
    };

    const handleBulkNoResponse = () => {
        const ids = Array.from(selectedOrders);
        withProcessing(
            () => bulkUpdateStatus(ids, "no_response"),
            `Updating ${ids.length} orders...`,
            t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "No Response"),
            () => setSelectedOrders(new Set())
        );
    };

    const handleExport = () => {
        const ids = selectedOrders.size > 0
            ? Array.from(selectedOrders)
            : filteredOrders.map(o => o.id);

        if (ids.length === 0) {
            toast.warning(t("toast.noOrders"), t("toast.noOrdersDesc"));
            return;
        }

        try {
            exportOrders(ids, "xlsx");
            toast.success(t("toast.exportSuccessful"), t("toast.exportSuccessfulDesc").replace("{count}", String(ids.length)));
        } catch (error) {
            toast.error(t("toast.exportFailed"), t("toast.exportFailedDesc"));
        }
    };

    const handlePrimeExport = async () => {
        const ids = selectedOrders.size > 0
            ? Array.from(selectedOrders)
            : filteredOrders.map(o => o.id);

        if (ids.length === 0) {
            toast.warning("No orders selected", "Select orders before exporting");
            return;
        }

        let ordersToExport: Order[] = [];
        if (selectedOrders.size > 0) {
            ordersToExport = orders.filter(o => selectedOrders.has(o.id));
        } else {
            ordersToExport = filteredOrders;
        }

        try {
            const batchName = `Prime Export ${new Date().toLocaleDateString('en-GB')}`;
            const { success: batchSuccess, error: batchError } = await createBatch(
                batchName,
                ids,
                "prime",
                "invoice"
            );

            if (batchSuccess) {
                await exportOrdersToPrimeCSV(ids, ordersToExport);
                const previousStatuses = ordersToExport.map(o => ({ id: o.id, status: o.status }));
                setSelectedOrders(new Set());
                toast({
                    title: "Export successful",
                    description: `${ids.length} orders exported via Prime`,
                    variant: "success",
                    duration: 20000,
                    action: {
                        label: `Move ${ids.length} → In Transit`,
                        onClick: async () => {
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
                        }
                    }
                });
            } else {
                throw new Error(batchError || "Failed to create export batch");
            }
        } catch (err) {
            console.error("Prime export error:", err);
            toast.error(
                "Export failed",
                err instanceof Error ? err.message : "Could not complete the export process"
            );
        }
    };

    return {
        isProcessing,
        handleBulkConfirm,
        handleBulkDeliver,
        handleBulkReject,
        handleBulkArchive,
        handleBulkDelete,
        handleBulkNew,
        handleBulkContacted,
        handleBulkInTransit,
        handleBulkCompleted,
        handleBulkNoResponse,
        handleExport,
        handlePrimeExport
    };
};
