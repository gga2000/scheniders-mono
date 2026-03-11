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
    onStatusUpdate?: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string; superseded?: boolean }>;
    onGetTimeline?: (orderId: string) => Promise<OrderStatusHistory[]>;
    onGetNotes?: (orderId: string) => Promise<OrderNote[]>;
    onDelete?: (orderId: string) => Promise<{ success: boolean; error?: string }>;
    splitOrder?: (orderId: string, keptItems: any[], returnedItems: any[]) => Promise<{ success: boolean; error?: string }>;
    promptUser: (options: { title: string; description?: string; placeholder?: string }) => Promise<string | null>;
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
    onDelete,
    splitOrder,
    promptUser,
    t
}: UseOrderDetailsStateProps) {

    // Tab & Timeline State
    const [activeTab, setActiveTab] = useState<"details" | "timeline">("details");
    const [timeline, setTimeline] = useState<OrderStatusHistory[]>([]);
    const [notes, setNotes] = useState<OrderNote[]>([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);


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

    // Replacement State
    const [showReplacementModal, setShowReplacementModal] = useState(false);
    const [replacementDeductDeliveryFee, setReplacementDeductDeliveryFee] = useState(false);
    const [replacementNotes, setReplacementNotes] = useState("استبدال المنتج القديم بعد التأكد من سلامته وعدم تضرر زجاجة العطر او نقصانها خلافه يمنع الاستبدال قطعاً, ثم إعطاء الزبون المنتج الجديد . 5000 دينار توصيل مقطوعة من الحساب");
    const [replacementNewItems, setReplacementNewItems] = useState<any[]>([]);
    const [isCreatingReplacement, setIsCreatingReplacement] = useState(false);

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
            setShowReplacementModal(false);
            setReplacementNewItems([]);
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
            const promptResult = await promptUser({
                title: t("orderDetail.cancelTitle") || "تأكيد الإلغاء",
                description: t("orderDetail.cancelReason") || "سبب الإلغاء (اختياري)",
                placeholder: "سبب الإلغاء..."
            });
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
            if (!result.superseded) {
                toast.error(t("toast.statusFailed"), result.error || t("orderDetail.statusFailed"));
                // Revert on failure
                setOrderLocal(prev => prev ? { ...prev, status: previousStatus } : null);
            }
        } else {
            toast.success(t("toast.statusUpdated"), t("toast.statusUpdatedDesc").replace("{status}", String(newStatus)));
        }

        setIsUpdatingStatus(false);
    };


    return {
        activeTab, setActiveTab,
        timeline, notes, loadingTimeline,
        isUpdatingStatus, handleStatusChangeForm,
        showDeleteConfirm, deleteCountdown, isDeleting,
        handleDeleteClick, handleDeleteConfirm, handleCancelDelete,
        showReturnModal, setShowReturnModal,
        returnReason, setReturnReason,
        deductDeliveryFee, setDeductDeliveryFee,
        isCreatingReturn, setIsCreatingReturn,
        showReplacementModal, setShowReplacementModal,
        replacementDeductDeliveryFee, setReplacementDeductDeliveryFee,
        replacementNotes, setReplacementNotes,
        replacementNewItems, setReplacementNewItems,
        isCreatingReplacement, setIsCreatingReplacement,
        showSplitDialog, setShowSplitDialog, handleSplitOrder,
    };
}
