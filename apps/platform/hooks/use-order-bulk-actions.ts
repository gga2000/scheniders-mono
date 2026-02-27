import { useCallback } from 'react';
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

    const handleBulkConfirm = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "confirmed");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.ordersConfirmed"), t("toast.ordersConfirmedDesc").replace("{count}", String(ids.length)));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkDeliver = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "delivered");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.ordersDelivered"), t("toast.ordersConfirmedDesc").replace("{count}", String(ids.length)));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkReject = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "rejected");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.ordersRejected"), t("toast.ordersConfirmedDesc").replace("{count}", String(ids.length)));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkArchive = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkArchive(ids);
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) {
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
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedOrders.size} orders? This action cannot be undone.`)) {
            return;
        }
        const ids = Array.from(selectedOrders);
        const result = await bulkDelete(ids);

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
    };

    const handleBulkNew = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "new");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "New"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkContacted = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "contacted");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "Contacted"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkInTransit = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "in_transit");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "In Transit"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkCompleted = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "completed");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "Completed"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
    };

    const handleBulkNoResponse = async () => {
        const ids = Array.from(selectedOrders);
        const result = await bulkUpdateStatus(ids, "no_response");
        setSelectedOrders(new Set());
        if (result?.success || result === undefined) toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDescCount").replace("{count}", String(ids.length)).replace("{status}", "No Response"));
        else if (result?.error) toast.error(t("toast.updateFailed"), result.error);
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
                await bulkUpdateStatus(ids, "in_transit");
                setSelectedOrders(new Set());
                toast.success(
                    "Export successful",
                    `${ids.length} orders exported → In Transit`
                );
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
