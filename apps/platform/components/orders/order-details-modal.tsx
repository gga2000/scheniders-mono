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
} from "@scheniders/ui/dialog";
import { formatIQD, formatDate, generateWhatsAppLink, getBaseOrderId } from "@/lib/utils";
import { validatePhoneDetailed, formatPhoneForDisplay } from "@/lib/order-utils";
import { getAllGovernorateCodes, extractGovernorate } from "@/lib/address-validator";
import { cn } from "@/lib/utils";
import { scheduleDayFromToday } from "@/lib/order-format-utils";
import { toBaghdadDayKey } from "@/lib/order-window";
import type { Order, OrderStatusHistory, OrderNote, MessageTemplate, OrderItem } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { usePrompt } from "@scheniders/ui/prompt-dialog";
import { OrderTimeline } from "./order-timeline";
import { PresenceAvatarGroup } from "./presence-avatar-group";
import { ProductPicker } from "./product-picker";
import { OrderCustomerCard } from "./order-customer-card";
import { OrderItemsEditor } from "./order-items-editor";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { OrderNotes } from "./order-notes";
import { DiscountPresetSelector } from "./discount-preset-selector";
import { DiscountBadge } from "./discount-badge";
import { SplitOrderDialog } from "./split-order-dialog";
import { CreateOrderModal } from "./create-order-modal";
import type { CreateOrderModalInitialData } from "@/components/orders/create-order-modal";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderDetailsForm, useOrderIdEdit } from "@/hooks/use-order-details-form";
import { useOrderDetailsState } from "@/hooks/use-order-details-state";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { useStartOrderConversation } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";

import { DateTimePicker } from "@scheniders/ui/datetime-picker";
import { AvatarPill } from "@/components/ui/avatar-pill";
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
    ShoppingCart,
    PhoneOff,
    Pause,
    CheckCheck,
    Ban,
} from "lucide-react";
import { BlacklistDialog } from "@/components/orders/blacklist-dialog";
import { useStatusLabel } from "@/hooks/use-status-label";
import { useRecordContact } from "@/hooks/use-record-contact";
import { RefundBanner } from "./refund-banner";
import { RefundEntry } from "./refund-entry";

interface OrderDetailsModalProps {
    order: Order | null;
    open: boolean;
    onClose: () => void;
    onUpdate: (orderId: string, updates: Partial<Order>, expectedVersion?: number) => Promise<{ success: boolean; error?: string }>;
    onStatusUpdate?: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onGetTimeline?: (orderId: string) => Promise<OrderStatusHistory[]>;
    onGetNotes?: (orderId: string) => Promise<OrderNote[]>;
    onDelete?: (orderId: string) => Promise<{ success: boolean; error?: string }>;
    onCreateReplacement?: (orderId: string, data: { old_items: OrderItem[]; new_items: OrderItem[]; deductDeliveryFee?: boolean; notes?: string }) => Promise<{ success: boolean; error?: string }>;
    checkOrderIdExists?: (orderId: string, excludeId?: string) => Promise<boolean>;
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
    onDelete,
    onCreateReplacement,
    checkOrderIdExists,
    onOpenTemplatePanel,
    messageTemplates,
}: OrderDetailsModalProps) {
    const [order, setOrder] = useState<Order | null>(propOrder);
    const [isSendingTemplate, setIsSendingTemplate] = useState(false);
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const governorates = getAllGovernorateCodes();
    const isMobile = useIsMobile();
    const { t } = useLanguage();
    const orderStatusLabel = useStatusLabel();
    const { promptUser, PromptComponent } = usePrompt();

    // Sync local state with prop updates
    useEffect(() => {
        setOrder(propOrder);
    }, [propOrder]);

    // Stamps who opened a WhatsApp chat from here; template sends are stamped server-side.
    const recordContact = useRecordContact();

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
        setShowProductPicker,
        orderDateError,
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

    const { splitOrder, isBlacklisted, getBlacklistEntry, addToBlacklist, removeFromBlacklist } = useOrdersContext();
    const startOrderConv = useStartOrderConversation();
    const { open: openChat } = useChatStore();
    const [blacklistDialogOpen, setBlacklistDialogOpen] = useState(false);
    const [blacklistDialogMode, setBlacklistDialogMode] = useState<"add" | "remove">("add");
    const {
        activeTab, setActiveTab,
        timeline, notes, loadingTimeline,
        isUpdatingStatus, handleStatusChangeForm,
        showDeleteConfirm, deleteCountdown, isDeleting,
        handleDeleteClick, handleDeleteConfirm, handleCancelDelete,
        showReplacementModal, setShowReplacementModal,
        replacementDeductDeliveryFee, setReplacementDeductDeliveryFee,
        replacementNotes, setReplacementNotes,
        replacementNewItems, setReplacementNewItems,
        isCreatingReplacement, setIsCreatingReplacement,
        showSplitDialog, setShowSplitDialog, handleSplitOrder,
    } = useOrderDetailsState({
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
    });

    const handleStatusChange = (newStatus: Order["status"]) => {
        handleStatusChangeForm(newStatus, setOrder);
    };

    // Quick action buttons config - Complete status list
    const quickActions = [
        {
            status: "new" as Order["status"],
            label: orderStatusLabel("new"),
            icon: Clock,
            bgColor: "bg-orange-100",
            textColor: "text-orange-900",
            hoverColor: "hover:bg-orange-200",
            borderColor: "border-orange-200",
        },
        {
            status: "pending_checkout" as Order["status"],
            label: orderStatusLabel("pending_checkout"),
            icon: ShoppingCart,
            bgColor: "bg-pink-100",
            textColor: "text-pink-900",
            hoverColor: "hover:bg-pink-200",
            borderColor: "border-pink-200",
        },
        {
            status: "contacted" as Order["status"],
            label: orderStatusLabel("contacted"),
            icon: PhoneCall,
            bgColor: "bg-[var(--pastel-yellow)]",
            textColor: "text-amber-900",
            hoverColor: "hover:bg-[var(--pastel-yellow-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "confirmed" as Order["status"],
            label: orderStatusLabel("confirmed"),
            icon: CheckCircle,
            bgColor: "bg-[var(--pastel-green)]",
            textColor: "text-green-900",
            hoverColor: "hover:bg-[var(--pastel-green-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "in_transit" as Order["status"],
            label: orderStatusLabel("in_transit"),
            icon: Truck,
            bgColor: "bg-blue-100",
            textColor: "text-blue-900",
            hoverColor: "hover:bg-blue-200",
            borderColor: "border-blue-200",
        },
        {
            status: "delivered" as Order["status"],
            label: orderStatusLabel("delivered"),
            icon: CheckCheck,
            bgColor: "bg-[var(--pastel-mint)]",
            textColor: "text-teal-900",
            hoverColor: "hover:bg-[var(--pastel-mint-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "completed" as Order["status"],
            label: orderStatusLabel("completed"),
            icon: CheckCircle,
            bgColor: "bg-green-100",
            textColor: "text-green-900",
            hoverColor: "hover:bg-green-200",
            borderColor: "border-green-200",
        },
        {
            status: "cancelled" as Order["status"],
            label: orderStatusLabel("cancelled"),
            icon: XCircle,
            bgColor: "bg-gray-100",
            textColor: "text-gray-700",
            hoverColor: "hover:bg-gray-200",
            borderColor: "border-gray-200",
        },
        {
            status: "rejected" as Order["status"],
            label: orderStatusLabel("rejected"),
            icon: XCircle,
            bgColor: "bg-[var(--pastel-pink)]",
            textColor: "text-rose-900",
            hoverColor: "hover:bg-[var(--pastel-pink-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "no_response" as Order["status"],
            label: orderStatusLabel("no_response"),
            icon: PhoneOff,
            bgColor: "bg-gray-100",
            textColor: "text-gray-700",
            hoverColor: "hover:bg-gray-200",
            borderColor: "border-gray-200",
        },
        {
            status: "return_pending" as Order["status"],
            label: orderStatusLabel("return_pending"),
            icon: RotateCcw,
            bgColor: "bg-orange-100",
            textColor: "text-orange-900",
            hoverColor: "hover:bg-orange-200",
            borderColor: "border-orange-200",
        },
        {
            status: "suspended" as Order["status"],
            label: orderStatusLabel("suspended"),
            icon: Pause,
            bgColor: "bg-purple-100",
            textColor: "text-purple-900",
            hoverColor: "hover:bg-purple-200",
            borderColor: "border-purple-200",
        },
    ];

    // Handle product selection - add to replacement items if in replacement mode
    const handleProductSelectWrapper = (product: { product_id: string; name: string; price: number; quantity: number; image_url?: string; tag_color?: string }) => {
        if (showReplacementModal) {
            // Add to replacement new items
            setReplacementNewItems(prev => [...prev, product]);
        } else {
            // Normal product selection for editing
            handleProductSelect(product);
        }
    };

    // Reorder functionality
    const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
    // ARCH-3: was Record<string, unknown>, which forced an `as any` at the
    // call site. Typed to what CreateOrderModal actually accepts.
    const [orderInitialData, setOrderInitialData] = useState<CreateOrderModalInitialData | null>(null);
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














    // IMPORTANT: Do NOT return null here — the <Dialog> must always render
    // so Radix can see `open` go from true → false and properly clean up
    // inert attributes / scroll locks on the body.  Otherwise, clicks on the
    // underlying page stop working until a full refresh.
    if (!order) {
        return (
            <Dialog open={false} onOpenChange={() => onClose()}>
                {null}
            </Dialog>
        );
    }







    const handleDiscuss = async () => {
        const convId = await startOrderConv.mutateAsync(order.id);
        openChat(convId);
    };

    const handleWhatsApp = () => {
        if (onOpenTemplatePanel && messageTemplates && messageTemplates.length > 0) {
            onOpenTemplatePanel(order);
        } else {
            const link = generateWhatsAppLink(
                order.phone,
                `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
            );
            window.open(link, "_blank");
            recordContact(order.id);
        }
    };

    const handleSendTemplate = async () => {
        setIsSendingTemplate(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch("/api/webhooks/interakt/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // The send endpoint now requires a signed-in caller.
                    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
                },
                body: JSON.stringify({ order }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to send template");
            }

            toast.success(t("orderDetail.templateSent"));
        } catch (error) {
            toast.error(t("orderDetail.templateFailed"), error instanceof Error ? error.message : "Unknown error");
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

    // ROW 1: abandoned/new/contacted | separator | confirmed/in_transit | separator | pending_refund
    const row1Group1 = [
        {
            status: "pending_checkout" as Order["status"],
            label: orderStatusLabel("pending_checkout"),
            icon: ShoppingCart,
            bgColor: "bg-pink-100",
            textColor: "text-pink-900",
            hoverColor: "hover:bg-pink-200",
        },
        {
            status: "new" as Order["status"],
            label: orderStatusLabel("new"),
            icon: Clock,
            bgColor: "bg-orange-100",
            textColor: "text-orange-900",
            hoverColor: "hover:bg-orange-200",
        },
        {
            status: "contacted" as Order["status"],
            label: orderStatusLabel("contacted"),
            icon: PhoneCall,
            bgColor: "bg-[var(--pastel-yellow)]",
            textColor: "text-amber-900",
            hoverColor: "hover:bg-[var(--pastel-yellow-dark)]",
        },
    ];

    const row1Group2 = [
        {
            status: "confirmed" as Order["status"],
            label: orderStatusLabel("confirmed"),
            icon: CheckCircle,
            bgColor: "bg-[var(--pastel-green)]",
            textColor: "text-green-900",
            hoverColor: "hover:bg-[var(--pastel-green-dark)]",
        },
        {
            status: "in_transit" as Order["status"],
            label: orderStatusLabel("in_transit"),
            icon: Truck,
            bgColor: "bg-blue-100",
            textColor: "text-blue-900",
            hoverColor: "hover:bg-blue-200",
        },
    ];

    const row1Group3 = [
        {
            status: "return_pending" as Order["status"],
            label: orderStatusLabel("return_pending"),
            icon: RotateCcw,
            bgColor: "bg-orange-100",
            textColor: "text-orange-900",
            hoverColor: "hover:bg-orange-200",
        },
    ];

    // ROW 2: cancelled/rejected/didn't_respond | separator | delivered/completed | separator | pending_order
    const row2Group1 = [
        {
            status: "cancelled" as Order["status"],
            label: orderStatusLabel("cancelled"),
            icon: XCircle,
            bgColor: "bg-gray-100",
            textColor: "text-gray-700",
            hoverColor: "hover:bg-gray-200",
        },
        {
            status: "rejected" as Order["status"],
            label: orderStatusLabel("rejected"),
            icon: XCircle,
            bgColor: "bg-[var(--pastel-pink)]",
            textColor: "text-rose-900",
            hoverColor: "hover:bg-[var(--pastel-pink-dark)]",
        },
        {
            status: "no_response" as Order["status"],
            label: orderStatusLabel("no_response"),
            icon: PhoneOff,
            bgColor: "bg-gray-100",
            textColor: "text-gray-700",
            hoverColor: "hover:bg-gray-200",
        },
    ];

    const row2Group2 = [
        {
            status: "delivered" as Order["status"],
            label: orderStatusLabel("delivered"),
            icon: CheckCheck,
            bgColor: "bg-[var(--pastel-mint)]",
            textColor: "text-teal-900",
            hoverColor: "hover:bg-[var(--pastel-mint-dark)]",
        },
        {
            status: "completed" as Order["status"],
            label: orderStatusLabel("completed"),
            icon: CheckCircle,
            bgColor: "bg-green-100",
            textColor: "text-green-900",
            hoverColor: "hover:bg-green-200",
        },
    ];

    const row2Group3 = [
        {
            status: "suspended" as Order["status"],
            label: orderStatusLabel("suspended"),
            icon: Pause,
            bgColor: "bg-purple-100",
            textColor: "text-purple-900",
            hoverColor: "hover:bg-purple-200",
        },
    ];

    // Choose content wrapper based on device
    const ContentWrapper = isMobile ? BottomSheetContent : DialogContent;

    return (
        <>
            <Dialog open={open && !showCreateOrderModal} onOpenChange={(isOpen) => { if (!showProductPicker) onClose(); }} modal={!showProductPicker}>
                <ContentWrapper
                    className={isMobile ? "" : "max-w-4xl"}
                    hideCloseButton={true}
                    {...(isMobile ? { onClose } : {})}
                >
                    {/* Header Area */}
                    <DialogHeader className="space-y-0 pb-0 group relative">
                        {/* Top Row: Order ID and Control Buttons */}
                        <div className="flex items-start justify-between mb-1">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <div className="relative group/id flex items-center gap-2">
                                        <DialogTitle className="font-mono text-xl flex items-center gap-1.5">
                                            {order.order_id?.startsWith('CHK-') ? (
                                                <>
                                                    <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm font-bold">CHK</span>
                                                    <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm font-bold">
                                                        {getBaseOrderId(order.order_id)}
                                                    </span>
                                                </>
                                            ) : (
                                                `#${getBaseOrderId(order.order_id)}`
                                            )}
                                        </DialogTitle>
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
                                    {/* Status Badge with Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                                            className={cn(
                                                "inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider transition-all cursor-pointer hover:opacity-80",
                                                getStatusBadgeStyle()
                                            )}
                                        >
                                            {orderStatusLabel(order.status, order.is_return)}
                                        </button>

                                        {/* Status Dropdown Menu */}
                                        {showStatusDropdown && onStatusUpdate && (
                                            <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-200 p-3 z-50 min-w-[240px] max-h-[500px] overflow-y-auto">
                                                <div className="space-y-1.5">
                                                    {quickActions.map((action) => {
                                                        const Icon = action.icon;
                                                        const isCurrentStatus = order.status === action.status;
                                                        return (
                                                            <button
                                                                key={action.status}
                                                                onClick={() => {
                                                                    handleStatusChange(action.status);
                                                                    setShowStatusDropdown(false);
                                                                }}
                                                                disabled={isCurrentStatus}
                                                                className={cn(
                                                                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-all rounded-lg",
                                                                    action.bgColor,
                                                                    action.textColor,
                                                                    isCurrentStatus
                                                                        ? "ring-2 ring-offset-2 shadow-sm cursor-default font-bold"
                                                                        : cn(action.hoverColor, "cursor-pointer hover:shadow-sm")
                                                                )}
                                                            >
                                                                <Icon className="w-4 h-4 flex-shrink-0" />
                                                                <span className="flex-1 text-left">{action.label}</span>
                                                                {isCurrentStatus && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Blacklist toggle icon */}
                                    {isBlacklisted(order.phone) ? (
                                        <button
                                            onClick={() => { setBlacklistDialogMode("remove"); setBlacklistDialogOpen(true); }}
                                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-gray-900 text-white border border-gray-800 hover:bg-gray-700 transition-all"
                                            title={t("orderDetail.unblacklist")}
                                        >
                                            <Ban className="w-3 h-3" />
                                            {t("orderDetail.blacklisted")}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setBlacklistDialogMode("add"); setBlacklistDialogOpen(true); }}
                                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-500 border border-gray-200 hover:bg-red-100 hover:text-red-600 hover:border-red-200 transition-all"
                                            title={t("orderDetail.addBlacklist")}
                                        >
                                            <Ban className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                {/* Arrival date (YYYY-MM-DD), Baghdad day — the UTC day is a day early after midnight */}
                                <span className="flex items-center gap-1.5 text-xs text-muted">
                                    <Calendar className="h-3 w-3" />
                                    {toBaghdadDayKey(order.created_at)}
                                </span>
                                <RefundBanner order={order} />
                                {/* Action Buttons Row - Reorder, Return, Replace */}
                                {!isEditing && (
                                    <div className="flex items-center gap-2 mt-1">
                                        {/* Reorder Button - Always show */}
                                        <button
                                            onClick={handleReorder}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-all text-xs font-medium dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/40"
                                        >
                                            <PackagePlus className="h-3.5 w-3.5" />
                                            {t("orderDetail.reorder")}
                                        </button>
                                        {/* Refund - only for delivered/completed orders */}
                                        {(order.status === "delivered" || order.status === "completed") && !order.is_return && !order.is_replacement && (
                                            <RefundEntry order={order} />
                                        )}
                                        {/* Replace Button - Only for delivered/completed orders */}
                                        {(order.status === "delivered" || order.status === "completed") && onCreateReplacement && !order.is_return && !order.is_replacement && (
                                            <button
                                                onClick={() => setShowReplacementModal(true)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 transition-all text-xs font-medium dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800 dark:hover:bg-yellow-900/40"
                                            >
                                                <Package className="h-3.5 w-3.5" />
                                                {t("orderDetail.replace")}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                {/* Control Buttons Row */}
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

                                {/* Control Buttons - History, Edit, Close */}
                                {/* Timeline/History Button */}
                                <button
                                    onClick={() => setActiveTab(activeTab === "timeline" ? "details" : "timeline")}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                        activeTab === "timeline"
                                            ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                            : "bg-white border-[var(--card-border)] text-foreground hover:bg-gray-50"
                                    )}
                                >
                                    <History className="h-3.5 w-3.5" />
                                    {t("orderDetail.history")}
                                </button>
                                {/* Discuss Button */}
                                <button
                                    onClick={handleDiscuss}
                                    disabled={startOrderConv.isPending}
                                    title={t("chat.discussOrder", "Discuss")}
                                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                    {t("chat.discussOrder", "Discuss")}
                                </button>
                                {/* Edit Button */}
                                {!isEditing && (
                                    <button
                                        onClick={handleEdit}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[var(--card-border)] text-foreground hover:bg-gray-50 transition-all text-xs font-medium"
                                    >
                                        <Edit2 className="h-3.5 w-3.5" />
                                        {t("orderDetail.edit")}
                                    </button>
                                )}
                                {/* Close Button */}
                                <button
                                    onClick={onClose}
                                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all"
                                    aria-label="Close"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                                </div>

                                {/* Urgency Buttons Container */}
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-[var(--card-border)]">
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
                                                    "w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95",
                                                    isActive
                                                        ? "bg-[var(--ink)] text-white shadow-sm"
                                                        : p.color
                                                )}
                                                title={p.label}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                            </button>
                                        );
                                    })}

                                    {/* Tomorrow Icon */}
                                    <button
                                        onClick={async () => {
                                            if (!order) return;
                                            const dateStr = scheduleDayFromToday(1);

                                            const oldDate = order.scheduled_date;
                                            setOrder(prev => prev ? { ...prev, scheduled_date: dateStr } : null);

                                            const result = await onUpdate(order.id, { scheduled_date: dateStr } as Partial<Order>);
                                            if (!result.success) {
                                                setOrder(prev => prev ? { ...prev, scheduled_date: oldDate } : null);
                                            }
                                        }}
                                        className={cn(
                                            "w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 text-blue-600 hover:bg-blue-50",
                                            order.scheduled_date === scheduleDayFromToday(1) && "bg-blue-100 ring-1 ring-blue-200"
                                        )}
                                        title={t("orderDetail.tomorrow")}
                                    >
                                        <Sun className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Quick Actions - 2 Row Layout */}
                        {!isEditing && onStatusUpdate && (
                            <div className="py-3 border-y border-[var(--card-border)] space-y-3">
                                {/* ROW 1: abandoned/new/contacted | confirmed/in_transit | pending_refund */}
                                <div className="flex items-center gap-4">
                                    {/* Group: abandoned, new, contacted */}
                                    <div className="flex items-center gap-2">
                                        {row1Group1.map((action) => {
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
                                                            ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
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

                                    <div className="h-6 w-px bg-[var(--card-border)]" />

                                    {/* Group: confirmed, in_transit */}
                                    <div className="flex items-center gap-2">
                                        {row1Group2.map((action) => {
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
                                                            ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
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

                                    <div className="h-6 w-px bg-[var(--card-border)]" />

                                    {/* Group: pending_refund */}
                                    <div className="flex items-center gap-2">
                                        {row1Group3.map((action) => {
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
                                                            ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
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
                                </div>

                                {/* ROW 2: cancelled/rejected/didn't_respond | delivered/completed | pending_order */}
                                <div className="flex items-center gap-4">
                                    {/* Group: cancelled, rejected, didn't respond */}
                                    <div className="flex items-center gap-2">
                                        {row2Group1.map((action) => {
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
                                                            ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
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

                                    <div className="h-6 w-px bg-[var(--card-border)]" />

                                    {/* Group: delivered, completed */}
                                    <div className="flex items-center gap-2">
                                        {row2Group2.map((action) => {
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
                                                            ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
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

                                    <div className="h-6 w-px bg-[var(--card-border)]" />

                                    {/* Group: pending_order */}
                                    <div className="flex items-center gap-2">
                                        {row2Group3.map((action) => {
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
                                                            ? cn(action.bgColor, action.textColor, "ring-2 ring-offset-1 shadow-md font-bold border-2 border-current")
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
                                </div>
                            </div>
                        )}


                        {/* Replacement Order Creation Modal */}
                        {showReplacementModal && (
                            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                                <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
                                    <div className="p-6 border-b border-gray-100">
                                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                            <Package className="w-5 h-5 text-blue-600" />
                                            {t("orderDetail.createReplacement")}
                                        </h3>
                                    </div>

                                    <div className="space-y-4 p-6 overflow-y-auto flex-1">
                                        {/* Order Info */}
                                        <div className="bg-gray-50 p-3 rounded-xl text-sm">
                                            <p className="text-muted">{t("orderDetail.originalOrderLabel")}</p>
                                            <p className="font-bold">#{getBaseOrderId(order.order_id)} - {order.customer_name}</p>
                                            <p className="text-muted">{t("orderDetail.amountLabel")} {formatIQD(order.price)}</p>
                                        </div>

                                        {/* Old Items */}
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                                {t("orderDetail.oldProducts")}
                                            </label>
                                            <div className="space-y-2">
                                                {mergeOrderItems(order.items).map((item, index) => (
                                                    <div key={index} className="bg-gray-50 p-3 rounded-lg flex justify-between items-center text-sm">
                                                        <span className="font-medium">{item.name}</span>
                                                        <span className="text-muted">x{item.quantity} - {formatIQD(item.price * item.quantity)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* New Items Selection */}
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                                {t("orderDetail.newProducts")}
                                            </label>
                                            {replacementNewItems.length > 0 ? (
                                                <div className="space-y-2 mb-2">
                                                    {replacementNewItems.map((item, index) => (
                                                        <div key={index} className="bg-blue-50 p-3 rounded-lg flex justify-between items-center text-sm">
                                                            <span className="font-medium text-blue-900">{item.name}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-blue-700">x{item.quantity} - {formatIQD(item.price * item.quantity)}</span>
                                                                <button
                                                                    onClick={() => setReplacementNewItems(prev => prev.filter((_, i) => i !== index))}
                                                                    className="text-red-600 hover:text-red-800"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="bg-gray-50 p-4 rounded-lg text-center text-sm text-muted mb-2">
                                                    {t("orderDetail.noNewProducts")}
                                                </div>
                                            )}
                                            <button
                                                onClick={() => setShowProductPicker(true)}
                                                className="w-full px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-all flex items-center justify-center gap-2"
                                            >
                                                <PackagePlus className="w-4 h-4" />
                                                {t("orderDetail.addNewProduct")}
                                            </button>
                                        </div>

                                        {/* Price Difference */}
                                        {replacementNewItems.length > 0 && (
                                            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                                                <p className="text-sm text-blue-700 mb-1">{t("orderDetail.priceDifference")}</p>
                                                <p className="text-xl font-bold text-blue-900">
                                                    {(() => {
                                                        const oldTotal = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
                                                        const newTotal = replacementNewItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                                                        const diff = newTotal - oldTotal;
                                                        return diff >= 0 ? `+${formatIQD(diff)}` : formatIQD(diff);
                                                    })()}
                                                </p>
                                            </div>
                                        )}

                                        {/* Notes Input - Editable */}
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                                {t("orderDetail.replacementNotes")}
                                            </label>
                                            <textarea
                                                value={replacementNotes}
                                                onChange={(e) => setReplacementNotes(e.target.value)}
                                                rows={5}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                                                placeholder={t("orderDetail.replacementNotesPlaceholder")}
                                            />
                                        </div>

                                        {/* Deduct Delivery Fee Checkbox */}
                                        <label className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-all">
                                            <input
                                                type="checkbox"
                                                checked={replacementDeductDeliveryFee}
                                                onChange={(e) => setReplacementDeductDeliveryFee(e.target.checked)}
                                                className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-200"
                                            />
                                            <div>
                                                <p className="font-medium text-amber-800">{t("orderDetail.deductDeliveryReplacement")}</p>
                                                <p className="text-xs text-amber-600">{t("orderDetail.deductDeliveryReplacementDesc")}</p>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Actions */}
                                    <div className="p-6 border-t border-gray-100 flex gap-3">
                                        <button
                                            onClick={() => {
                                                setShowReplacementModal(false);
                                                setReplacementDeductDeliveryFee(false);
                                                setReplacementNotes("استبدال المنتج القديم بعد التأكد من سلامته وعدم تضرر زجاجة العطر او نقصانها خلافه يمنع الاستبدال قطعاً, ثم إعطاء الزبون المنتج الجديد . 5000 دينار توصيل مقطوعة من الحساب");
                                                setReplacementNewItems([]);
                                            }}
                                            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                                        >
                                            {t("orderDetail.cancelAction")}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!onCreateReplacement) {
                                                    toast.error(t("orderDetail.replacementError"), t("orderDetail.noReplacementContext"));
                                                    return;
                                                }
                                                if (replacementNewItems.length === 0) {
                                                    toast.error(t("orderDetail.replacementError"), t("orderDetail.selectNewProducts"));
                                                    return;
                                                }
                                                setIsCreatingReplacement(true);
                                                try {
                                                    const result = await onCreateReplacement(order.id, {
                                                        old_items: order.items || [],
                                                        new_items: replacementNewItems,
                                                        deductDeliveryFee: replacementDeductDeliveryFee,
                                                        notes: replacementNotes,
                                                    });
                                                    setIsCreatingReplacement(false);
                                                    if (result.success) {
                                                        setShowReplacementModal(false);
                                                        setReplacementDeductDeliveryFee(false);
                                                        setReplacementNotes("استبدال المنتج القديم بعد التأكد من سلامته وعدم تضرر زجاجة العطر او نقصانها خلافه يمنع الاستبدال قطعاً, ثم إعطاء الزبون المنتج الجديد . 5000 دينار توصيل مقطوعة من الحساب");
                                                        setReplacementNewItems([]);
                                                        onClose();
                                                        toast.success(t("orderDetail.replacementCreated"), t("orderDetail.replacementCreated"));
                                                    } else {
                                                        toast.error(t("orderDetail.replacementFailed"), result.error || t("orderDetail.replacementFailed"));
                                                    }
                                                } catch (err) {
                                                    setIsCreatingReplacement(false);
                                                    toast.error(t("orderDetail.replacementError"), `${t("orderDetail.replacementFailed")}: ${err instanceof Error ? err.message : "Unknown error"}`);
                                                }
                                            }}
                                            disabled={isCreatingReplacement}
                                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isCreatingReplacement ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Package className="w-4 h-4" />
                                            )}
                                            {t("orderDetail.createReplacementBtn")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogDescription className="sr-only">
                            Order details for {order.order_id}
                        </DialogDescription>
                    </DialogHeader>

                    {activeTab === "timeline" && (
                        <div className="py-2">

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
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">

                            {/* Customer Info Card - Compact & Organized */}
                            <OrderCustomerCard
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                                onStatusUpdate={onStatusUpdate}
                                isUpdatingStatus={isUpdatingStatus}
                                handleStatusChange={handleStatusChange}
                                orderDateError={orderDateError}
                                onRequestEdit={handleEdit}
                                onContactRecorded={recordContact}
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
                                                title={t("orderDetail.sendConfirmTooltip")}
                                            >
                                                {isSendingTemplate ? (
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <Send className="h-4 w-4" />
                                                )}
                                                {t("orderDetail.sendConfirmTemplate")}
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
                onSelect={handleProductSelectWrapper}
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
                    initialData={orderInitialData ?? undefined}
                />
            )}

            {/* Dynamic async prompt dialog */}
            <PromptComponent />

            {/* Blacklist dialog */}
            {order && (
                <BlacklistDialog
                    open={blacklistDialogOpen}
                    onClose={() => setBlacklistDialogOpen(false)}
                    mode={blacklistDialogMode}
                    customerName={order.customer_name}
                    customerPhone={order.phone}
                    existingEntry={getBlacklistEntry(order.phone)}
                    onConfirm={async (reason, notes) => {
                        if (blacklistDialogMode === "add" && reason) {
                            await addToBlacklist(order.phone, reason, notes);
                        } else if (blacklistDialogMode === "remove") {
                            await removeFromBlacklist(order.phone);
                        }
                    }}
                />
            )}
        </>
    );
}
