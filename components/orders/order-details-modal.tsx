"use client";

import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";
import {
    Dialog,
    DialogContent,
    BottomSheetContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { formatIQD, formatDate, generateWhatsAppLink, getStatusLabel, getBaseOrderId } from "@/lib/utils";
import { validatePhoneDetailed, formatPhoneForDisplay } from "@/lib/order-utils";
import { getAllGovernorateCodes, extractGovernorate } from "@/lib/address-validator";
import { cn } from "@/lib/utils";
import type { Order, OrderStatusHistory, OrderNote } from "@/lib/supabase";
import { OrderTimeline } from "./order-timeline";
import { PresenceAvatarGroup } from "./presence-avatar-group";
import { ProductPicker } from "./product-picker";
import { DiscountPresetSelector } from "./discount-preset-selector";
import { DiscountBadge } from "./discount-badge";
import { SplitOrderDialog } from "./split-order-dialog";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import {
    MapPin,
    Phone,
    User,
    Calendar,
    Package,
    MessageCircle,
    Edit2,
    Save,
    X,
    FileText,
    CheckCircle,
    PhoneCall,
    Truck,
    XCircle,
    Zap,
    Flag,
    Flame,
    Clock,
    CalendarDays,
    History,
    CreditCard,
    Banknote,
    Trash2,
    AlertTriangle,
    RotateCcw,
    Globe,
    Scissors,
    Minus,
    Sun,
} from "lucide-react";

interface OrderDetailsModalProps {
    order: Order | null;
    open: boolean;
    onClose: () => void;
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    onStatusUpdate?: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onGetTimeline?: (orderId: string) => Promise<OrderStatusHistory[]>;
    onGetNotes?: (orderId: string) => Promise<OrderNote[]>;
    onAddNote?: (orderId: string, note: string) => Promise<{ success: boolean; error?: string }>;
    onDelete?: (orderId: string) => Promise<{ success: boolean; error?: string }>;
    onCreateReturn?: (orderId: string, data: { return_amount: number; reason: string; deductDeliveryFee?: boolean }) => Promise<{ success: boolean; error?: string }>;
    checkOrderIdExists?: (orderId: string, excludeId?: string) => Promise<boolean>;
}

export function OrderDetailsModal({
    order: propOrder,
    open,
    onClose,
    onUpdate,
    onStatusUpdate,
    onGetTimeline,
    onGetNotes,
    onAddNote,
    onDelete,
    onCreateReturn,
    checkOrderIdExists,
}: OrderDetailsModalProps) {
    const [order, setOrder] = useState<Order | null>(propOrder);
    const governorates = getAllGovernorateCodes();
    const isMobile = useIsMobile();
    const { t } = useLanguage();

    // Sync local state with prop updates
    useEffect(() => {
        setOrder(propOrder);
    }, [propOrder]);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [formData, setFormData] = useState<Partial<Order>>({});
    const [activeTab, setActiveTab] = useState<"details" | "timeline">("details");
    const [timeline, setTimeline] = useState<OrderStatusHistory[]>([]);
    const [notes, setNotes] = useState<OrderNote[]>([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [newNote, setNewNote] = useState("");
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [showProductPicker, setShowProductPicker] = useState(false);
    // Delete confirmation state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteCountdown, setDeleteCountdown] = useState(5);
    const [isDeleting, setIsDeleting] = useState(false);
    // Return order state
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [returnReason, setReturnReason] = useState("");
    const [deductDeliveryFee, setDeductDeliveryFee] = useState(false);
    const [isCreatingReturn, setIsCreatingReturn] = useState(false);
    // Split Order state
    const [showSplitDialog, setShowSplitDialog] = useState(false);
    const { splitOrder } = useOrdersContext();

    const handleSplitOrder = async (kept: any[], returned: any[]) => {
        if (!order || !splitOrder) return;
        const result = await splitOrder(order.id, kept, returned);
        if (result.success) {
            onClose(); // Close modal as the order is now split and changed significantly
            // Optionally show toast success
        } else {
            alert("Failed to split: " + result.error);
        }
    };

    // ID Edit State
    const [isEditingId, setIsEditingId] = useState(false);
    const [tempOrderId, setTempOrderId] = useState("");
    const [idError, setIdError] = useState<string | null>(null);
    const [isCheckingId, setIsCheckingId] = useState(false);
    const [showIdWarning, setShowIdWarning] = useState(false);
    const [idCountdown, setIdCountdown] = useState(5);
    const [isSavingId, setIsSavingId] = useState(false);
    // Date picker state
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [tempDate, setTempDate] = useState("");

    // Fetch timeline when tab switches
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
    }, [open, activeTab, order?.id]);

    // Reset when closed
    useEffect(() => {
        if (!open) {
            setIsEditing(false);
            setFormData({});
            setActiveTab("details");
            setTimeline([]);
            setNotes([]);
            setShowDeleteConfirm(false);
            setDeleteCountdown(5);
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

    // ID Change Countdown
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (showIdWarning && idCountdown > 0) {
            timer = setTimeout(() => setIdCountdown(prev => prev - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [showIdWarning, idCountdown]);

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
        }
    };

    const handleCancelDelete = () => {
        setShowDeleteConfirm(false);
        setDeleteCountdown(5);
    };



    const startIdEdit = () => {
        setTempOrderId(getBaseOrderId(order?.order_id || ""));
        setIdError(null);
        setIsEditingId(true);
    };

    const cancelIdEdit = () => {
        setIsEditingId(false);
        setTempOrderId("");
        setIdError(null);
    };

    const handleIdChange = async (val: string) => {
        setTempOrderId(val);
        setIdError(null);

        if (!val.trim()) {
            setIdError(t("orderDetail.idEmpty"));
            return;
        }

        if (checkOrderIdExists) {
            setIsCheckingId(true);
            const exists = await checkOrderIdExists(val, order?.id);
            setIsCheckingId(false);
            if (exists) {
                setIdError(t("orderDetail.idExists"));
            }
        }
    };

    const initiateIdSave = () => {
        if (idError || !tempOrderId.trim()) return;
        if (tempOrderId === order?.order_id) {
            setIsEditingId(false);
            return;
        }
        setShowIdWarning(true);
        setIdCountdown(5);
    };

    const confirmIdSave = async () => {
        if (!order || !onUpdate) return;

        setIsSavingId(true);
        const result = await onUpdate(order.id, { order_id: tempOrderId } as Partial<Order>);
        setIsSavingId(false);

        if (result.success) {
            setOrder(prev => prev ? { ...prev, order_id: tempOrderId } : prev);
            setShowIdWarning(false);
            setIsEditingId(false);
        } else {
            alert("Failed to update ID: " + result.error);
            setShowIdWarning(false);
        }
    };

    if (!order) return null;

    const handleEdit = () => {
        setFormData({
            customer_name: order.customer_name,
            phone: formatPhoneForDisplay(order.phone),
            secondary_phone: formatPhoneForDisplay(order.secondary_phone) || "",
            city: order.city || "",
            governorate_code: order.governorate_code || "",
            address_details: order.address_details || "",
            notes: order.notes || "",
            internal_notes: order.internal_notes || "",
            price: order.price,
            discount_amount: order.discount_amount || 0,
            payment_status: order.payment_status || "cod",
            delivery_slot: order.delivery_slot || undefined,
            delivery_order_id: order.delivery_order_id || "",
            items: order.items ? [...order.items] : [],
            created_at: order.created_at,
        });
        setIsEditing(true);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setFormData({});
    };

    const handleSave = async () => {
        setIsSaving(true);
        const result = await onUpdate(order.id, formData);

        if (result.success) {
            // Update local order state with new values immediately
            setOrder((prev) => prev ? { ...prev, ...formData } as Order : prev);
            setIsEditing(false);
            setFormData({});
        } else {
            alert(`${t("orderDetail.saveFailed")} ${result.error}`);
        }

        setIsSaving(false);
    };


    const handleAddNote = async () => {
        if (!newNote.trim() || !onAddNote || !order) return;

        setIsAddingNote(true);
        const result = await onAddNote(order.id, newNote);

        if (result.success) {
            setNewNote("");
            // Refresh timeline/notes
            if (onGetNotes) {
                const updatedNotes = await onGetNotes(order.id);
                setNotes(updatedNotes);
            }
        } else {
            alert(`${t("orderDetail.noteFailed")} ${result.error}`);
        }
        setIsAddingNote(false);
    };

    const handleStatusChange = async (newStatus: Order["status"]) => {
        if (!onStatusUpdate || !order) return;

        setIsUpdatingStatus(true);

        const previousStatus = order.status;

        // Optimistic update
        setOrder(prev => prev ? { ...prev, status: newStatus } : null);

        let rejectionReason: string | undefined;
        if (newStatus === "cancelled") {
            const promptResult = prompt(t("orderDetail.cancelReason"));
            if (promptResult === null) {
                // User cancelled, revert
                setOrder(prev => prev ? { ...prev, status: previousStatus } : null);
                setIsUpdatingStatus(false);
                return;
            }
            rejectionReason = promptResult;
        }

        const result = await onStatusUpdate(order.id, newStatus, rejectionReason);

        if (!result.success) {
            alert(`${t("orderDetail.statusFailed")} ${result.error}`);
            // Revert on failure
            setOrder(prev => prev ? { ...prev, status: previousStatus } : null);
        }

        setIsUpdatingStatus(false);
    };

    const handleWhatsApp = () => {
        const link = generateWhatsAppLink(
            order.phone,
            `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
        );
        window.open(link, "_blank");
    };

    const displayValue = (key: keyof Order) => {
        if (isEditing && key in formData) {
            return formData[key];
        }
        return order[key];
    };

    const updateFormData = (key: string, value: any) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    // Helper to remove an item from the order
    const handleRemoveItem = (indexToRemove: number) => {
        const currentItems = (formData.items || order.items || []) as any[];
        const updatedItems = currentItems.filter((_, idx) => idx !== indexToRemove);
        // Recalculate total
        const newTotal = updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setFormData((prev) => ({
            ...prev,
            items: updatedItems,
            price: newTotal
        }));
    };

    // Helper to update item quantity
    const handleUpdateItemQuantity = (index: number, newQuantity: number) => {
        if (newQuantity < 1) return;
        const currentItems = [...((formData.items || order.items || []) as any[])];
        currentItems[index] = { ...currentItems[index], quantity: newQuantity };
        // Recalculate total
        const newTotal = currentItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setFormData((prev) => ({
            ...prev,
            items: currentItems,
            price: newTotal
        }));
    };

    // Helper to open product picker
    const handleAddItem = () => {
        setShowProductPicker(true);
    };

    // Handle product selection from picker
    const handleProductSelect = (product: { name: string; price: number; quantity: number; image_url?: string }) => {
        setFormData((prev) => {
            const currentItems = [...((prev.items || order.items || []) as any[])];
            currentItems.push(product);
            // Recalculate total
            const newTotal = currentItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            return {
                ...prev,
                items: currentItems,
                price: newTotal
            };
        });
    };

    const getStatusBadgeStyle = () => {
        switch (order.status) {
            case "new": return "bg-orange-200 text-orange-900";
            case "contacted": return "bg-[var(--pastel-yellow)] text-amber-900";
            case "confirmed": return "bg-[var(--pastel-green)] text-green-900";
            case "cancelled": return "bg-gray-200 text-gray-700";
            case "in_transit": return "bg-blue-200 text-blue-900";
            case "delivered": return "bg-[var(--pastel-mint)] text-teal-900";
            case "rejected": return "bg-[var(--pastel-pink)] text-rose-900";
            default: return "bg-gray-100 text-gray-700";
        }
    };

    // Quick action buttons config - Soft pastel colors
    // Show "Return to New" for contacted orders that were marked by mistake
    const showReturnToNew = order.status === "contacted";

    const quickActions = [
        // Return to New option (only for contacted orders)
        ...(showReturnToNew ? [{
            status: "new" as Order["status"],
            label: t("orderDetail.newReturn"),
            icon: Clock,
            bgColor: "bg-orange-100",
            textColor: "text-orange-900",
            hoverColor: "hover:bg-orange-200",
            borderColor: "border-orange-200",
        }] : []),
        {
            status: "contacted" as Order["status"],
            label: t("orderDetail.contacted"),
            icon: PhoneCall,
            bgColor: "bg-[var(--pastel-yellow)]",
            textColor: "text-amber-900",
            hoverColor: "hover:bg-[var(--pastel-yellow-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "confirmed" as Order["status"],
            label: t("orderDetail.confirmed"),
            icon: CheckCircle,
            bgColor: "bg-[var(--pastel-green)]",
            textColor: "text-green-900",
            hoverColor: "hover:bg-[var(--pastel-green-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "delivered" as Order["status"],
            label: t("orderDetail.delivered"),
            icon: Truck,
            bgColor: "bg-[var(--pastel-mint)]",
            textColor: "text-teal-900",
            hoverColor: "hover:bg-[var(--pastel-mint-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "cancelled" as Order["status"],
            label: t("orderDetail.cancel"),
            icon: XCircle,
            bgColor: "bg-[var(--pastel-pink)]",
            textColor: "text-rose-900",
            hoverColor: "hover:bg-[var(--pastel-pink-dark)]",
            borderColor: "border-transparent",
        },
    ];

    // Choose content wrapper based on device
    const ContentWrapper = isMobile ? BottomSheetContent : DialogContent;

    return (
        <>
            <Dialog open={open} onOpenChange={(isOpen) => { if (!showProductPicker) onClose(); }} modal={!showProductPicker}>
                <ContentWrapper
                    className={isMobile ? "" : "max-w-4xl"}
                    {...(isMobile ? { onClose } : {})}
                >
                    {/* Header Area */}
                    <DialogHeader className="space-y-0 pb-0 group relative">
                        {/* Top Row: Order ID, Status, Timeline + Edit Buttons */}
                        <div className="flex items-center justify-between mb-3 mr-10">
                            <div className="flex items-center gap-3">
                                <div className="relative group/id">
                                    <DialogTitle className="font-mono text-xl">#{getBaseOrderId(order.order_id)}</DialogTitle>
                                    {!isEditingId && (
                                        <button
                                            onClick={startIdEdit}
                                            className="absolute -top-1 -right-3 p-1 text-muted hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all opacity-0 group-hover/id:opacity-100 bg-white shadow-sm border border-gray-100"
                                            title="Edit Order ID"
                                        >
                                            <Edit2 className="w-2.5 h-2.5" />
                                        </button>
                                    )}
                                </div>
                                <span className={cn(
                                    "inline-block px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider",
                                    getStatusBadgeStyle()
                                )}>
                                    {getStatusLabel(order.status)}
                                </span>
                                <span className="flex items-center gap-1.5 text-xs text-muted">
                                    <Calendar className="h-3 w-3" />
                                    {formatDate(order.created_at)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Presence Indicators */}
                                <PresenceAvatarGroup orderId={order.id} className="mr-2 hidden sm:flex" />

                                {/* Edit ID Warning Modal */}
                                {showIdWarning && (
                                    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                                        <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border-2 border-red-100 animate-in fade-in zoom-in duration-200">
                                            <div className="flex flex-col items-center text-center gap-4">
                                                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                                                    <AlertTriangle className="w-8 h-8 text-red-600" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold text-gray-900">{t("orderDetail.warningChangeId")}</h3>
                                                    <p className="text-sm text-gray-500 mt-2">
                                                        {t("orderDetail.warningChangeIdDesc")}
                                                    </p>
                                                    <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                        <div className="flex items-center justify-center gap-2 text-sm">
                                                            <span className="text-muted line-through">#{order.order_id}</span>
                                                            <span className="text-gray-400">→</span>
                                                            <span className="font-bold text-foreground">#{tempOrderId}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="w-full pt-2">
                                                    <button
                                                        onClick={confirmIdSave}
                                                        disabled={idCountdown > 0 || isSavingId}
                                                        className="w-full py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all relative overflow-hidden"
                                                    >
                                                        {idCountdown > 0 ? (
                                                            <span>{t("orderDetail.waitConfirm").replace("{n}", String(idCountdown))}</span>
                                                        ) : isSavingId ? (
                                                            <span>{t("orderDetail.saving")}</span>
                                                        ) : (
                                                            <span>{t("orderDetail.confirmChange")}</span>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setShowIdWarning(false)}
                                                        className="mt-3 text-sm text-muted hover:text-foreground font-medium"
                                                    >
                                                        {t("orderDetail.cancel")}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ID Editing UI */}
                                {isEditingId && (
                                    <div className="absolute top-4 left-6 z-10 flex items-center gap-2 bg-white p-1 rounded-lg shadow-lg border border-gray-100">
                                        <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted font-mono text-sm">#</span>
                                            <input
                                                value={tempOrderId}
                                                onChange={(e) => handleIdChange(e.target.value)}
                                                className={cn(
                                                    "pl-6 pr-2 py-1.5 w-40 text-sm font-bold font-mono border rounded-md focus:outline-none focus:ring-2",
                                                    idError ? "border-red-300 focus:ring-red-200 bg-red-50" : "border-gray-200 focus:ring-blue-100"
                                                )}
                                                placeholder="Order ID"
                                                autoFocus
                                            />
                                            {isCheckingId && (
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                                    <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={initiateIdSave}
                                            disabled={!!idError || !tempOrderId}
                                            className="p-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 disabled:opacity-50"
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={cancelIdEdit}
                                            className="p-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>

                                        {/* Error Tooltip */}
                                        {idError && (
                                            <div className="absolute top-full left-0 mt-2 bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-20">
                                                {idError}
                                                <div className="absolute -top-1 left-4 w-2 h-2 bg-red-600 rotate-45" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Timeline Button */}
                                <button
                                    onClick={() => setActiveTab(activeTab === "timeline" ? "details" : "timeline")}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                        activeTab === "timeline"
                                            ? "bg-[var(--foreground)] text-white border-transparent"
                                            : "bg-white border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                    )}
                                >
                                    <History className="h-3.5 w-3.5" />
                                    {t("orderDetail.history")}
                                </button>
                                {/* Edit Button */}
                                {!isEditing && (
                                    <button
                                        onClick={handleEdit}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all text-xs font-medium"
                                    >
                                        <Edit2 className="h-3.5 w-3.5" />
                                        {t("orderDetail.edit")}
                                    </button>
                                )}
                                {/* Return Button - Only for delivered/completed orders */}
                                {(order.status === "delivered" || order.status === "completed") && onCreateReturn && !order.is_return && (
                                    <button
                                        onClick={() => setShowReturnModal(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 transition-all text-xs font-medium"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        {t("orderDetail.return")}
                                    </button>
                                )}
                                {/* Refund Status Buttons - Moved to Customer Card */}
                            </div>
                        </div>

                        {/* Quick Actions Row - Mobile Optimized */}
                        {/* Quick Actions Row - Mobile Optimized */}
                        {!isEditing && (
                            <div className="py-3 border-y border-[var(--card-border)] flex flex-wrap items-center gap-2">
                                {/* Status Actions */}
                                {onStatusUpdate && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        {quickActions.map((action) => {
                                            const Icon = action.icon;
                                            const isCurrentStatus = order.status === action.status;
                                            return (
                                                <button
                                                    key={action.status}
                                                    onClick={() => handleStatusChange(action.status)}
                                                    disabled={isUpdatingStatus || isCurrentStatus}
                                                    className={cn(
                                                        "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                                        isCurrentStatus
                                                            ? "bg-[var(--foreground)] text-white ring-2 ring-offset-1 ring-[var(--foreground)] shadow-sm"
                                                            : cn(action.bgColor, action.textColor, action.hoverColor, "active:scale-95 border border-transparent hover:border-black/5"),
                                                        isUpdatingStatus && "opacity-50 cursor-wait"
                                                    )}
                                                >
                                                    <Icon className="w-3.5 h-3.5" />
                                                    <span>{action.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Priority & Schedule Icons (Right Side) */}
                                <div className="flex items-center gap-1.5 ml-auto border-l border-[var(--card-border)] pl-2">
                                    {/* Priority Icons */}
                                    {[
                                        { value: 'normal', label: t("orderDetail.priority.normal"), icon: Minus, color: "text-gray-500 hover:bg-gray-100" },
                                        { value: 'high', label: t("orderDetail.priority.high"), icon: Flag, color: "text-amber-600 hover:bg-amber-50" },
                                        { value: 'urgent', label: t("orderDetail.priority.urgent"), icon: Flame, color: "text-red-600 hover:bg-red-50" },
                                    ].map((p) => {
                                        const Icon = p.icon;
                                        const isActive = order.priority === p.value || (!order.priority && p.value === 'normal');
                                        return (
                                            <button
                                                key={p.value}
                                                onClick={async () => {
                                                    if (!order) return;
                                                    const oldPriority = order.priority;
                                                    const newPriority = p.value as Order["priority"];
                                                    setOrder(prev => prev ? { ...prev, priority: newPriority } : null);

                                                    const result = await onUpdate(order.id, { priority: newPriority } as Partial<Order>);
                                                    if (!result.success) {
                                                        setOrder(prev => prev ? { ...prev, priority: oldPriority } : null);
                                                    }
                                                }}
                                                className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95",
                                                    isActive
                                                        ? "bg-[var(--foreground)] text-white shadow-sm"
                                                        : p.color
                                                )}
                                                title={p.label}
                                            >
                                                <Icon className="w-4 h-4" />
                                            </button>
                                        );
                                    })}

                                    {/* Tomorrow Icon */}
                                    <button
                                        onClick={async () => {
                                            if (!order) return;
                                            const tomorrow = new Date();
                                            tomorrow.setDate(tomorrow.getDate() + 1);
                                            const dateStr = tomorrow.toISOString().split('T')[0];

                                            const oldDate = order.scheduled_date;
                                            setOrder(prev => prev ? { ...prev, scheduled_date: dateStr } : null);

                                            const result = await onUpdate(order.id, { scheduled_date: dateStr } as Partial<Order>);
                                            if (!result.success) {
                                                setOrder(prev => prev ? { ...prev, scheduled_date: oldDate } : null);
                                            }
                                        }}
                                        className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 text-blue-600 hover:bg-blue-50",
                                            order.scheduled_date === new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0] && "bg-blue-100 ring-1 ring-blue-200"
                                        )}
                                        title={t("orderDetail.tomorrow")}
                                    >
                                        <Sun className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Return Order Creation Modal */}
                        {showReturnModal && (
                            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                                    <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                        <RotateCcw className="w-5 h-5 text-red-600" />
                                        {t("orderDetail.createReturn")}
                                    </h3>

                                    <div className="space-y-4">
                                        {/* Order Info */}
                                        <div className="bg-gray-50 p-3 rounded-xl text-sm">
                                            <p className="text-muted">{t("orderDetail.originalOrder")}</p>
                                            <p className="font-bold">#{getBaseOrderId(order.order_id)} - {order.customer_name}</p>
                                            <p className="text-muted">{t("orderDetail.amount")} {formatIQD(order.price)}</p>
                                        </div>

                                        {/* Reason Input */}
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                                {t("orderDetail.returnReason")}
                                            </label>
                                            <select
                                                value={returnReason}
                                                onChange={(e) => setReturnReason(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-100 bg-white"
                                            >
                                                <option value="">{t("orderDetail.selectReturnReason")}</option>
                                                <option value="لم يعجب الزبون المنتج">{t("orderDetail.reason.didntLike")}</option>
                                                <option value="المنتج تالف أو معيب">{t("orderDetail.reason.damaged")}</option>
                                                <option value="المنتج خاطئ">{t("orderDetail.reason.wrong")}</option>
                                                <option value="تأخر التوصيل">{t("orderDetail.reason.lateDelivery")}</option>
                                                <option value="الزبون غير موجود">{t("orderDetail.reason.notFound")}</option>
                                                <option value="الزبون ألغى الطلب">{t("orderDetail.reason.cancelled")}</option>
                                                <option value="العنوان غير صحيح">{t("orderDetail.reason.wrongAddress")}</option>
                                                <option value="سبب آخر">{t("orderDetail.reason.other")}</option>
                                            </select>
                                        </div>

                                        {/* Deduct Delivery Fee Checkbox */}
                                        <label className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-all">
                                            <input
                                                type="checkbox"
                                                checked={deductDeliveryFee}
                                                onChange={(e) => setDeductDeliveryFee(e.target.checked)}
                                                className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-200"
                                            />
                                            <div>
                                                <p className="font-medium text-amber-800">{t("orderDetail.deductDeliveryFee")}</p>
                                                <p className="text-xs text-amber-600">{t("orderDetail.deductDeliveryDesc")}</p>
                                            </div>
                                        </label>

                                        {/* Preview */}
                                        <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                                            <p className="text-sm text-red-700">{t("orderDetail.refundAmount")}</p>
                                            <p className="text-2xl font-bold text-red-700">
                                                -{formatIQD(Number(order.price) - (deductDeliveryFee ? 5000 : 0))}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-3 mt-6">
                                        <button
                                            onClick={() => {
                                                setShowReturnModal(false);
                                                setReturnReason("");
                                                setDeductDeliveryFee(false);
                                            }}
                                            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                                        >
                                            {t("orderDetail.cancel")}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!returnReason) {
                                                    alert(t("orderDetail.selectReasonError"));
                                                    return;
                                                }
                                                if (!onCreateReturn) {
                                                    alert(t("orderDetail.noReturnContext"));
                                                    return;
                                                }
                                                setIsCreatingReturn(true);
                                                try {
                                                    const result = await onCreateReturn(order.id, {
                                                        return_amount: Number(order.price),
                                                        reason: returnReason,
                                                        deductDeliveryFee,
                                                    });
                                                    setIsCreatingReturn(false);
                                                    if (result.success) {
                                                        setShowReturnModal(false);
                                                        setReturnReason("");
                                                        setDeductDeliveryFee(false);
                                                        onClose();
                                                    } else {
                                                        alert(result.error || t("orderDetail.returnError"));
                                                    }
                                                } catch (err) {
                                                    setIsCreatingReturn(false);
                                                    alert(`${t("orderDetail.returnError")}: ${err instanceof Error ? err.message : "Unknown error"}`);
                                                }
                                            }}
                                            disabled={isCreatingReturn || !returnReason}
                                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isCreatingReturn ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <RotateCcw className="w-4 h-4" />
                                            )}
                                            {t("orderDetail.confirmReturn")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogDescription className="sr-only">
                            Order details for {order.order_id}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Timeline View */}
                    {activeTab === "timeline" && (
                        <div className="py-4 max-h-[50vh] overflow-y-auto">
                            {/* Add Note Input */}
                            <div className="mb-6 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <textarea
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    placeholder={t("orderDetail.addNoteInternal")}
                                    className="w-full text-sm bg-white border border-gray-200 rounded-lg p-3 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none mb-2"
                                />
                                <div className="flex justify-end">
                                    <button
                                        onClick={handleAddNote}
                                        disabled={!newNote.trim() || isAddingNote}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-foreground text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {isAddingNote ? (
                                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Save className="w-3 h-3" />
                                        )}
                                        {t("orderDetail.saveNote")}
                                    </button>
                                </div>
                            </div>

                            {loadingTimeline ? (
                                <div className="text-center py-8">
                                    <div className="w-6 h-6 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                                    <p className="text-sm text-muted">{t("orderDetail.loadingTimeline")}</p>
                                </div>
                            ) : (
                                <OrderTimeline statusHistory={timeline} notes={notes} />
                            )}
                        </div>
                    )}

                    {/* Details Content (default) */}
                    {activeTab === "details" && (
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto -mr-2 pr-4">

                            {/* Customer Info Card - Compact & Organized */}
                            <div className="bg-white rounded-xl border border-[var(--card-border)] overflow-hidden">
                                <div className="px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)] flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted" />
                                        <span className="font-semibold text-foreground">{t("orderDetail.customerInfo")}</span>
                                    </div>
                                    {/* Refund Status Buttons - Only for return orders in return_pending status */}
                                    {order.is_return && order.status === "return_pending" && onStatusUpdate && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleStatusChange("refund_delivered")}
                                                disabled={isUpdatingStatus}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all text-xs font-medium disabled:opacity-50"
                                            >
                                                <CheckCircle className="h-3.5 w-3.5" />
                                                {t("orderDetail.refundDelivered")}
                                            </button>
                                            <button
                                                onClick={() => handleStatusChange("refund_failed")}
                                                disabled={isUpdatingStatus}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all text-xs font-medium disabled:opacity-50"
                                            >
                                                <XCircle className="h-3.5 w-3.5" />
                                                {t("orderDetail.refundFailed")}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 grid gap-4">
                                    {/* Row 1: Name, Governorate, Governorate Code - 3 equal columns */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {/* Name */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider block mb-1">{t("orderDetail.name")}</span>
                                            {isEditing ? (
                                                <input
                                                    value={displayValue("customer_name") as string}
                                                    onChange={(e) => updateFormData("customer_name", e.target.value)}
                                                    className="w-full h-[38px] px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                                />
                                            ) : (
                                                <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                                    <p className="text-sm font-medium text-foreground">{order.customer_name}</p>
                                                </div>
                                            )}
                                        </div>
                                        {/* Governorate */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider block mb-1">{t("orderDetail.province")}</span>
                                            {isEditing ? (
                                                <div className="relative">
                                                    <select
                                                        value={(displayValue("city") || "") as string}
                                                        onChange={(e) => {
                                                            const selectedGov = governorates.find(g => g.nameAr === e.target.value);
                                                            updateFormData("city", e.target.value);
                                                            // Auto-update governorate code when city is selected
                                                            if (selectedGov) {
                                                                updateFormData("governorate_code", selectedGov.code);
                                                            }
                                                        }}
                                                        className="w-full h-[38px] px-3 pr-8 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                                    >
                                                        <option value="" disabled>{t("orderDetail.selectProvince")}</option>
                                                        {governorates.map((gov) => (
                                                            <option key={gov.code} value={gov.nameAr}>
                                                                {gov.nameAr}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                                    <p className="text-sm font-medium text-foreground">{order.city || "—"}</p>
                                                </div>
                                            )}
                                        </div>
                                        {/* Governorate Code */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider block mb-1">{t("orderDetail.provinceCode")}</span>
                                            {isEditing ? (
                                                <div className="relative">
                                                    <select
                                                        value={(displayValue("governorate_code") || "") as string}
                                                        onChange={(e) => {
                                                            updateFormData("governorate_code", e.target.value);
                                                        }}
                                                        className="w-full h-[38px] px-3 pr-8 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-mono font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                                    >
                                                        <option value="">{t("orderDetail.noCode")}</option>
                                                        {governorates.map((gov) => (
                                                            <option key={gov.code} value={gov.code}>
                                                                {gov.code} - {gov.nameAr}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                                    <p className="text-sm font-medium text-foreground font-mono">
                                                        {(() => {
                                                            const code = order.governorate_code || order.validated_governorate_code;
                                                            if (code) return code;
                                                            // If not stored, extract from city
                                                            if (order.city) {
                                                                const { governorate } = extractGovernorate(order.city, undefined, order.address_details);
                                                                if (governorate?.code) return governorate.code;
                                                            }
                                                            return <span className="text-muted">—</span>;
                                                        })()}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Row 2: Full Address (single full-width field) */}
                                    <div>
                                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-1">
                                            <MapPin className="h-3 w-3" />
                                            {t("orderDetail.fullAddress")}
                                            {(!order.address_details || order.address_details.trim() === '') && (
                                                <span className="relative flex h-2.5 w-2.5 ml-1" title="لا يوجد تفاصيل عنوان">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
                                                </span>
                                            )}
                                        </span>
                                        {isEditing ? (
                                            <textarea
                                                value={(displayValue("address_details") || "") as string}
                                                onChange={(e) => updateFormData("address_details", e.target.value)}
                                                rows={2}
                                                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--card-border)] resize-none"
                                            />
                                        ) : (
                                            <p className="text-sm font-medium text-foreground bg-[var(--background)] border border-[var(--card-border)] px-3 py-2.5 rounded-lg leading-relaxed min-h-[38px] flex items-center">
                                                {order.address_details || t("orderDetail.noAddress")}
                                            </p>
                                        )}
                                    </div>

                                    {/* Row 3: Phone Numbers */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Primary Phone */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                                <Phone className="w-3 h-3" />
                                                {t("orderDetail.primaryPhone")}
                                                {!isEditing && !validatePhoneDetailed(order.phone).isValid && (
                                                    <span className="relative flex h-2.5 w-2.5 ml-1">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                                    </span>
                                                )}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {isEditing ? (
                                                    <div className="flex-1 relative">
                                                        <input
                                                            value={displayValue("phone") as string}
                                                            onChange={(e) => updateFormData("phone", e.target.value)}
                                                            dir="ltr"
                                                            className={cn(
                                                                "w-full h-[38px] px-3 bg-[var(--background)] border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2",
                                                                !validatePhoneDetailed(displayValue("phone") as string).isValid
                                                                    ? "border-red-300 focus:ring-red-200"
                                                                    : "border-[var(--card-border)] focus:ring-[var(--card-border)]"
                                                            )}
                                                        />
                                                        {!validatePhoneDetailed(displayValue("phone") as string).isValid && (
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 group">
                                                                <span className="relative flex h-2.5 w-2.5">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                                                </span>
                                                                <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                    {validatePhoneDetailed(displayValue("phone") as string).errorMessageAr}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className={cn(
                                                        "flex-1 h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg",
                                                        !validatePhoneDetailed(order.phone).isValid && "border-red-200 bg-red-50"
                                                    )}>
                                                        <span
                                                            className={cn(
                                                                "font-mono text-sm font-medium text-foreground",
                                                                !validatePhoneDetailed(order.phone).isValid && "text-red-600"
                                                            )}
                                                            dir="ltr"
                                                        >
                                                            {formatPhoneForDisplay(order.phone) || "—"}
                                                        </span>
                                                    </div>
                                                )}
                                                <button
                                                    onClick={handleWhatsApp}
                                                    disabled={!validatePhoneDetailed(order.phone).isValid}
                                                    className={cn(
                                                        "w-9 h-9 rounded-lg transition-all flex items-center justify-center flex-shrink-0",
                                                        validatePhoneDetailed(order.phone).isValid
                                                            ? "bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)]"
                                                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                                    )}
                                                    title={validatePhoneDetailed(order.phone).isValid ? t("orderDetail.whatsApp") : validatePhoneDetailed(order.phone).errorMessageAr}
                                                >
                                                    <MessageCircle className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                        {/* Secondary Phone */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                                <Phone className="w-3 h-3" />
                                                {t("orderDetail.secondaryPhone")}
                                                {!isEditing && order.secondary_phone && !validatePhoneDetailed(order.secondary_phone).isValid && (
                                                    <span className="relative flex h-2.5 w-2.5 ml-1">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                                    </span>
                                                )}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {isEditing ? (
                                                    <div className="flex-1 relative">
                                                        <input
                                                            value={(displayValue("secondary_phone") || "") as string}
                                                            onChange={(e) => updateFormData("secondary_phone", e.target.value)}
                                                            dir="ltr"
                                                            placeholder={t("orderDetail.optional")}
                                                            className={cn(
                                                                "w-full h-[38px] px-3 bg-[var(--background)] border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2",
                                                                (displayValue("secondary_phone") as string) && !validatePhoneDetailed(displayValue("secondary_phone") as string).isValid
                                                                    ? "border-red-300 focus:ring-red-200"
                                                                    : "border-[var(--card-border)] focus:ring-[var(--card-border)]"
                                                            )}
                                                        />
                                                        {(displayValue("secondary_phone") as string) && !validatePhoneDetailed(displayValue("secondary_phone") as string).isValid && (
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 group">
                                                                <span className="relative flex h-2.5 w-2.5">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                                                </span>
                                                                <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                    {validatePhoneDetailed(displayValue("secondary_phone") as string).errorMessageAr}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className={cn(
                                                        "flex-1 h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg",
                                                        order.secondary_phone && !validatePhoneDetailed(order.secondary_phone).isValid && "border-red-200 bg-red-50"
                                                    )}>
                                                        <span
                                                            className={cn(
                                                                "font-mono text-sm font-medium text-foreground",
                                                                order.secondary_phone && !validatePhoneDetailed(order.secondary_phone).isValid && "text-red-600"
                                                            )}
                                                            dir="ltr"
                                                        >
                                                            {formatPhoneForDisplay(order.secondary_phone) || "—"}
                                                        </span>
                                                    </div>
                                                )}
                                                {order.secondary_phone && validatePhoneDetailed(order.secondary_phone).isValid && (
                                                    <button
                                                        onClick={() => {
                                                            const link = generateWhatsAppLink(
                                                                order.secondary_phone!,
                                                                `مرحباً، بخصوص طلب ${order.order_id}`
                                                            );
                                                            window.open(link, "_blank");
                                                        }}
                                                        className="w-9 h-9 rounded-lg bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all flex items-center justify-center flex-shrink-0"
                                                        title={t("orderDetail.whatsApp")}
                                                    >
                                                        <MessageCircle className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Row 4: Date, Delivery ID, Source */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Order Date */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                                <Calendar className="w-3 h-3" />
                                                {t("orderDetail.orderDate")}
                                            </span>
                                            {isEditing ? (
                                                <DateTimePicker
                                                    value={displayValue("created_at") as string}
                                                    onChange={(isoString) => updateFormData("created_at", isoString)}
                                                    showTime={true}
                                                    className="h-[38px]"
                                                />
                                            ) : (
                                                <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                                    <span className="font-mono text-sm text-foreground">
                                                        {new Date(order.created_at).toLocaleString('en-US', {
                                                            year: 'numeric',
                                                            month: '2-digit',
                                                            day: '2-digit',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                            hour12: true
                                                        })}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        {/* Delivery Order ID */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                                <Truck className="w-3 h-3" />
                                                {t("orderDetail.trackingNo")}
                                            </span>
                                            {isEditing ? (
                                                <input
                                                    value={(displayValue("delivery_order_id") || "") as string}
                                                    onChange={(e) => updateFormData("delivery_order_id", e.target.value)}
                                                    dir="ltr"
                                                    placeholder={t("orderDetail.trackingPlaceholder")}
                                                    className="w-full h-[38px] px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                                />
                                            ) : (
                                                <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                                    <span className="font-mono text-sm text-foreground">
                                                        {order.delivery_order_id || <span className="text-muted">{t("orderDetail.notSet")}</span>}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        {/* Source */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                                <Globe className="w-3 h-3" />
                                                {t("orderDetail.source")}
                                            </span>
                                            {isEditing ? (
                                                <div className="relative">
                                                    <select
                                                        value={(displayValue("source") || "other") as string}
                                                        onChange={(e) => updateFormData("source", e.target.value)}
                                                        className="w-full h-[38px] px-3 pr-8 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                                    >
                                                        <option value="whatsapp">WhatsApp</option>
                                                        <option value="lightfunnels">LightFunnels</option>
                                                        <option value="meta">Instagram (Meta)</option>
                                                        <option value="tiktok">TikTok</option>
                                                        <option value="delivery_import">Delivery Import</option>
                                                        <option value="shop">{t("orderDetail.source.shop")}</option>
                                                        <option value="other">Other</option>
                                                    </select>
                                                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                                    {(() => {
                                                        const src = order.source || 'other';
                                                        switch (src) {
                                                            case 'whatsapp':
                                                                return (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                                                        <span className="text-sm font-medium">WhatsApp</span>
                                                                    </div>
                                                                );
                                                            case 'lightfunnels':
                                                                return (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                                                                        <span className="text-sm font-medium">LightFunnels</span>
                                                                    </div>
                                                                );
                                                            case 'meta':
                                                                return (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600" />
                                                                        <span className="text-sm font-medium">Instagram</span>
                                                                    </div>
                                                                );
                                                            case 'tiktok':
                                                                return (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-black" />
                                                                        <span className="text-sm font-medium">TikTok</span>
                                                                    </div>
                                                                );
                                                            case 'shop':
                                                                return (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                                        <span className="text-sm font-medium">{t("orderDetail.source.shop")}</span>
                                                                    </div>
                                                                );
                                                            default:
                                                                return (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full bg-gray-400" />
                                                                        <span className="text-sm font-medium">Other</span>
                                                                    </div>
                                                                );
                                                        }
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    </div>


                                    {/* Payment & Delivery Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-3 mt-1">
                                        {/* Payment Status (With Edit) */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-1.5">
                                                <Banknote className="h-3 w-3" />
                                                {t("orderDetail.paymentStatus")}
                                            </span>
                                            {isEditing ? (
                                                <div className="flex bg-[var(--background)] rounded-lg border border-[var(--card-border)] p-1">
                                                    {(["cod", "prepaid", "pending", "partial"] as const).map((status) => (
                                                        <button
                                                            key={status}
                                                            onClick={() => updateFormData("payment_status", status)}
                                                            className={cn(
                                                                "flex-1 text-xs py-1.5 rounded-md transition-all font-medium",
                                                                (formData.payment_status || order.payment_status) === status
                                                                    ? "bg-white shadow-sm text-foreground ring-1 ring-black/5"
                                                                    : "text-muted hover:text-foreground hover:bg-white/50"
                                                            )}
                                                        >
                                                            {status === "cod" ? t("orderDetail.payment.cod") : status === "prepaid" ? t("orderDetail.payment.prepaid") : status === "partial" ? t("orderDetail.payment.partial") : t("orderDetail.pending")}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                                    <span className={cn(
                                                        "px-2.5 py-1 rounded-full text-xs font-semibold",
                                                        order.payment_status === "prepaid" ? "bg-emerald-100 text-emerald-800" :
                                                            order.payment_status === "cod" ? "bg-amber-100 text-amber-800" :
                                                                order.payment_status === "partial" ? "bg-blue-100 text-blue-800" :
                                                                    "bg-gray-100 text-gray-800"
                                                    )}>
                                                        {order.payment_status === "cod" ? t("orderDetail.payment.cod") : order.payment_status === "prepaid" ? t("orderDetail.payment.prepaidFull") : order.payment_status === "partial" ? t("orderDetail.payment.partialFull") : t("orderDetail.pending")}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Delivery Slot (With Edit) */}
                                        <div>
                                            <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-1.5">
                                                <Clock className="h-3 w-3" />
                                                {t("orderDetail.preferredDelivery")}
                                            </span>
                                            {isEditing ? (
                                                <div className="flex bg-[var(--background)] rounded-lg border border-[var(--card-border)] p-1">
                                                    {[
                                                        { id: "morning", label: t("orderDetail.slot.morning") },
                                                        { id: "afternoon", label: t("orderDetail.slot.afternoon") },
                                                        { id: "evening", label: t("orderDetail.slot.evening") }
                                                    ].map((slot) => (
                                                        <button
                                                            key={slot.id}
                                                            onClick={() => updateFormData("delivery_slot", slot.id)}
                                                            className={cn(
                                                                "flex-1 text-[10px] py-1.5 rounded-md transition-all font-medium mx-0.5 whitespace-nowrap",
                                                                (formData.delivery_slot || order.delivery_slot) === slot.id
                                                                    ? "bg-white shadow-sm text-foreground ring-1 ring-black/5"
                                                                    : "text-muted hover:text-foreground hover:bg-white/50"
                                                            )}
                                                        >
                                                            {slot.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-[38px] flex items-center px-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg">
                                                    <span className="text-sm text-foreground font-medium">
                                                        {order.delivery_slot ?
                                                            (order.delivery_slot === "morning" ? t("orderDetail.slot.morningFull") :
                                                                order.delivery_slot === "afternoon" ? t("orderDetail.slot.afternoonFull") :
                                                                    t("orderDetail.slot.eveningFull"))
                                                            : t("orderDetail.unspecified")
                                                        }
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>



                            {/* Products Card */}
                            <div className="bg-white rounded-xl border border-[var(--card-border)] overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)]">
                                    <Package className="h-4 w-4 text-muted" />
                                    <span className="font-semibold text-foreground">{t("orderDetail.products")}</span>
                                    <span className="text-xs text-muted">
                                        {order.items?.length || 0} {t("orderDetail.item")}
                                    </span>
                                    {/* Add Product Button */}
                                    {isEditing && (
                                        <button
                                            className="ml-auto px-3 py-1.5 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-all flex items-center gap-1"
                                            onClick={handleAddItem}
                                        >
                                            <span className="text-sm">+</span> {t("orderDetail.addProduct")}
                                        </button>
                                    )}
                                </div>
                                <div className="divide-y divide-[var(--card-border)]">
                                    {(() => {
                                        const itemsToShow = isEditing ? (formData.items || order.items || []) : (order.items || []);
                                        return itemsToShow.length > 0 ? (
                                            (itemsToShow as any[]).map((item, index) => (
                                                <div key={index} className="flex items-center gap-3 p-3 hover:bg-[var(--background)] transition-colors group">
                                                    {/* Product image */}
                                                    {item.image_url ? (
                                                        <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-lg bg-[var(--background)] flex items-center justify-center">
                                                            <Package className="w-5 h-5 text-muted" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-foreground truncate">{item.name}</p>
                                                        <div className="flex items-center gap-2 text-xs text-muted">
                                                            {isEditing ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={() => handleUpdateItemQuantity(index, item.quantity - 1)}
                                                                        className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                                                                        disabled={item.quantity <= 1}
                                                                    >
                                                                        -
                                                                    </button>
                                                                    <span className="w-6 text-center font-medium">{item.quantity}</span>
                                                                    <button
                                                                        onClick={() => handleUpdateItemQuantity(index, item.quantity + 1)}
                                                                        className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
                                                                    >
                                                                        +
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span>×{item.quantity}</span>
                                                            )}
                                                            <span>•</span>
                                                            <span>{formatIQD(item.price)}</span>
                                                        </div>
                                                    </div>
                                                    <span className="font-bold text-foreground font-mono">
                                                        {formatIQD(item.price * item.quantity)}
                                                    </span>
                                                    {/* Remove Button - Show when editing */}
                                                    {isEditing && (
                                                        <button
                                                            className="w-8 h-8 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-all flex items-center justify-center"
                                                            onClick={() => handleRemoveItem(index)}
                                                            title={t("orderDetail.deleteItem")}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-6 text-center text-muted">{t("orderDetail.noItems")}</div>
                                        );
                                    })()}
                                </div>
                                {/* Discount + Total */}
                                <div className="border-t border-[var(--card-border)]">
                                    {/* Discount Preset Selector (Edit Mode Only) */}
                                    {isEditing && (
                                        <div className="px-4 py-3">
                                            <DiscountPresetSelector
                                                items={(formData.items || order.items || []) as any[]}
                                                currentDiscount={(displayValue("discount_amount") as number) || 0}
                                                onDiscountChange={(val) => updateFormData("discount_amount", val)}
                                            />
                                        </div>
                                    )}
                                    {/* Discount Row */}
                                    <div className="flex items-center justify-between px-4 py-2">
                                        <span className="text-sm text-muted">{t("orderDetail.customDiscount")}</span>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                value={(displayValue("discount_amount") as number) || 0}
                                                onChange={(e) => updateFormData("discount_amount", Number(e.target.value))}
                                                className="w-24 px-2 py-1 text-right bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                                placeholder="0"
                                            />
                                        ) : (
                                            order.discount_amount ? (
                                                <DiscountBadge
                                                    price={Number(order.price)}
                                                    discountAmount={order.discount_amount}
                                                    className="text-xs px-2.5 py-1"
                                                />
                                            ) : (
                                                <span className="font-mono text-muted">—</span>
                                            )
                                        )}
                                    </div>
                                    {/* Total */}
                                    <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                                        <span className="font-semibold text-foreground">{t("orderDetail.grandTotal")}</span>
                                        {isEditing ? (
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={(displayValue("price") as number) || 0}
                                                        onChange={(e) => updateFormData("price", Number(e.target.value))}
                                                        className="w-28 px-3 py-1.5 text-right bg-white border border-[var(--card-border)] rounded-lg text-foreground font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-200"
                                                        placeholder="0"
                                                    />
                                                    <span className="text-xs text-muted">IQD</span>
                                                </div>
                                                {/* Show calculated vs manual difference as audit trail */}
                                                {(() => {
                                                    const items = (formData.items || order.items || []) as any[];
                                                    const calculatedTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                                                    const manualPrice = (displayValue("price") as number) || 0;
                                                    const diff = manualPrice - calculatedTotal;
                                                    if (diff !== 0) {
                                                        return (
                                                            <div className="flex items-center gap-1.5 text-xs">
                                                                <span className="text-muted">{t("orderDetail.calculated")} {formatIQD(calculatedTotal)}</span>
                                                                <span className={cn(
                                                                    "px-1.5 py-0.5 rounded font-medium",
                                                                    diff > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                                                )}>
                                                                    {diff > 0 ? "+" : ""}{formatIQD(diff)}
                                                                </span>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        ) : (
                                            <span className="text-lg font-bold text-foreground font-mono">
                                                {formatIQD(Number(order.price) - (order.discount_amount || 0))}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Notes Cards - Two types: Order Notes (on invoice) and Internal Notes (employees only) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Order Notes - Shown on invoice */}
                                <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                                    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200">
                                        <FileText className="h-4 w-4 text-amber-600" />
                                        <div>
                                            <span className="font-semibold text-amber-900">{t("orderDetail.orderNotes")}</span>
                                            <span className="text-xs text-amber-600 mr-2">{t("orderDetail.invoiceNote")}</span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {isEditing ? (
                                            <textarea
                                                value={(displayValue("notes") || "") as string}
                                                onChange={(e) => updateFormData("notes", e.target.value)}
                                                placeholder={t("orderDetail.orderNotesPlaceholder")}
                                                rows={2}
                                                className="w-full px-3 py-2 bg-amber-50/50 border border-amber-200 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                                            />
                                        ) : (
                                            <p className="text-sm text-amber-800 min-h-[40px]">
                                                {order.notes || <span className="text-muted italic">{t("orderDetail.noNotes")}</span>}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Internal Notes - Employees only, NOT on invoice */}
                                <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
                                    <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-blue-200">
                                        <FileText className="h-4 w-4 text-blue-600" />
                                        <div>
                                            <span className="font-semibold text-blue-900">{t("orderDetail.internalNotes")}</span>
                                            <span className="text-xs text-blue-600 mr-2">{t("orderDetail.employeesOnly")}</span>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {isEditing ? (
                                            <textarea
                                                value={(displayValue("internal_notes") || "") as string}
                                                onChange={(e) => updateFormData("internal_notes", e.target.value)}
                                                placeholder={t("orderDetail.internalNotesPlaceholder")}
                                                rows={2}
                                                className="w-full px-3 py-2 bg-blue-50/50 border border-blue-200 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                                            />
                                        ) : (
                                            <p className="text-sm text-blue-800 min-h-[40px]">
                                                {order.internal_notes || <span className="text-muted italic">{t("orderDetail.noInternalNotes")}</span>}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Rejection Reason */}
                            {
                                order.status === "rejected" && order.rejection_reason && (
                                    <div className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4">
                                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                                            <XCircle className="w-4 h-4 text-muted" />
                                            {t("orderDetail.rejectionReason")}
                                        </h4>
                                        <p className="text-sm text-muted">{order.rejection_reason}</p>
                                    </div>
                                )
                            }
                        </div>
                    )}

                    <DialogFooter>
                        <div className="w-full flex flex-col gap-4">
                            {/* Delete Confirmation Warning */}
                            {showDeleteConfirm && (
                                <div className="w-full p-4 rounded-xl bg-rose-50 border-2 border-rose-200 animate-in slide-in-from-bottom-2">
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                                            <AlertTriangle className="w-5 h-5 text-rose-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-rose-900">{t("orderDetail.deleteOrderTitle")}</h4>
                                            <p className="text-sm text-rose-700">
                                                {t("orderDetail.deleteOrderMsg").replace("{id}", order.order_id)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCancelDelete}
                                            className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-700 font-medium hover:bg-rose-50 transition-all"
                                        >
                                            {t("orderDetail.cancel")}
                                        </button>
                                        <button
                                            onClick={handleDeleteConfirm}
                                            disabled={deleteCountdown > 0 || isDeleting}
                                            className={cn(
                                                "flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
                                                deleteCountdown > 0
                                                    ? "bg-rose-200 text-rose-400 cursor-not-allowed"
                                                    : "bg-rose-600 text-white hover:bg-rose-700"
                                            )}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            {deleteCountdown > 0 ? t("orderDetail.waitDelete").replace("{n}", String(deleteCountdown)) : isDeleting ? t("orderDetail.deleting") : t("orderDetail.permanentDelete")}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Normal Footer Buttons */}
                            {!showDeleteConfirm && (
                                <div className="flex gap-2 w-full">
                                    {isEditing ? (
                                        <>
                                            <button
                                                onClick={handleCancel}
                                                disabled={isSaving}
                                                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all font-medium"
                                            >
                                                <X className="h-4 w-4" />
                                                {t("orderDetail.cancel")}
                                            </button>
                                            <button
                                                onClick={handleSave}
                                                disabled={isSaving}
                                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all font-semibold shadow-md shadow-green-500/20 disabled:opacity-50 ml-auto"
                                            >
                                                <Save className="h-4 w-4" />
                                                {t("orderDetail.saveChanges")}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            {/* Split Order Button (Only for multi-item confirmed/in_transit orders) */}
                                            {(order.status === "confirmed" || order.status === "in_transit" || order.status === "delivered") &&
                                                !order.is_return &&
                                                order.items && order.items.length > 1 && (
                                                    <button
                                                        onClick={() => setShowSplitDialog(true)}
                                                        className="flex items-center gap-2 px-3 py-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 transition-all font-medium"
                                                        title="Split Order"
                                                    >
                                                        <Scissors className="h-4 w-4" />
                                                    </button>
                                                )}

                                            {/* Delete Button */}
                                            {onDelete && !showDeleteConfirm && (
                                                <button
                                                    onClick={handleDeleteClick}
                                                    className="flex items-center gap-2 px-3 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-all font-medium"
                                                    title={t("orderDetail.deleteOrder")}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={onClose}
                                                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all font-medium ml-auto"
                                            >
                                                {t("orderDetail.close")}
                                            </button>
                                            <button
                                                onClick={handleWhatsApp}
                                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all font-semibold shadow-md shadow-green-500/20"
                                            >
                                                <MessageCircle className="h-4 w-4" />
                                                {t("orderDetail.openWhatsApp")}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </DialogFooter>
                </ContentWrapper>
            </Dialog >

            {showSplitDialog && order && (
                <SplitOrderDialog
                    order={order}
                    open={showSplitDialog}
                    onClose={() => setShowSplitDialog(false)}
                    onConfirm={handleSplitOrder}
                />
            )}

            {/* Product Picker Modal - Outside Dialog for proper z-index */}
            < ProductPicker
                open={showProductPicker}
                onClose={() => setShowProductPicker(false)
                }
                onSelect={handleProductSelect}
            />
        </>
    );
}
