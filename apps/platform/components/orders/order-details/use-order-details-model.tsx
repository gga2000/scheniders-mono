"use client";

import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";
import { DialogContent, BottomSheetContent } from "@scheniders/ui/dialog";
import { generateWhatsAppLink } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import { getAllGovernorateCodes } from "@/lib/address-validator";
import type { Order, MessageTemplate } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { usePrompt } from "@scheniders/ui/prompt-dialog";
import type { CreateOrderModalInitialData } from "@/components/orders/create-order-modal";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderDetailsForm, useOrderIdEdit } from "@/hooks/use-order-details-form";
import { useOrderDetailsState } from "@/hooks/use-order-details-state";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { useStartOrderConversation } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { useStatusLabel } from "@/hooks/use-status-label";
import { useRecordContact } from "@/hooks/use-record-contact";
import { usePrimeEditReview } from "./use-prime-edit-review";
import { authedFetch } from "@/lib/authed-fetch";

export interface OrderDetailsModalProps {
    order: Order | null;
    open: boolean;
    onClose: () => void;
    onUpdate: (orderId: string, updates: Partial<Order>, expectedVersion?: number) => Promise<{ success: boolean; error?: string }>;
    onStatusUpdate?: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onDelete?: (orderId: string) => Promise<{ success: boolean; error?: string }>;
    checkOrderIdExists?: (orderId: string, excludeId?: string) => Promise<boolean>;
    onOpenTemplatePanel?: (order: Order) => void;
    messageTemplates?: MessageTemplate[];
}

/** State, data and handlers of OrderDetailsModal; the component and its sections render from this. */
export function useOrderDetailsModel(props: OrderDetailsModalProps) {
    const {
    order: propOrder,
    open,
    onClose,
    onUpdate,
    onStatusUpdate,
    onDelete,
    checkOrderIdExists,
    onOpenTemplatePanel,
    messageTemplates,
} = props;
    const [order, setOrder] = useState<Order | null>(propOrder);
    const [isSendingTemplate, setIsSendingTemplate] = useState(false);
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

    const primeEdit = usePrimeEditReview({ order, formData, isEditing, handleSave });

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
    const { can } = usePermission();
    const canUnblock = can(PERMISSIONS.UNBLOCK_CUSTOMERS);
    const canBlock = can(PERMISSIONS.BLOCK_CUSTOMERS);
    const startOrderConv = useStartOrderConversation();
    const { open: openChat } = useChatStore();
    const [blacklistDialogOpen, setBlacklistDialogOpen] = useState(false);
    const [blacklistDialogMode, setBlacklistDialogMode] = useState<"add" | "remove">("add");
    const {
        activeTab, setActiveTab,
        isUpdatingStatus, handleStatusChangeForm,
        showDeleteConfirm, deleteCountdown, isDeleting,
        handleDeleteClick, handleDeleteConfirm, handleCancelDelete,
        showSplitDialog, setShowSplitDialog, handleSplitOrder,
    } = useOrderDetailsState({
        order,
        open,
        onClose,
        onUpdate,
        onStatusUpdate,
        onDelete,
        splitOrder,
        promptUser,
        t
    });

    const handleStatusChange = (newStatus: Order["status"]) => {
        handleStatusChangeForm(newStatus, setOrder);
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














    return {
        propOrder,
        open,
        onClose,
        onUpdate,
        onStatusUpdate,
        onDelete,
        checkOrderIdExists,
        onOpenTemplatePanel,
        messageTemplates,
        order,
        setOrder,
        isSendingTemplate,
        setIsSendingTemplate,
        governorates,
        isMobile,
        t,
        orderStatusLabel,
        promptUser,
        PromptComponent,
        recordContact,
        isEditing,
        setIsEditing,
        isSaving,
        formData,
        setFormData,
        handleEdit,
        handleCancel,
        handleSave,
        primeEdit,
        displayValue,
        updateFormData,
        handleRemoveItem,
        handleUpdateItemQuantity,
        handleAddItem,
        handleProductSelect,
        showProductPicker,
        setShowProductPicker,
        orderDateError,
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
        confirmIdSave,
        splitOrder,
        isBlacklisted,
        getBlacklistEntry,
        addToBlacklist,
        removeFromBlacklist,
        can,
        canUnblock,
        canBlock,
        startOrderConv,
        openChat,
        blacklistDialogOpen,
        setBlacklistDialogOpen,
        blacklistDialogMode,
        setBlacklistDialogMode,
        activeTab,
        setActiveTab,
        isUpdatingStatus,
        handleStatusChangeForm,
        showDeleteConfirm,
        deleteCountdown,
        isDeleting,
        handleDeleteClick,
        handleDeleteConfirm,
        handleCancelDelete,
        showSplitDialog,
        setShowSplitDialog,
        handleSplitOrder,
        handleStatusChange,
        showCreateOrderModal,
        setShowCreateOrderModal,
        orderInitialData,
        setOrderInitialData,
        createOrder,
        handleReorder,
    };
}

/**
 * The part of the details model that needs a loaded order: its handlers.
 * Called by OrderDetailsModal after its "no order" guard.
 */
export function buildOrderDetailsActions(m: OrderDetailsModel, order: Order) {
    const { onOpenTemplatePanel, messageTemplates, setIsSendingTemplate, isMobile, t, recordContact, startOrderConv, openChat } = m;







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
            const response = await authedFetch("/api/webhooks/interakt/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // The send endpoint now requires a signed-in caller.
                    ...(session ? { } : {}),
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

    // Choose content wrapper based on device
    const ContentWrapper = isMobile ? BottomSheetContent : DialogContent;


    return {
        handleDiscuss,
        handleWhatsApp,
        handleSendTemplate,
        getStatusBadgeStyle,
        ContentWrapper,
    };
}

export type OrderDetailsModel = ReturnType<typeof useOrderDetailsModel>;
export type OrderDetailsView = OrderDetailsModel & ReturnType<typeof buildOrderDetailsActions> & { order: Order };
