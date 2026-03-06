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
import type { Order, OrderStatusHistory, OrderNote, MessageTemplate } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { OrderTimeline } from "./order-timeline";
import { PresenceAvatarGroup } from "./presence-avatar-group";
import { ProductPicker } from "./product-picker";
import { OrderCustomerCard } from "./order-customer-card";
import { OrderItemsEditor } from "./order-items-editor";
import { OrderNotes } from "./order-notes";
import { DiscountPresetSelector } from "./discount-preset-selector";
import { DiscountBadge } from "./discount-badge";
import { SplitOrderDialog } from "./split-order-dialog";
import { CreateOrderModal } from "./create-order-modal";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderDetailsForm, useOrderIdEdit } from "@/hooks/use-order-details-form";
import { useOrderDetailsState } from "@/hooks/use-order-details-state";
import { useOrderCrud } from "@/hooks/use-order-crud";

import { DateTimePicker } from "@/components/ui/datetime-picker";
import { OrderAssignment, OrderDuty, mockEmployees } from "@/lib/team-types";
import { AvatarPill } from "@/components/ui/avatar-pill";
import { AssignmentPopover } from "@/components/orders/assignment-popover";
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
    PackagePlus,
    Send,
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
    assignments?: OrderAssignment[];
    onAssignDuty?: (orderId: string, duty: OrderDuty, employeeId: string) => void;
    onOpenTemplatePanel?: (order: Order) => void;
    messageTemplates?: MessageTemplate[];
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
    assignments = [],
    onAssignDuty,
    onOpenTemplatePanel,
    messageTemplates,
}: OrderDetailsModalProps) {
    const [order, setOrder] = useState<Order | null>(propOrder);
    const [isSendingTemplate, setIsSendingTemplate] = useState(false);
    const governorates = getAllGovernorateCodes();
    const isMobile = useIsMobile();
    const { t } = useLanguage();

    // Sync local state with prop updates
    useEffect(() => {
        setOrder(propOrder);
    }, [propOrder]);

    const {
        isEditing,
        setIsEditing,
        isSaving,
        formData,
        setFormData,
        handleEdit,
        handleCancel,
        handleSave,
        displayValue,
        updateFormData,
        handleRemoveItem,
        handleUpdateItemQuantity,
        handleAddItem,
        handleProductSelect,
        showProductPicker,
        setShowProductPicker
    } = useOrderDetailsForm({
        order,
        setOrder,
        onUpdate,
        t
    });

    const {
        isEditingId,
        tempOrderId,
        idError,
        isCheckingId,
        showIdWarning,
        setShowIdWarning,
        idCountdown,
        isSavingId,
        startIdEdit,
        cancelIdEdit,
        handleIdChange,
        initiateIdSave,
        confirmIdSave
    } = useOrderIdEdit({
        order,
        setOrder,
        onUpdate,
        checkOrderIdExists,
        t
    });

    const { splitOrder } = useOrdersContext();
    const {
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
    } = useOrderDetailsState({
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
    });

    const handleStatusChange = (newStatus: Order["status"]) => {
        handleStatusChangeForm(newStatus, setOrder);
    };

    // Reorder functionality
    const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
    const [orderInitialData, setOrderInitialData] = useState<Record<string, unknown> | null>(null);
    const { createOrder } = useOrderCrud();

    const handleReorder = () => {
        if (!order) return;

        // Prepare customer data from the current order (fresh slate — no items pre-filled)
        const initialData = {
            customer_name: order.customer_name,
            phone: formatPhoneForDisplay(order.phone),
            secondary_phone: formatPhoneForDisplay(order.secondary_phone) || "",
            city: order.city || "",
            address_details: order.address_details || "",
            items: [],
            notes: `Reorder from #${order.order_id}`,
            payment_status: "cod" as const,
            source: order.source || "whatsapp" as const,
        };

        setOrderInitialData(initialData);
        setShowCreateOrderModal(true);
    };














    if (!order) return null;







    const handleWhatsApp = () => {
        if (onOpenTemplatePanel && messageTemplates && messageTemplates.length > 0) {
            onOpenTemplatePanel(order);
        } else {
            const link = generateWhatsAppLink(
                order.phone,
                `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
            );
            window.open(link, "_blank");
        }
    };

    const handleSendTemplate = async () => {
        setIsSendingTemplate(true);
        try {
            const response = await fetch("/api/webhooks/interakt/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to send template");
            }

            toast.success("تم إرسال رسالة التأكيد بنجاح");
        } catch (error) {
            toast.error("فشل في إرسال الرسالة", error instanceof Error ? error.message : "Unknown error");
        } finally {
            setIsSendingTemplate(false);
        }
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
            <Dialog open={open && !showCreateOrderModal} onOpenChange={(isOpen) => { if (!showProductPicker) onClose(); }} modal={!showProductPicker}>
                <ContentWrapper
                    className={isMobile ? "" : "max-w-4xl"}
                    {...(isMobile ? { onClose } : {})}
                >
                    {/* Header Area */}
                    <DialogHeader className="space-y-0 pb-0 group relative">
                        {/* Top Row: Order ID, Status, Timeline + Edit Buttons */}
                        <div className="flex items-center justify-between mb-3 mr-10">
                            <div className="flex items-center gap-3">
                                <div className="relative group/id flex items-center gap-2">
                                    {order.order_id?.startsWith('CHK-') && (
                                        <span className="bg-yellow-100 text-yellow-800 text-[11px] px-1.5 py-0.5 rounded font-bold uppercase ring-1 ring-yellow-200 mt-1">CHK</span>
                                    )}
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
                                            ? "bg-[var(--ink)] text-white border-transparent"
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
                                {/* Reorder Button */}
                                {!isEditing && (
                                    <button
                                        onClick={handleReorder}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-all text-xs font-medium dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/40"
                                    >
                                        <PackagePlus className="h-3.5 w-3.5" />
                                        {t("orderDetail.reorder") || "Reorder"}
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
                                                            ? "bg-[var(--ink)] text-white ring-2 ring-offset-1 ring-[var(--foreground)] shadow-sm"
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
                                                        ? "bg-[var(--ink)] text-white shadow-sm"
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

                        {/* Assignments Section (Right Below Quick Actions) */}
                        {!isEditing && (
                            <div className="py-2 border-b border-[var(--card-border)] flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-gray-500 mr-2">التعيين:</span>

                                {assignments.map((assignment) => {
                                    const employee = mockEmployees.find(e => e.id === assignment.employee_id);
                                    if (!employee) return null;
                                    return (
                                        <AvatarPill
                                            key={assignment.id}
                                            employee={employee}
                                            duty={assignment.duty}
                                            size="sm"
                                            interactive={true}
                                            className="h-7 gap-1.5 px-2.5"
                                        />
                                    );
                                })}

                                {/* Empty Assignment Slots */}
                                {onAssignDuty && ['new', 'contacted'].includes(order.status) && !assignments.some(a => a.duty === 'confirmation') && (
                                    <AssignmentPopover
                                        orderId={order.id}
                                        duty="confirmation"
                                        onAssign={onAssignDuty}
                                    />
                                )}

                                {onAssignDuty && order.status === 'confirmed' && !assignments.some(a => a.duty === 'fulfillment') && (
                                    <AssignmentPopover
                                        orderId={order.id}
                                        duty="fulfillment"
                                        onAssign={onAssignDuty}
                                    />
                                )}
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
                                                    toast.warning(t("toast.missingReason"), t("orderDetail.selectReasonError"));
                                                    return;
                                                }
                                                if (!onCreateReturn) {
                                                    toast.error(t("toast.error"), t("orderDetail.noReturnContext"));
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
                                                        toast.success(t("toast.returnCreated"), t("toast.returnCreatedDesc"));
                                                    } else {
                                                        toast.error(t("toast.returnFailed"), result.error || t("orderDetail.returnError"));
                                                    }
                                                } catch (err) {
                                                    setIsCreatingReturn(false);
                                                    toast.error(t("toast.returnError"), `${t("orderDetail.returnError")}: ${err instanceof Error ? err.message : "Unknown error"}`);
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
                                    <div className="w-6 h-6 border-2 border-[var(--ink)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
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
                            <OrderCustomerCard
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                                onStatusUpdate={onStatusUpdate}
                                isUpdatingStatus={isUpdatingStatus}
                                handleStatusChange={handleStatusChange}
                            />

                            {/* Products Card */}
                            <OrderItemsEditor
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                                handleAddItem={handleAddItem}
                                handleUpdateItemQuantity={handleUpdateItemQuantity}
                                handleRemoveItem={handleRemoveItem}
                            />

                            {/* Notes Cards */}
                            <OrderNotes
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                            />

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
                                                onClick={handleSendTemplate}
                                                disabled={isSendingTemplate || order.status !== "new"}
                                                className={cn(
                                                    "flex items-center gap-2 px-6 py-3 rounded-xl text-white transition-all font-semibold shadow-md",
                                                    order.status !== "new"
                                                        ? "bg-gray-300 cursor-not-allowed shadow-none"
                                                        : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                                                )}
                                                title="إرسال رسالة تأكيد (فقط للطلبات الجديدة)"
                                            >
                                                {isSendingTemplate ? (
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <Send className="h-4 w-4" />
                                                )}
                                                إرسال قالب التأكيد
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

            {/* Create Order Modal for Reorder */}
            {showCreateOrderModal && (
                <CreateOrderModal
                    open={showCreateOrderModal}
                    onClose={() => {
                        setShowCreateOrderModal(false);
                        setOrderInitialData(null);
                    }}
                    onCreate={createOrder}
                    checkOrderIdExists={checkOrderIdExists}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    initialData={orderInitialData as any}
                />
            )}
        </>
    );
}
