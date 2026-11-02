"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Order, MessageTemplate } from "@/lib/supabase";
import type { RiskLevel } from "@/lib/fraud-detector";
import type { OrderRiskData } from "@/lib/customer-trust-risk";

import { useOrderStore } from "@/store/use-order-store";

import { REMINDER_DELAY_HOURS, DISCOUNT_DELAY_HOURS } from "@/lib/qstash";
import { formatScheduledDate, getOrderAge, getAgeUrgency, getScheduledState, isScheduledToday, getItemsDisplay, getFullAddress, cleanSystemNotes, getActualNotes, getOrderReasonInfo, getGovernorateCode } from "@/lib/order-format-utils";
import { useLanguage } from "@/hooks/use-language";
import { openWhatsAppChat } from "@/lib/open-whatsapp-chat";

import type { DuplicateWindowAlert } from "@/lib/duplicate-window";
import { isWhatsAppSlot } from "@/lib/whatsapp-contact";
import { followUpState } from "@/lib/follow-up-state";
import type { BlacklistEntry } from "@/hooks/use-order-auxiliary";

import { useStatusLabel } from "@/hooks/use-status-label";
import { useOrderInlineEdit, type InlineEditableField } from "@/hooks/use-order-inline-edit";
import { OrderInlineEdit } from "@/components/orders/table/order-inline-edit";

export interface OrderCardProps {
    order: Order;
    loadingId: string | null;
    onStatusUpdate: (id: string, status: Order["status"], reason?: string) => void;
    onViewDetails: (order: Order) => void;
    isBlacklisted?: boolean;
    riskLevel?: RiskLevel;
    riskAssessment?: OrderRiskData;
    // Duplicate detection props
    customerOrderCount?: number;
    hasDuplicates?: boolean;
    previousOrder?: Order | null;
    onMergeWithPrevious?: (currentOrderId: string, previousOrderId: string) => void;
    onShowDuplicates?: (order: Order) => void;
    /** A 48h twin with money at risk — see lib/duplicate-window. */
    duplicateAlert?: DuplicateWindowAlert;
    /**
     * Called after a `wa.me` chat is opened from this card, so the order records
     * who made contact. A prop rather than a hook: the card renders in Storybook
     * and tests with no auth or query providers around it.
     */
    onContactRecorded?: (orderId: string) => void;
    // Pin functionality
    onTogglePin?: (orderId: string) => void;
    // Clone functionality
    onCloneOrder?: (orderId: string) => void;
    // Screenshot functionality
    onScreenshot?: (order: Order) => void;
    // Cancel with reason dialog
    onCancelWithReason?: (order: Order) => void;
    // Reject with reason dialog
    onRejectWithReason?: (order: Order) => void;
    // Toggle reviewed status for delivered orders
    onToggleReviewed?: (orderId: string) => void;
    // Return order info - if this order has a return, this contains the return order's info
    returnOrderInfo?: { order?: Order; returnOrderId: string; returnSequenceNumber?: number } | null;
    // Original order info - for return orders, this contains the original order's display info
    originalOrderInfo?: { order?: Order; originalOrderId: string; originalSequenceNumber?: number } | null;
    // Compact view: 0 = full, 1 = semi-compact, 2 = ultra-compact
    compact?: 0 | 1 | 2;
    // Grid mode for compact views
    gridMode?: boolean;
    // Action Dock design option
    actionDock?: boolean;
    // WhatsApp template panel
    onOpenTemplatePanel?: (order: Order) => void;
    messageTemplates?: MessageTemplate[];
    // Selection
    isSelected?: boolean;
    onToggleSelection?: (orderId: string) => void;
    // Split functionality
    onSplit?: (order: Order) => void;
    // Archive info
    archivedOrderCount?: number;
    // Blacklist management
    blacklistEntry?: BlacklistEntry | null;
    onAddToBlacklist?: (phone: string, reason: string, notes?: string) => Promise<void>;
    onRemoveFromBlacklist?: (phone: string) => Promise<void>;
    // Disable layout animations (e.g. for virtualized lists)
    isVirtualized?: boolean;
    // Assignments
}

/**
 * Everything an order card layout derives from its props: flags, dates, the
 * inline-edit wrapper, menus' state. Each layout calls it once.
 */
export function useOrderCardModel(props: OrderCardProps) {
    const {
    order,
    loadingId,
    onStatusUpdate,
    onViewDetails,
    isBlacklisted,
    riskLevel,
    riskAssessment,
    customerOrderCount = 1,
    previousOrder,
    onShowDuplicates,
    duplicateAlert,
    onTogglePin,
    onCloneOrder,
    onScreenshot,
    onCancelWithReason,
    onRejectWithReason,
    onToggleReviewed,
    returnOrderInfo,
    originalOrderInfo,
    compact = 0,
    gridMode = false,
    onOpenTemplatePanel,
    messageTemplates = [],
    isSelected = false,
    onToggleSelection,
    onSplit,
    isVirtualized = false,
    hasDuplicates = false,
    onContactRecorded,
    archivedOrderCount = 0,
    actionDock = false,
    blacklistEntry,
    onAddToBlacklist,
    onRemoveFromBlacklist,
    } = props;
    const { t, language } = useLanguage();
    const orderStatusLabel = useStatusLabel();
    const isLoading = loadingId === order.id;
    const isNew = order.status === "new";
    const isReturn = order.is_return;
    const isShopOrder = order.source === "shop" || order.is_shop_order;
    const isUrgent = order.priority === "urgent";
    const isHighPriority = order.priority === "high";
    const isVerifiedCustomer = order.is_verified_customer === true;
    // The customer told us which line to reach them on — show that number as the
    // WhatsApp one so an agent never has to guess between the two.
    const primaryIsWhatsApp = isWhatsAppSlot(order, "primary");
    const secondaryIsWhatsApp = isWhatsAppSlot(order, "secondary");
    const isPinned = order.is_pinned;
    const isDelivered = order.status === "delivered";
    const hasRefund = !!returnOrderInfo;
    const linkedRefundOrder = returnOrderInfo?.order;
    const linkedOriginalOrder = originalOrderInfo?.order;

    // Blacklist dialog state
    const [blacklistDialogOpen, setBlacklistDialogOpen] = useState(false);
    const [blacklistDialogMode, setBlacklistDialogMode] = useState<"add" | "remove">("add");

    // More actions dropdown state
    const [actionsOpen, setActionsOpen] = useState(false);
    // Remember which URLs failed to load so a dead link falls back to the placeholder instead of a broken image.
    const [failedImageUrls, setFailedImageUrls] = useState<ReadonlySet<string>>(() => new Set());
    const markImageFailed = (url: string) => setFailedImageUrls((prev) => new Set(prev).add(url));
    const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
    const actionsRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Search query for highlighting
    const localSearchQuery = useOrderStore((state: { localSearchQuery: string }) => state.localSearchQuery);

    // Helper to conditionally disable layout animations
    const getLayoutId = (id: string) => isVirtualized ? undefined : id;

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (
                actionsRef.current &&
                !actionsRef.current.contains(target) &&
                menuRef.current &&
                !menuRef.current.contains(target)
            ) {
                setActionsOpen(false);
            }
        }
        if (actionsOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [actionsOpen]);

    const orderAge = getOrderAge(order.created_at, language);
    const scheduledState = getScheduledState(order.scheduled_date);
    const ageUrgency = getAgeUrgency(order.status, order.created_at, order.scheduled_date);
    // "Today" reads faster than a date once the day arrives, and it explains why
    // the age badge is calm on an order that was placed days ago.
    const scheduledLabel = isScheduledToday(order.scheduled_date)
        ? t("orderDetail.scheduledToday")
        : formatScheduledDate(order.scheduled_date);
    const scheduledBadgeClass = scheduledState === "future"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200"
        : "bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200";

    // Time-based follow-up cue — based on order creation time (how long customer has been waiting)
    /* eslint-disable react-hooks/purity */
    const hoursSinceCreated = order.created_at
        ? (Date.now() - new Date(order.created_at).getTime()) / 3600000
        : 0;
    /* eslint-enable react-hooks/purity */

    // Determine which follow-up cue to show
    const isContacted = order.status === "contacted";
    const needsDiscount = isContacted && hoursSinceCreated >= DISCOUNT_DELAY_HOURS;
    const needsReminder = isContacted && !needsDiscount && hoursSinceCreated >= REMINDER_DELAY_HOURS;
    // Who (if anyone) already sent the follow-up this order is currently due for,
    // so the cue stops nagging for work someone has done.
    const followUp = followUpState(order, { needsReminder, needsDiscount });

    // Externalized getItemsDisplay
    // Externalized getFullAddress, cleanSystemNotes, getActualNotes
    const fullAddress = getFullAddress(order.city, order.address_details);
    const actualNotes = getActualNotes(order.notes);
    const actualInternalNotes = cleanSystemNotes(order.internal_notes);

    const orderReasonInfo = useMemo(() => getOrderReasonInfo(order, isReturn), [order, isReturn]);

    const governorateCode = getGovernorateCode(order);

    // WF-4: card and grid views had no inline edit at all — correcting a misheard
    // name or a wrong digit meant opening the modal, even though the field being
    // corrected is right there on the card. The table's four editable fields are
    // now editable here too, through the same component and the same validation,
    // so the two surfaces cannot drift apart.
    //
    // A click on an editable field is held for 250ms and cancelled by a double
    // click — the same arrangement the table row uses, and the reason a double
    // click here does not also open the details modal. What that held click then
    // does has to match what a click on the card body does, which differs by
    // layout: the two ultra-compact layouts open the details, the semi-compact
    // grid card has no body click at all, and the full card opens the details
    // only when it is not rendered inside a selectable list.
    const cardBodyOpensDetails =
        compact === 2 ? true
            : (compact === 1 && gridMode) ? false
                : !onToggleSelection;
    const inlineEdit = useOrderInlineEdit();
    const editClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (editClickTimerRef.current) clearTimeout(editClickTimerRef.current);
    }, []);

    const editable = (
        field: InlineEditableField,
        value: string,
        display: React.ReactNode,
        className?: string,
        /**
         * The element wrapping this field opens the details itself (the full
         * card's customer name does, selectable list or not). Its click must
         * then open them too: this wrapper stops propagation to keep a
         * double click from also opening them, so without it a click on the
         * name text reached nothing and only the padding around it worked.
         */
        opensDetails: boolean = cardBodyOpensDetails,
    ): React.ReactNode => {
        if (inlineEdit.isEditing(order.id, field)) {
            return <OrderInlineEdit orderId={order.id} field={field} value={value} className={className} />;
        }
        return (
            // `contents` keeps the approved layout byte-identical: the wrapper
            // generates no box of its own, it only carries the handlers.
            <span
                className="contents"
                onClick={(e) => {
                    e.stopPropagation();
                    if (editClickTimerRef.current) clearTimeout(editClickTimerRef.current);
                    if (opensDetails) {
                        editClickTimerRef.current = setTimeout(() => onViewDetails(order), 250);
                    }
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (editClickTimerRef.current) clearTimeout(editClickTimerRef.current);
                    inlineEdit.startEdit(order.id, field);
                }}
                title={t("orders.tip.doubleClickEdit")}
            >
                {display}
            </span>
        );
    };

    // Every WhatsApp button on the card opens the chat the same way: a greeting
    // in Arabic (the customer's language) and the contact recorded.
    const openWhatsApp = (phone: string | null | undefined) => {
        if (!phone) return;
        openWhatsAppChat(phone, `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`, t, () => onContactRecorded?.(order.id));
    };

    const items = getItemsDisplay(order.items || []);
    const firstImageUrl = items[0]?.image_url;
    const thumbnailUrl = firstImageUrl && !failedImageUrls.has(firstImageUrl) ? firstImageUrl : null;
    const statusAvatarUrl = order.last_status_changed_by_avatar && !failedImageUrls.has(order.last_status_changed_by_avatar) ? order.last_status_changed_by_avatar : null;

    return { actionDock, actionsOpen, actionsRef, actualInternalNotes, actualNotes, ageUrgency, archivedOrderCount, blacklistDialogMode, blacklistDialogOpen, blacklistEntry, cardBodyOpensDetails, compact, customerOrderCount, duplicateAlert, editClickTimerRef, editable, failedImageUrls, firstImageUrl, followUp, fullAddress, getLayoutId, governorateCode, gridMode, hasDuplicates, hasRefund, hoursSinceCreated, inlineEdit, isBlacklisted, isContacted, isDelivered, isHighPriority, isLoading, isNew, isPinned, isReturn, isSelected, isShopOrder, isUrgent, isVerifiedCustomer, isVirtualized, items, language, linkedOriginalOrder, linkedRefundOrder, loadingId, localSearchQuery, markImageFailed, menuPosition, menuRef, messageTemplates, needsDiscount, needsReminder, onAddToBlacklist, onCancelWithReason, onCloneOrder, onContactRecorded, onOpenTemplatePanel, onRejectWithReason, onRemoveFromBlacklist, onScreenshot, onShowDuplicates, onSplit, onStatusUpdate, onTogglePin, onToggleReviewed, onToggleSelection, onViewDetails, openWhatsApp, order, orderAge, orderReasonInfo, orderStatusLabel, originalOrderInfo, previousOrder, primaryIsWhatsApp, returnOrderInfo, riskAssessment, riskLevel, scheduledBadgeClass, scheduledLabel, scheduledState, secondaryIsWhatsApp, setActionsOpen, setBlacklistDialogMode, setBlacklistDialogOpen, setFailedImageUrls, setMenuPosition, statusAvatarUrl, t, thumbnailUrl };
}

export type OrderCardModel = ReturnType<typeof useOrderCardModel>;
