import { useState, useEffect } from "react";
import { Order, OrderStatusHistory, OrderNote } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { getBaseOrderId } from "@/lib/utils";

interface UseOrderDetailsStateProps {
    order: Order | null;
    open: boolean;
    onClose: () => void;
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    onStatusUpdate?: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onGetTimeline?: (orderId: string) => Promise<OrderStatusHistory[]>;
    onGetNotes?: (orderId: string) => Promise<OrderNote[]>;
    onAddNote?: (orderId: string, note: string) => Promise<{ success: boolean; error?: string }>;
    onDelete?: (orderId: string) => Promise<{ success: boolean; error?: string }>;
    splitOrder?: (orderId: string, keptItems: any[], returnedItems: any[]) => Promise<{ success: boolean; error?: string }>;
    t: (key: string) => string;
}

export function useOrderDetailsState({
    order,
    open,
    onClose,
    onUpdate,
    onStatusUpdate,
    onGetTimeline,
    onGetNotes,
    onAddNote,
    onDelete,
    splitOrder,
    t
}: UseOrderDetailsStateProps) {

    // Tab & Timeline State
    const [activeTab, setActiveTab] = useState<"details" | "timeline">("details");
    const [timeline, setTimeline] = useState<OrderStatusHistory[]>([]);
    const [notes, setNotes] = useState<OrderNote[]>([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    // Notes State
    const [newNote, setNewNote] = useState("");
    const [isAddingNote, setIsAddingNote] = useState(false);

    // Status State
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    // Delete State
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteCountdown, setDeleteCountdown] = useState(5);
    const [isDeleting, setIsDeleting] = useState(false);

    // Return State
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [returnReason, setReturnReason] = useState("");
    const [deductDeliveryFee, setDeductDeliveryFee] = useState(false);
    const [isCreatingReturn, setIsCreatingReturn] = useState(false);

    // Split Order State
    const [showSplitDialog, setShowSplitDialog] = useState(false);

    // Data Fetching
    useEffect(() => {
        if (open && activeTab === "timeline" && order && onGetTimeline) {
            setLoadingTimeline(true);
            Promise.all([
                onGetTimeline(order.id),
                onGetNotes ? onGetNotes(order.id) : Promise.resolve([]),
            ]).then(([timelineData, notesData]) => {
                setTimeline(timelineData);
                setNotes(notesData);
                setLoadingTimeline(false);
            });
        }
    }, [open, activeTab, order?.id, onGetTimeline, onGetNotes]);

    // Reset when closed
    useEffect(() => {
        if (!open) {
            setActiveTab("details");
            setTimeline([]);
            setNotes([]);
            setShowDeleteConfirm(false);
            setDeleteCountdown(5);
            setShowReturnModal(false);
            setShowSplitDialog(false);
        }
    }, [open]);

    // Delete countdown timer
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (showDeleteConfirm && deleteCountdown > 0) {
            timer = setTimeout(() => setDeleteCountdown(prev => prev - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [showDeleteConfirm, deleteCountdown]);

    // Handlers
    const handleDeleteClick = () => {
        setShowDeleteConfirm(true);
        setDeleteCountdown(5);
    };

    const handleDeleteConfirm = async () => {
        if (!order || !onDelete || deleteCountdown > 0) return;
        setIsDeleting(true);
        const result = await onDelete(order.id);
        setIsDeleting(false);
        if (result.success) {
            setShowDeleteConfirm(false);
            onClose();
            toast.success(t("toast.orderDeleted"), t("toast.orderDeletedDesc"));
        } else {
            toast.error(t("toast.deleteFailed"), result.error || t("orderDetail.deleteFailed"));
        }
    };

    const handleCancelDelete = () => {
        setShowDeleteConfirm(false);
        setDeleteCountdown(5);
    };

    const handleSplitOrder = async (kept: any[], returned: any[]) => {
        if (!order || !splitOrder) return;
        const result = await splitOrder(order.id, kept, returned);
        if (result.success) {
            onClose();
            toast.success(t("toast.orderSplit"), t("toast.orderSplitDesc"));
        } else {
            toast.error(t("toast.splitFailed"), result.error || t("toast.splitFailedDesc"));
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim() || !onAddNote || !order) return;

        setIsAddingNote(true);
        const result = await onAddNote(order.id, newNote);

        if (result.success) {
            setNewNote("");
            if (onGetNotes) {
                const updatedNotes = await onGetNotes(order.id);
                setNotes(updatedNotes);
            }
            toast.success(t("toast.noteAdded"), t("toast.noteAddedDesc"));
        } else {
            toast.error(t("toast.noteFailed"), result.error || t("orderDetail.noteFailed"));
        }
        setIsAddingNote(false);
    };

    const handleStatusChangeForm = async (
        newStatus: Order["status"],
        setOrderLocal: React.Dispatch<React.SetStateAction<Order | null>>
    ) => {
        if (!onStatusUpdate || !order) return;

        setIsUpdatingStatus(true);
        const previousStatus = order.status;

        // Optimistic update
        setOrderLocal(prev => prev ? { ...prev, status: newStatus } : null);

        let rejectionReason: string | undefined;
        if (newStatus === "cancelled") {
            const promptResult = prompt(t("orderDetail.cancelReason"));
            if (promptResult === null) {
                // User cancelled, revert
                setOrderLocal(prev => prev ? { ...prev, status: previousStatus } : null);
                setIsUpdatingStatus(false);
                return;
            }
            rejectionReason = promptResult;
        }

        const result = await onStatusUpdate(order.id, newStatus, rejectionReason);

        if (!result.success) {
            toast.error(t("toast.statusFailed"), result.error || t("orderDetail.statusFailed"));
            // Revert on failure
            setOrderLocal(prev => prev ? { ...prev, status: previousStatus } : null);
        } else {
            toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDesc").replace("{status}", String(newStatus)));
        }

        setIsUpdatingStatus(false);
    };


    return {
        activeTab, setActiveTab,
        timeline, notes, loadingTimeline,
        newNote, setNewNote, isAddingNote, handleAddNote,
        isUpdatingStatus, handleStatusChangeForm,
        showDeleteConfirm, deleteCountdown, isDeleting,
        handleDeleteClick, handleDeleteConfirm, handleCancelDelete,
        showReturnModal, setShowReturnModal,
        returnReason, setReturnReason,
        deductDeliveryFee, setDeductDeliveryFee,
        isCreatingReturn, setIsCreatingReturn,
        showSplitDialog, setShowSplitDialog, handleSplitOrder,
    };
}
