"use client";

import { OrderPlacementBadge } from "@/components/orders/order-placement-badge";
import { AbandonedCartBadge } from "@/components/orders/abandoned-cart-badge";
import { AbandonedCartAccent } from "@/components/orders/abandoned-cart-accent";
import { CodRiskChip } from "@/components/orders/cod-risk-chip";
import { useState, useRef, useEffect, memo, useMemo } from "react";
import { createPortal } from "react-dom";
import { Order, OrderPriority, MessageTemplate } from "@/lib/supabase";
import { RiskLevel, RiskAssessment } from "@/lib/fraud-detector";
import { RiskBadge } from "@/components/orders/risk-badge";
import { DiscountBadge } from "@/components/orders/discount-badge";
import { GeminiBadge } from "@/components/orders/gemini-badge";
import { AvatarPill } from "@/components/ui/avatar-pill";

import { useOrderStore } from "@/store/use-order-store";
import { HighlightedText } from "@scheniders/ui/highlighted-text";
import { HighlightedPhone } from "./highlighted-phone";
// ... existing imports ...

import { formatIQD, generateWhatsAppLink, copyOrderToClipboard, getGuaranteeDaysRemaining, cn } from "@/lib/utils";
import { validatePhoneDetailed } from "@/lib/order-utils";
import { extractGovernorate } from "@/lib/address-validator";
import { REMINDER_DELAY_HOURS, DISCOUNT_DELAY_HOURS } from "@/lib/qstash";
import { formatShortDate, formatTime, formatScheduledDate, getOrderAge, getAgeUrgency, getScheduledState, isScheduledToday, getItemsDisplay, getFullAddress, cleanSystemNotes, getActualNotes, getOrderReasonInfo, getGovernorateCode, getStatusColor, getStatusBadgeStyle, getDropdownItemStyle, getDisplayOrderId } from "@/lib/order-format-utils";
import { useLanguage } from "@/hooks/use-language";

import { BlacklistDialog } from "@/components/orders/blacklist-dialog";
import { DuplicateAlertBanner } from "@/components/orders/duplicate-alert-banner";
import type { DuplicateWindowAlert } from "@/lib/duplicate-window";
import { isWhatsAppSlot } from "@/lib/whatsapp-contact";
import { followUpState } from "@/lib/follow-up-state";
import { FollowUpCueBadge } from "./follow-up-cue-badge";
import type { BlacklistEntry } from "@/hooks/use-order-auxiliary";

import {
    MessageCircle,
    Edit,
    XCircle,
    Ban,
    ShieldCheck,
    MapPin,
    Phone,
    Package,
    PhoneCall,
    CheckCircle,
    Truck,
    Sparkles,
    AlertTriangle,
    Calendar,
    RotateCcw,
    Flag,
    Flame,
    Clipboard,
    Store,
    FileText,
    Pin,
    Clock,
    Copy,
    CopyPlus,
    MoreVertical,
    Camera,
    PhoneOff,
    History as HistoryIcon,
    Archive as ArchiveIcon,
    ChevronDown,
    Scissors,
    ClipboardCopy,
    Bot,
    ExternalLink
} from "lucide-react";
import { motion } from "framer-motion";
import { useStatusLabel } from "@/hooks/use-status-label";
import { useOrderInlineEdit, type InlineEditableField } from "@/hooks/use-order-inline-edit";
import { OrderInlineEdit } from "@/components/orders/table/order-inline-edit";
import { AdChannelBadge } from "@/components/orders/ad-channel-badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@scheniders/ui/dropdown-menu";
import { RefundOrderChip, RefundOfLink, OriginalRefundChip } from "./refund-chips";


interface OrderCardProps {
    order: Order;
    loadingId: string | null;
    onStatusUpdate: (id: string, status: Order["status"], reason?: string) => void;
    onViewDetails: (order: Order) => void;
    isBlacklisted?: boolean;
    riskLevel?: RiskLevel;
    riskAssessment?: RiskAssessment;
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

export const OrderCard = memo(function OrderCard({
    order,
    loadingId,
    onStatusUpdate,
    onViewDetails,
    isBlacklisted,
    riskLevel,
    riskAssessment,
    customerOrderCount = 1,
    previousOrder,
    onMergeWithPrevious,
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
}: OrderCardProps) {
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
    const isReviewed = order.is_reviewed;
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
                    if (cardBodyOpensDetails) {
                        editClickTimerRef.current = setTimeout(() => onViewDetails(order), 250);
                    }
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (editClickTimerRef.current) clearTimeout(editClickTimerRef.current);
                    inlineEdit.startEdit(order.id, field);
                }}
                title="Double-click to edit"
            >
                {display}
            </span>
        );
    };


    // Priority badge styling
    const getPriorityBadge = () => {
        if (order.priority === "urgent") {
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-red-100 text-red-700 uppercase tracking-wider animate-pulse">
                    <Flame className="w-3 h-3" />
                    Urgent
                </span>
            );
        }
        if (order.priority === "high") {
            return (
                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">
                    <Flag className="w-3 h-3" />
                    High
                </span>
            );
        }
        return null;
    };

    // Source badge with icons
    const getSourceBadge = () => {
        if (!order.source) return null;

        switch (order.source) {
            case "whatsapp":
                return (
                    <span className="inline-flex h-6 items-center gap-1.5 px-2 text-[10px] font-semibold rounded-full bg-green-100 text-green-700">
                        {/* WhatsApp official logo - green circle with phone */}
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#25D366">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        WhatsApp
                    </span>
                );
            case "lightfunnels":
                return (
                    <span className="inline-flex h-6 items-center gap-1.5 px-2 text-[10px] font-semibold rounded-full bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50 text-purple-700 border border-purple-200">
                        {/* LightFunnels logo - colorful arrow shape */}
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                            <path d="M3 21L9 3L15 15L21 3" stroke="url(#lf-gradient-badge)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            <defs>
                                <linearGradient id="lf-gradient-badge" x1="3" y1="12" x2="21" y2="12" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#EC4899" />
                                    <stop offset="0.5" stopColor="#8B5CF6" />
                                    <stop offset="1" stopColor="#3B82F6" />
                                </linearGradient>
                            </defs>
                        </svg>
                        LightFunnels
                    </span>
                );
            case "meta":
                return (
                    <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-semibold rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 text-white">
                        {/* Instagram logo */}
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                        </svg>
                        Instagram
                    </span>
                );
            case "other":
                return (
                    <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                        {/* Globe icon */}
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        Other
                    </span>
                );
            case "tiktok":
                return (
                    <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-semibold rounded-full bg-gray-900 text-white">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                        </svg>
                        TikTok
                    </span>
                );
            case "shop":
                return (
                    <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-semibold rounded-full bg-[var(--pastel-yellow)] text-amber-900 border border-[var(--primary)]/30 dark:bg-[#EFFF00]/20 dark:text-[#EFFF00] dark:border-[#EFFF00]/30">
                        <Store className="w-3 h-3" />
                        طلب محل
                    </span>
                );
            default:
                return null;
        }
    };

    const items = getItemsDisplay(order.items || []);
    const firstImageUrl = items[0]?.image_url;
    const thumbnailUrl = firstImageUrl && !failedImageUrls.has(firstImageUrl) ? firstImageUrl : null;
    const statusAvatarUrl = order.last_status_changed_by_avatar && !failedImageUrls.has(order.last_status_changed_by_avatar) ? order.last_status_changed_by_avatar : null;

    const ORDER_STATUSES = [
        "new",
        "pending_checkout",
        "contacted",
        "confirmed",
        "in_transit",
        "delivered",
        "completed",
        "cancelled",
        "rejected",
        "no_response",
        "return_pending",
        "suspended"
    ] as const;

    // Map statuses to icons
    const getStatusIcon = (status: Order["status"]) => {
        switch (status) {
            case "new": return <Sparkles className="w-3 h-3" />;
            case "contacted": return <PhoneCall className="w-3 h-3" />;
            case "confirmed": return <CheckCircle className="w-3 h-3" />;
            case "in_transit": return <Truck className="w-3 h-3" />;
            case "delivered": return <CheckCircle className="w-3 h-3" />;
            case "completed": return <CheckCircle className="w-3 h-3" />;
            case "cancelled": return <Ban className="w-3 h-3" />;
            case "rejected": return <XCircle className="w-3 h-3" />;
            case "no_response": return <PhoneCall className="w-3 h-3" />;
            case "return_pending": return <RotateCcw className="w-3 h-3" />;
            default: return null;
        }
    };

    const handleInlineStatusUpdate = (newStatus: Order["status"]) => {
        if (newStatus === "cancelled" && onCancelWithReason) {
            onCancelWithReason(order);
        } else if (newStatus === "rejected" && onRejectWithReason) {
            onRejectWithReason(order);
        } else {
            onStatusUpdate(order.id, newStatus);
        }
    };

    const renderStatusBadgeWithDropdown = (triggerElement: React.ReactNode) => {
        return (
            <div onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className="cursor-pointer hover:opacity-80 hover:scale-105 active:scale-95 transition-all outline-none">
                            {triggerElement}
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[180px] p-2 space-y-1 rounded-xl bg-[var(--card-bg)] border-[var(--card-border)] shadow-xl dark:shadow-[0_10px_40px_rgba(0,0,0,0.8)] dark:border-[#333]">
                        <div className="text-xs font-semibold text-muted px-2 py-1 mb-1">تغيير حالة الطلب</div>
                        {ORDER_STATUSES.map((status) => (
                            <DropdownMenuItem
                                key={status}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleInlineStatusUpdate(status);
                                }}
                                className={cn(
                                    "flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-bold transition-colors outline-none",
                                    getDropdownItemStyle(status),
                                    order.status === status && "ring-2 ring-black/10 dark:ring-white/10"
                                )}
                            >
                                {getStatusIcon(status)}
                                {orderStatusLabel(status, isReturn)}
                                {order.status === status && <CheckCircle className="w-3.5 h-3.5 ml-auto opacity-70" />}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        );
    };

    // ── ULTRA-COMPACT GRID (Level 2 + Grid) ── Stacked mini-card ──
    if (compact === 2 && gridMode) {
        const itemsText = items.length > 0
            ? items.map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')
            : 'No products';

        return (
            <div className="group relative w-full h-full">
                <div
                    className={cn(
                        "relative bg-[var(--card-bg)] rounded-xl shadow-sm hover:shadow-md transition-all duration-200 h-full",
                        "flex flex-col",
                        "border border-[var(--card-border)]/50 overflow-hidden cursor-pointer",
                        "hover:border-[var(--secondary)] transition-colors duration-300",
                        isBlacklisted && "ring-1 ring-red-400",
                        order.is_archived && "opacity-60 grayscale-[0.5] contrast-[0.9]",
                    )}
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(order);
                    }}
                >
                    {/* Status bar top */}
                    <div className={cn("relative overflow-hidden h-1 w-full flex-shrink-0", getStatusColor(order.status, isReturn))}>
                        <AbandonedCartAccent order={order} orientation="horizontal" />
                    </div>

                    <div className="p-2.5 flex flex-col gap-1.5 flex-1 min-w-0">
                        {/* Row 1: Name + Status */}
                        <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                                "font-semibold text-sm truncate",
                                isReturn ? "text-rose-700" : "text-foreground"
                            )}>
                                {editable("customer_name", order.customer_name, <HighlightedText text={order.customer_name} query={localSearchQuery} />)}
                            </span>
                            {renderStatusBadgeWithDropdown(
                                <span className={cn(
                                    "inline-flex items-center px-1.5 py-0.5 text-[8px] font-bold rounded-full uppercase tracking-wider flex-shrink-0",
                                    getStatusBadgeStyle(order.status),
                                    isReturn && "bg-rose-100 text-rose-700"
                                )}>
                                    {orderStatusLabel(order.status, isReturn)}
                                </span>
                            )}
                        </div>

                        {/* Row 2: Order ID + Priority */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-muted flex items-center gap-1">
                                {(() => {
                                    const id = getDisplayOrderId(order.order_id);
                                    if (order.order_id?.startsWith('CHK-')) {
                                        return (
                                            <span className="flex items-center gap-1">
                                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 uppercase font-bold text-[8px]">CHK</span>
                                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                                    <HighlightedText text={id} query={localSearchQuery} />
                                                </span>
                                            </span>
                                        );
                                    }
                                    return (
                                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                            #<HighlightedText text={id} query={localSearchQuery} />
                                        </span>
                                    );
                                })()}
                            </span>
                            <OrderPlacementBadge order={order} />
                            <AbandonedCartBadge order={order} />
                            {isUrgent && <Flame className="w-3 h-3 text-red-500 animate-pulse" />}
                            {isHighPriority && !isUrgent && <Flag className="w-2.5 h-2.5 text-amber-600" />}
                            {governorateCode && (
                                <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[8px] font-bold ml-auto">
                                    {governorateCode}
                                </span>
                            )}
                        </div>

                        {/* Row 3: Items */}
                        <p className="text-xs text-foreground/60 truncate" title={itemsText}>
                            {itemsText}
                        </p>

                        {/* Row 4: Price */}
                        <div className="mt-auto pt-1">
                            {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                                <span className="text-sm font-bold text-emerald-600">واصل</span>
                            ) : (
                                <span className={cn(
                                    "text-sm font-bold tabular-nums",
                                    isReturn ? "text-red-600" : "text-foreground"
                                )}>
                                    {isReturn && "-"}
                                    {formatIQD(Math.abs(Number(order.price)))}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── SEMI-COMPACT GRID (Level 1 + Grid) ── Stacked card with more detail ──
    if (compact === 1 && gridMode) {
        const isValidPhone = validatePhoneDetailed(order.phone).isValid;
        const itemsText = items.length > 0
            ? items.map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')
            : 'No products';
        const cityDisplay = order.city || '';

        return (
            <div className="group relative w-full h-full">
                <div
                    className={cn(
                        "relative bg-[var(--card-bg)] rounded-xl shadow-sm hover:shadow-md transition-all duration-200 h-full",
                        "flex flex-col",
                        "border border-[var(--card-border)]/50 overflow-hidden",
                        "hover:border-[var(--secondary)] transition-colors duration-300",
                        isBlacklisted && "ring-1 ring-red-400",
                        !isBlacklisted && !(isReturn || order.status === 'rejected') && isUrgent && "ring-1 ring-red-300",
                        order.is_archived && "opacity-65 grayscale-[0.4] bg-gray-50/10",
                    )}
                >
                    {/* Status bar top */}
                    <div className={cn("relative overflow-hidden h-1.5 w-full flex-shrink-0", isBlacklisted ? "bg-gray-900" : getStatusColor(order.status, isReturn))}>
                        {!isBlacklisted && <AbandonedCartAccent order={order} orientation="horizontal" />}
                    </div>

                    {/* Blacklist banner */}
                    {isBlacklisted && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold">
                            <Ban className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>عميل محظور</span>
                            {blacklistEntry?.reason && (
                                <span className="font-normal opacity-70 truncate">· {blacklistEntry.reason}</span>
                            )}
                        </div>
                    )}

                    <div className="p-3 flex flex-col gap-2 flex-1 min-w-0">
                        {/* Row 1: Name + Status */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                {isPinned && <Pin className="w-3 h-3 text-blue-500 -rotate-45 flex-shrink-0" />}
                                {isNew && !isPinned && <Sparkles className="w-3 h-3 text-orange-500 flex-shrink-0" />}
                                <span className={cn(
                                    "font-semibold text-sm truncate",
                                    isReturn ? "text-rose-700" : "text-foreground"
                                )}>
                                    {editable("customer_name", order.customer_name, <HighlightedText text={order.customer_name} query={localSearchQuery} />)}
                                </span>
                            </div>
                            {renderStatusBadgeWithDropdown(
                                <span className={cn(
                                    "inline-flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider flex-shrink-0",
                                    getStatusBadgeStyle(order.status),
                                    isReturn && "bg-rose-100 text-rose-700"
                                )}>
                                    {orderStatusLabel(order.status, isReturn)}
                                </span>
                            )}
                        </div>

                        {/* Row 2: Order ID + Date */}
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="font-mono text-muted flex items-center gap-1">
                                {(() => {
                                    const id = getDisplayOrderId(order.order_id);
                                    if (order.order_id?.startsWith('CHK-')) {
                                        return (
                                            <span className="flex items-center gap-1">
                                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 uppercase font-bold text-[8.5px]">CHK</span>
                                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                                    <HighlightedText text={id} query={localSearchQuery} />
                                                </span>
                                            </span>
                                        );
                                    }
                                    return (
                                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                            #<HighlightedText text={id} query={localSearchQuery} />
                                        </span>
                                    );
                                })()}
                            </span>
                            <OrderPlacementBadge order={order} />
                            <AbandonedCartBadge order={order} />
                            <span className="text-[var(--card-border)]">·</span>
                            <span className="text-subtle">{formatShortDate(order.created_at)}</span>
                            <span className="text-subtle">{formatTime(order.created_at)}</span>
                            {order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime() && (
                                <span className="relative group/date-tag">
                                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-bold rounded">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        {t("orderDetail.dateCorrected")}
                                    </span>
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover/date-tag:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                        Was: {formatShortDate(order.original_created_at)} {formatTime(order.original_created_at)}
                                    </span>
                                </span>
                            )}
                            {scheduledState && (
                                <span
                                    className={cn("inline-flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-bold rounded", scheduledBadgeClass)}
                                    title={t("orderDetail.scheduledFor")}
                                >
                                    <Calendar className="w-2.5 h-2.5" />
                                    {scheduledLabel}
                                </span>
                            )}
                            {isUrgent && <Flame className="w-3 h-3 text-red-500 animate-pulse ml-auto" />}
                            {isHighPriority && !isUrgent && <Flag className="w-3 h-3 text-amber-600 ml-auto" />}
                        </div>

                        {/* Row 3: Items */}
                        <p className="text-xs text-foreground/70 truncate" title={itemsText}>
                            {itemsText}
                        </p>

                        {/* Row 4: City + Price */}
                        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                            {cityDisplay ? (
                                <div className="flex items-center gap-1 text-xs text-muted min-w-0">
                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{editable("city", cityDisplay, <HighlightedText text={cityDisplay} query={localSearchQuery} />)}</span>
                                    {governorateCode && (
                                        <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[8px] font-bold flex-shrink-0">
                                            {governorateCode}
                                        </span>
                                    )}
                                </div>
                            ) : <div />}

                            {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                                <span className="text-sm font-bold text-emerald-600 flex-shrink-0">واصل</span>
                            ) : (
                                <span className={cn(
                                    "text-sm font-bold tabular-nums flex-shrink-0",
                                    isReturn ? "text-red-600" : "text-foreground"
                                )}>
                                    {isReturn && "-"}
                                    {formatIQD(Math.abs(Number(order.price)))}
                                </span>
                            )}
                        </div>

                        {/* Row 5: Action Buttons */}
                        <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--card-border)]/30">
                            {/* WhatsApp */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isValidPhone) return;

                                    if (onOpenTemplatePanel && messageTemplates?.length > 0) {
                                        onOpenTemplatePanel(order);
                                    } else {
                                        try {
                                            const link = generateWhatsAppLink(
                                                order.phone,
                                                `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
                                            );
                                            const newWindow = window.open(link, "_blank");
                                            onContactRecorded?.(order.id);

                                            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                                navigator.clipboard.writeText(link).then(() => {
                                                    alert('متصفحك منع فتح النافذة المنبثقة. تم نسخ رابط واتساب إلى الحافظة!');
                                                }).catch(() => {
                                                    alert(`Popup blocked. Link: ${link}`);
                                                });
                                            }
                                        } catch (error) {
                                            alert('حدث خطأ عند فتح واتساب. يرجى التحقق من رقم الهاتف.');
                                        }
                                    }
                                }}
                                disabled={!isValidPhone}
                                className={cn(
                                    "flex-1 h-7 rounded-lg transition-all flex items-center justify-center gap-1 text-xs font-medium",
                                    isValidPhone
                                        ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:shadow-[0_0_10px_rgba(239,255,0,0.4)]"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                )}
                            >
                                <MessageCircle className="w-3 h-3" />
                            </button>

                            {/* View Details */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onViewDetails(order);
                                }}
                                className="flex-1 h-7 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all flex items-center justify-center gap-1 text-xs font-medium"
                            >
                                <Edit className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── ULTRA-COMPACT VIEW (Level 2) ── Dense single-row card showing only essentials ──
    if (compact === 2) {
        const isValidPhone = validatePhoneDetailed(order.phone).isValid;
        const itemsText = items.length > 0
            ? items.map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')
            : 'No products';
        const cityDisplay = order.city || '';

        return (
            <div
                className={cn(
                    "group relative w-full isolate",
                )}
            >
                {/* Dark mode vivid neon glow casted on the left side of the card */}
                <div className={cn("hidden dark:block absolute top-[10%] bottom-[10%] -left-0.5 w-2 blur-sm opacity-50 -z-10 transition-opacity", getStatusColor(order.status, isReturn))} />
                <div
                    className={cn(
                        "relative z-10 bg-[var(--card-bg)] rounded-xl shadow-sm hover:shadow-md transition-all duration-200",
                        "flex items-center",
                        "border border-[var(--card-border)]/50",
                        "hover:border-[var(--secondary)] transition-colors duration-300",
                        // Subtle left-border rings based on priority
                        isBlacklisted && "ring-1 ring-red-400",
                        !isBlacklisted && !(isReturn || order.status === 'rejected') && isUrgent && "ring-1 ring-red-300",
                        order.is_archived && "opacity-70 grayscale-[0.3]",
                    )}
                >
                    {/* Thin Status Accent Bar */}
                    <div
                        className={cn(
                            "w-1 self-stretch rounded-l-xl flex-shrink-0",
                            isBlacklisted ? "bg-gray-900" : getStatusColor(order.status, isReturn)
                        )}
                    />

                    {/* Selection Checkbox */}
                    {onToggleSelection && (
                        <div className="pl-2 flex items-center justify-center flex-shrink-0">
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    onToggleSelection(order.id);
                                }}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--foreground)] focus:ring-[var(--pastel-yellow)] cursor-pointer"
                            />
                        </div>
                    )}

                    {/* Main Content - Single Row */}
                    <div
                        className="flex-1 flex items-center gap-3 py-2 px-3 min-w-0 cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails(order);
                        }}
                    >
                        {/* Customer Name + Order ID */}
                        <div className="flex items-center gap-2 min-w-[130px] max-w-[220px] flex-shrink-0">
                            {isPinned && <Pin className="w-3 h-3 text-blue-500 -rotate-45 flex-shrink-0" />}
                            {isNew && !isPinned && <Sparkles className="w-3 h-3 text-orange-500 flex-shrink-0" />}
                            <span className={cn(
                                "font-semibold text-sm truncate",
                                isReturn ? "text-rose-700" : "text-foreground"
                            )}>
                                {editable("customer_name", order.customer_name, <HighlightedText text={order.customer_name} query={localSearchQuery} />)}
                            </span>
                            {isBlacklisted && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-900 text-white text-[9px] font-bold flex-shrink-0">
                                    <Ban className="w-2.5 h-2.5" />
                                    محظور
                                </span>
                            )}
                            <span className="text-xs font-mono text-muted flex-shrink-0 flex items-center gap-1">
                                {(() => {
                                    const lfMatch = order.order_id.match(/LF-(\d+)-\d+$/);
                                    const id = lfMatch ? lfMatch[1] : getDisplayOrderId(order.order_id);
                                    if (order.order_id?.startsWith('CHK-')) {
                                        return (
                                            <span className="flex items-center gap-1">
                                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 uppercase font-bold text-[8.5px]">CHK</span>
                                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                                    <HighlightedText text={id} query={localSearchQuery} />
                                                </span>
                                            </span>
                                        );
                                    }
                                    return (
                                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                            #<HighlightedText text={id} query={localSearchQuery} />
                                        </span>
                                    );
                                })()}
                            </span>
                        </div>

                        {/* Thin Divider */}
                        <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden md:block" />

                        {/* Status + Priority */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            {renderStatusBadgeWithDropdown(
                                <span className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider",
                                    getStatusBadgeStyle(order.status),
                                    isReturn && "bg-rose-100 text-rose-700"
                                )}>
                                    {orderStatusLabel(order.status, isReturn)}
                                </span>
                            )}
                            {isUrgent && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-red-100 text-red-700 animate-pulse">
                                    <Flame className="w-2.5 h-2.5" />
                                </span>
                            )}
                            {isHighPriority && !isUrgent && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-100 text-amber-700">
                                    <Flag className="w-2.5 h-2.5" />
                                </span>
                            )}
                            {duplicateAlert && (
                                <DuplicateAlertBanner alert={duplicateAlert} order={order} compact />
                            )}
                        </div>

                        {/* Thin Divider */}
                        <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden md:block" />

                        {/* Items as Text */}
                        <div className="flex-1 min-w-0 hidden md:block">
                            <span className="text-sm text-foreground/70 truncate block" title={itemsText}>
                                {itemsText}
                            </span>
                        </div>

                        {/* Thin Divider */}
                        <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden lg:block" />

                        {/* City */}
                        {cityDisplay && (
                            <div className="hidden lg:flex items-center gap-1 text-xs text-muted flex-shrink-0 max-w-[120px]">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{editable("city", cityDisplay, <HighlightedText text={cityDisplay} query={localSearchQuery} />)}</span>
                                {governorateCode && (
                                    <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[8px] font-bold flex-shrink-0">
                                        {governorateCode}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Price */}
                        <div className="flex-shrink-0 text-right min-w-[70px]">
                            {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                                <span className="text-sm font-bold text-emerald-600">واصل</span>
                            ) : (
                                <span className={cn(
                                    "text-sm font-bold tabular-nums",
                                    isReturn ? "text-red-600" : "text-foreground"
                                )}>
                                    {isReturn && "-"}
                                    {formatIQD(Math.abs(Number(order.price)))}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Compact Action Buttons */}
                    <div className="hidden md:flex items-center gap-1.5 pr-3 flex-shrink-0">
                        {/* WhatsApp */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isValidPhone) return;

                                if (onOpenTemplatePanel && messageTemplates?.length > 0) {
                                    onOpenTemplatePanel(order);
                                } else {
                                    try {
                                        const link = generateWhatsAppLink(
                                            order.phone,
                                            `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
                                        );
                                        const newWindow = window.open(link, "_blank");
                                        onContactRecorded?.(order.id);

                                        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                            navigator.clipboard.writeText(link).then(() => {
                                                alert('متصفحك منع فتح النافذة المنبثقة. تم نسخ رابط واتساب إلى الحافظة!');
                                            }).catch(() => {
                                                alert(`Popup blocked. Link: ${link}`);
                                            });
                                        }
                                    } catch (error) {
                                        alert('حدث خطأ عند فتح واتساب. يرجى التحقق من رقم الهاتف.');
                                    }
                                }
                            }}
                            disabled={!isValidPhone}
                            className={cn(
                                "w-8 h-8 rounded-lg transition-all flex items-center justify-center",
                                isValidPhone
                                    ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:shadow-[0_0_10px_rgba(239,255,0,0.4)] shadow-sm"
                                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                            )}
                            title="WhatsApp"
                        >
                            <MessageCircle className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails(order);
                            }}
                            className="w-8 h-8 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all flex items-center justify-center"
                            title="View Details"
                        >
                            <Edit className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
        <motion.div
            layoutId={getLayoutId(`order-card-${order.id}-${order.status}`)}
            className={cn(
                "group relative w-full isolate"
            )}
            transition={{
                layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
            }}
        >
            {/* External glows removed to prevent visual artifacts when scrolling under backdrop-blur sidebars/headers */}

            {/* Dark mode vivid neon glow casted on the left side of the card */}
            {compact === 0 && (
                <div
                    className={cn(
                        "hidden dark:block absolute top-[5%] bottom-[5%] -left-1 w-3 blur-md opacity-60 transition-opacity -z-10",
                        getStatusColor(order.status, isReturn),
                        !(isReturn || order.status === 'rejected') && isNew && "w-4"
                    )}
                />
            )}

            {duplicateAlert && (
                <DuplicateAlertBanner
                    alert={duplicateAlert}
                    order={order}
                    onCompare={onShowDuplicates}
                    onCancel={onCancelWithReason}
                />
            )}

            <motion.div
                layoutId={getLayoutId(`order-card-inner-${order.id}-${order.status}`)}
                className={cn(
                    "relative orders-card-surface bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-hover)] transition-all",
                    // Mobile: vertical layout, Desktop: horizontal
                    "flex flex-col md:flex-row",
                    actionsOpen ? "overflow-visible z-50" : "overflow-hidden",
                    // Priority order: blacklisted > return/rejected > urgent > shop > refunded > duplicates > new
                    isBlacklisted && "ring-2 ring-red-500",
                    !isBlacklisted && (isReturn || order.status === 'rejected') && "ring-2 ring-red-400",
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && isUrgent && "ring-2 ring-red-400",
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && !isUrgent && isShopOrder && "ring-2 ring-amber-300 bg-amber-50/30",
                    // Refunded orders - rose ring (MUST be before duplicates/new so it overrides them)
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && !isUrgent && !isShopOrder && hasRefund && "ring-2 ring-rose-300",
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && !isUrgent && !isShopOrder && !hasRefund && !hasDuplicates && isNew && "ring-2 ring-orange-300",
                    // Last in the chain: `cn` is twMerge, so these win the ring/bg
                    // conflict against every accent above except the blacklist ring.
                    !isBlacklisted && duplicateAlert && (duplicateAlert.severity === "critical"
                        ? "ring-2 ring-rose-500 bg-rose-50/60 dark:bg-rose-500/[0.07]"
                        : "ring-2 ring-amber-400 bg-amber-50/50 dark:bg-amber-500/[0.06]")
                )}
            >
                {/* Shop Order Glow */}
                {isShopOrder && !isReturn && !isBlacklisted && (
                    <div className="absolute -inset-0.5 bg-amber-200 rounded-[22px] blur-md opacity-30 group-hover:opacity-50 transition-opacity -z-10" />
                )}
                {/* Status Accent Bar */}
                <motion.div
                    layoutId={getLayoutId(`order-accent-${order.id}-${order.status}`)}
                    className={cn(
                        "relative overflow-hidden w-2 flex-shrink-0 rounded-l-[20px]",
                        getStatusColor(order.status, isReturn),
                        !(isReturn || order.status === 'rejected') && isNew && "w-3"
                    )}
                >
                    <AbandonedCartAccent order={order} orientation="vertical" />
                </motion.div>

                {/* Selection Checkbox - Positioned top-left on mobile, inline on desktop */}
                {onToggleSelection && (
                    <>
                        {/* Desktop: inline checkbox */}
                        <div className="hidden md:flex pl-3 pr-1 items-center justify-center">
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    onToggleSelection(order.id);
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-[var(--foreground)] focus:ring-[var(--pastel-yellow)] cursor-pointer"
                            />
                        </div>
                        {/* Mobile: floating checkbox button in top-left corner */}
                        <div
                            className="md:hidden absolute top-3 left-3 z-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleSelection(order.id);
                            }}
                        >
                            <div className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer",
                                isSelected
                                    ? "bg-blue-500 text-white ring-2 ring-blue-300 ring-offset-1"
                                    : "bg-white border-2 border-gray-300 hover:border-blue-400 dark:bg-[var(--ink)] dark:border-[#3a4c6e] dark:hover:border-blue-400/60"
                            )}>
                                {isSelected && (
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                        </div>
                    </>
                )}



                {/* Main Content Row */}
                <div
                    className={cn(
                        "flex-1 flex items-center gap-4 overflow-hidden cursor-pointer md:cursor-default",
                        compact === 1 ? "p-2.5" : "p-4",
                        onToggleSelection && "pl-10 md:pl-4" // Extra left padding on mobile for checkbox
                    )}
                    onClick={(e) => {
                        if (!onToggleSelection) {
                            e.stopPropagation();
                            onViewDetails(order);
                        }
                    }}
                >

                    {/* LEFT SECTION: Customer Info */}
                    <motion.div layoutId={getLayoutId(`order-customer-${order.id}-${order.status}`)} className={cn("space-y-1 flex-shrink-0", compact === 1 ? "min-w-[140px]" : "min-w-[160px]")}>
                        {/* Customer Name with sparkle for new */}
                        <motion.div
                            layoutId={getLayoutId(`order-name-${order.id}-${order.status}`)}
                            className="flex items-center gap-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded px-1 -ml-1 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails(order);
                            }}
                        >
                            {isPinned && <Pin className="w-4 h-4 text-blue-500 -rotate-45" />}
                            {isNew && !isPinned && <Sparkles className="w-4 h-4 text-orange-500 animate-pulse" />}

                            <AbandonedCartBadge order={order} />

                            {order.is_return && <RefundOrderChip />}

                            <span className={cn(
                                "font-bold tracking-tight",
                                compact === 1 ? "text-sm" : "text-base",
                                order.is_return ? "text-rose-700 dark:text-rose-400" : "text-foreground dark:text-white"
                            )}>
                                {editable("customer_name", order.customer_name, <HighlightedText text={order.customer_name} query={localSearchQuery} />)}
                            </span>



                            {!riskLevel && isBlacklisted && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-100 text-red-700" title="Blacklisted customer">
                                    <AlertTriangle className="w-3 h-3" />
                                </span>
                            )}
                        </motion.div>

                        {/* Order ID with Return indicator + Sequence Tag */}
                        <div className={cn("flex items-center gap-1.5 font-mono", isReturn ? "text-red-600" : "text-muted")}>
                            {isReturn && "↩ "}
                            {(() => {
                                // Extract base order ID from various formats:
                                // LF-5457-178 -> 5457
                                // CLN-LF-5457-178-ABC -> 5457
                                // RTN-123-1 -> 123
                                // 10033 -> 10033
                                let baseId = order.order_id;

                                // Try to extract base ID from LF-XXXX-XXX format
                                const lfMatch = order.order_id.match(/LF-(\d+)-\d+$/);
                                if (lfMatch) {
                                    baseId = lfMatch[1];
                                }
                                // Try to extract from CLN-LF-XXXX format
                                else if (order.order_id.startsWith('CLN-LF-')) {
                                    const clnMatch = order.order_id.match(/CLN-LF-(\d+)/);
                                    if (clnMatch) baseId = clnMatch[1];
                                }
                                // Try to extract from RTN-XXX-X format
                                else if (order.order_id.startsWith('RTN-')) {
                                    const rtnMatch = order.order_id.match(/RTN-(\d+)/);
                                    if (rtnMatch) baseId = rtnMatch[1];
                                }
                                // For other formats like SYYMMDD### or plain numbers, use as-is

                                return (
                                    <>
                                        <div className="flex items-center gap-1.5">
                                            {order.order_id?.startsWith('CHK-') && (
                                                <span className="px-2 py-0.5 rounded-md bg-[var(--background)] border border-[var(--card-border)] text-sm font-bold text-foreground dark:bg-black/20 dark:border-[#333] dark:text-[#00E5FF]">
                                                    CHK
                                                </span>
                                            )}
                                            <span
                                                className="px-2 py-0.5 rounded-md bg-[var(--background)] border border-[var(--card-border)] text-sm font-bold text-foreground cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:bg-black/20 dark:border-[#333] dark:text-[#00E5FF] dark:hover:bg-[#00E5FF]/10 dark:hover:text-[#00FFFF] dark:hover:border-[#00FFFF]/30 transition-colors"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    // Copy order ID to clipboard
                                                    try {
                                                        await navigator.clipboard.writeText(order.order_id);
                                                        // Visual feedback would be nice here
                                                    } catch (err) {
                                                        console.error('Failed to copy:', err);
                                                    }
                                                }}
                                                title="انقر للنسخ"
                                            >
                                                {!order.order_id?.startsWith('CHK-') && "#"}
                                                <HighlightedText text={getDisplayOrderId(baseId)} query={localSearchQuery} />
                                            </span>
                                        </div>

                                        {/* Last Status Actor Avatar */}
                                        {order.last_status_changed_by_name && (
                                            <div
                                                className="flex items-center -ml-0.5 transition-transform hover:scale-110"
                                                title={`Last updated by: ${order.last_status_changed_by_name}`}
                                            >
                                                {order.last_status_changed_by_avatar === 'bot' ? (
                                                    <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shadow-sm">
                                                        <Bot className="w-3 h-3" />
                                                    </div>
                                                ) : statusAvatarUrl ? (
                                                    <img
                                                        src={statusAvatarUrl}
                                                        alt={order.last_status_changed_by_name}
                                                        onError={() => markImageFailed(statusAvatarUrl)}
                                                        className="w-5 h-5 rounded-full border border-[var(--card-border)] bg-[var(--background)] object-cover shadow-sm"
                                                    />
                                                ) : (
                                                    <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 text-[10px] font-bold shadow-sm">
                                                        {order.last_status_changed_by_name.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {order.is_test && (
                                            <span className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shadow-lg ring-2 ring-purple-300 animate-pulse flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" />
                                                TEST
                                            </span>
                                        )}
                                        {order.sequence_number && (
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-semibold">
                                                #{order.sequence_number}
                                            </span>
                                        )}
                                        {order.delivery_order_id && (
                                            <span
                                                className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[9px] font-semibold flex items-center gap-1"
                                                title="رقم شركة التوصيل"
                                            >
                                                🚚 {order.delivery_order_id}
                                            </span>
                                        )}
                                        {/* Original Order Reference in Header - REMOVED: consolidated into tags row */}
                                        {(!order.is_return && previousOrder) && (
                                            <span
                                                className={cn(
                                                    "px-1.5 py-0.5 rounded text-[9px] font-bold border cursor-pointer transition-all flex items-center gap-1",
                                                    isVerifiedCustomer
                                                        ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200"
                                                        : "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200"
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onViewDetails(previousOrder);
                                                }}
                                                title="عرض طلب سابق"
                                            >
                                                <CopyPlus className="w-3 h-3" />
                                                طلب سابق #{previousOrder.order_id}
                                            </span>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        {/* Date & Time with Age Badge - visible in normal and semi-compact */}
                        {(
                            <div className="flex items-center gap-2 text-xs">
                                <span className="font-semibold text-subtle">{formatShortDate(order.created_at)}</span>
                                <span className="text-[var(--card-border)]">|</span>
                                <span className="font-mono text-subtle">{formatTime(order.created_at)}</span>

                                {/* Date Modified Indicator */}
                                {order.original_created_at && new Date(order.original_created_at).getTime() !== new Date(order.created_at).getTime() && (
                                    <span className="relative group/date-tag">
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-md">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                            {t("orderDetail.dateCorrected")}
                                        </span>
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover/date-tag:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                            Original: {formatShortDate(order.original_created_at)} {formatTime(order.original_created_at)}
                                        </span>
                                    </span>
                                )}

                                {/* Order Age Badge with Color Coding */}
                                <span className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all",
                                    ageUrgency === "fresh" && "bg-green-100 text-green-700",
                                    ageUrgency === "normal" && "bg-gray-100 text-gray-600",
                                    ageUrgency === "attention" && "bg-yellow-100 text-yellow-700",
                                    ageUrgency === "urgent" && "bg-orange-100 text-orange-700 animate-pulse",
                                    ageUrgency === "stale" && "bg-red-100 text-red-700 animate-pulse",
                                    ageUrgency === "scheduled" && "bg-slate-100 text-slate-600",
                                    ageUrgency === "none" && "bg-gray-100 text-gray-500"
                                )}>
                                    <Clock className="w-3 h-3" />
                                    {orderAge}
                                </span>

                                {/* Parked for a later day — not overdue work */}
                                {scheduledState && (
                                    <span
                                        className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold", scheduledBadgeClass)}
                                        title={t("orderDetail.scheduledFor")}
                                    >
                                        <Calendar className="w-3 h-3" />
                                        {scheduledLabel}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Tags Row - hidden in semi-compact */}
                        {compact === 0 && <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {/* Status Badge */}
                            {renderStatusBadgeWithDropdown(
                                <motion.span
                                    layoutId={getLayoutId(`order-status-${order.id}-${order.status}`)}
                                    className={cn(
                                        "inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full uppercase tracking-wider",
                                        getStatusBadgeStyle(order.status),
                                        isReturn && "bg-rose-100 text-rose-700 border border-rose-200"
                                    )}
                                >
                                    {isNew && <Sparkles className="w-3 h-3" />}
                                    {isReturn && <RotateCcw className="w-3 h-3" />}
                                    {orderStatusLabel(order.status, isReturn)}
                                </motion.span>
                            )}

                            {/* Delivery Company Badge */}
                            {order.delivery_company === 'waseet' && (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-semibold rounded-full bg-cyan-100 text-cyan-800 border border-cyan-300">
                                    <Truck className="w-3 h-3 flex-shrink-0" />
                                    الوسيط
                                    {order.waseet_status_text && (
                                        <span className="text-cyan-600">• {order.waseet_status_text}</span>
                                    )}
                                </span>
                            )}

                            {/* Al-Waseet QR Link */}
                            {order.waseet_qr_link && (
                                <a
                                    href={order.waseet_qr_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                    وصل الوسيط
                                </a>
                            )}

                            {/* Delivery Note - right after status badge for visibility */}
                            {order.delivery_note && (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full bg-teal-100 text-teal-800 border border-teal-300">
                                    <FileText className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate max-w-[220px]">{order.delivery_note}</span>
                                </span>
                            )}

                            {/* Detailed Risk Warning - Only show in full view */}
                            {compact === 0 && (riskLevel === 'high' || riskLevel === 'blocked' || riskLevel === 'medium') &&
                                ['new', 'contacted', 'confirmed', 'in_transit', 'return_pending'].includes(order.status) && (
                                    <>
                                        <RiskBadge level={riskLevel} assessment={riskAssessment} customerPhone={order.phone} showLabel={true} className="h-6" />



                                        {/* Dynamic History Details: Rejected vs No Response */}
                                        {((riskAssessment?.historicalData?.rejectedCustomerFaultCount ?? 0) > 0) && (
                                            <span className="inline-flex h-6 items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200">
                                                <XCircle className="w-3 h-3" />
                                                طلبات سابقة مرفوضة
                                            </span>
                                        )}
                                        {/* Previous Refund - PURPLE */}
                                        {(riskAssessment?.historicalData?.refundCount ?? 0) > 0 && (
                                            <span className="inline-flex h-6 items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                                                <RotateCcw className="w-3 h-3" />
                                                طلبات سابقة مسترجعة ({riskAssessment?.historicalData?.refundCount})
                                            </span>
                                        )}

                                        {/* No Response History - ORANGE */}
                                        {((riskAssessment?.historicalData?.noResponseCount ?? 0) > 0) && (
                                            <span className="inline-flex h-6 items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold border border-orange-200">
                                                <PhoneOff className="w-3 h-3" />
                                                لم يتم الرد سابقاً
                                            </span>
                                        )}
                                    </>
                                )}


                            {/* Archive Tag */}
                            {order.is_archived && (
                                <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-gray-200 text-gray-700 border border-gray-300">
                                    <ArchiveIcon className="w-3 h-3" />
                                    مؤرشف
                                </span>
                            )}

                            {/* Original Order Link for Returns - REMOVED: consolidated into single rose tag below */}

                            {/* Priority Badge */}
                            {getPriorityBadge()}

                            {/* Source Badge - hidden in semi-compact */}
                            {compact === 0 && getSourceBadge()}

                            {/* 7-Day Guarantee Countdown - hidden in semi-compact */}
                            {compact === 0 && order.status === 'delivered' && order.delivered_at && (() => {
                                const daysLeft = getGuaranteeDaysRemaining(order.delivered_at);
                                if (daysLeft === null) return null;

                                if (daysLeft > 5) {
                                    return (
                                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-green-100 text-green-700">
                                            ✓ {daysLeft} أيام ضمان
                                        </span>
                                    );
                                } else if (daysLeft > 2) {
                                    return (
                                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-yellow-100 text-yellow-700">
                                            ⏱ {daysLeft} أيام ضمان
                                        </span>
                                    );
                                } else if (daysLeft > 0) {
                                    return (
                                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full bg-red-100 text-red-700 animate-pulse">
                                            ⚠ {daysLeft === 1 ? 'آخر يوم!' : `${daysLeft} أيام`}
                                        </span>
                                    );
                                } else {
                                    return (
                                        <span className="inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500">
                                            انتهى الضمان
                                        </span>
                                    );
                                }
                            })()}

                            {/* Refund state of an original order - hidden in semi-compact */}
                            {compact === 0 && !isReturn && (
                                <OriginalRefundChip
                                    refundStatus={order.refund_status}
                                    onOpen={linkedRefundOrder ? () => onViewDetails(linkedRefundOrder) : undefined}
                                />
                            )}

                            {/* Which order a refund order refunds - hidden in semi-compact */}
                            {compact === 0 && isReturn && originalOrderInfo && (
                                <RefundOfLink
                                    original={{ order_id: originalOrderInfo.originalOrderId }}
                                    onOpen={linkedOriginalOrder ? () => onViewDetails(linkedOriginalOrder) : undefined}
                                />
                            )}

                            {/* Returning Customer Indicator - hidden in semi-compact */}
                            {compact === 0 && (customerOrderCount > 1 || archivedOrderCount > 0) && (
                                <span
                                    className={cn(
                                        "inline-flex h-6 items-center gap-1 px-2 text-[10px] font-medium rounded-full cursor-pointer transition-colors",
                                        isVerifiedCustomer
                                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200"
                                            : (customerOrderCount > 1 ? "bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200" : "bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200")
                                    )}
                                    title={previousOrder ? `طلب سابق: #${previousOrder.order_id}` : `${customerOrderCount + archivedOrderCount} طلبات إجمالاً (${archivedOrderCount} مؤرشف)`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onShowDuplicates) {
                                            onShowDuplicates(order);
                                        } else if (previousOrder) {
                                            onViewDetails(previousOrder);
                                        }
                                    }}
                                >
                                    {archivedOrderCount > 0 && customerOrderCount === 1 ? (
                                        <>
                                            <HistoryIcon className="w-3 h-3" />
                                            زبون تاريخي ({archivedOrderCount})
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3 h-3" />
                                            {customerOrderCount + archivedOrderCount} طلبات
                                            {archivedOrderCount > 0 && <span className="opacity-70 text-[8px] mr-1">({archivedOrderCount} أرشفة)</span>}
                                        </>
                                    )}
                                </span>
                            )}

                            {/* Duplicate Reference Tag - Shows original order ID */}

                        </div>}
                    </motion.div>

                    {/* DIVIDER */}
                    <div className="w-px h-16 bg-[var(--card-border)] hidden md:block flex-shrink-0 dark:bg-white/5" />

                    {/* CENTER SECTION: Product, Phone, Address */}
                    <div className="flex-1 min-w-0 space-y-2 hidden md:block overflow-hidden">
                        {/* Product Row */}
                        <div className="flex items-center gap-3">
                            {/* Product Thumbnail - hidden in semi-compact */}
                            {compact === 0 && (thumbnailUrl ? (
                                <img
                                    src={thumbnailUrl}
                                    alt={items[0].name}
                                    onError={() => markImageFailed(thumbnailUrl)}
                                    className="w-12 h-12 rounded-xl object-cover border border-[var(--card-border)] flex-shrink-0 dark:border-white/10 dark:shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                                />
                            ) : (
                                <div className={cn(
                                    "w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 dark:shadow-[0_0_10px_rgba(255,255,255,0.05)]",
                                    isNew
                                        ? "bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/20"
                                        : "bg-[var(--background)] border-[var(--card-border)] dark:bg-[#1E1E1E] dark:border-white/10"
                                )}>
                                    <Package className={cn("w-5 h-5", isNew ? "text-orange-600 dark:text-orange-400" : "text-muted dark:text-white/40")} />
                                </div>
                            ))}

                            {/* Product Names */}
                            <div className="flex-1 min-w-0">
                                {items.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {items.map((item, idx) => {
                                            // Only color quantity badge if > 1
                                            const quantityColor = item.quantity === 1
                                                ? 'bg-[var(--background)] text-muted border-[var(--card-border)]'
                                                : item.quantity === 2
                                                    ? 'bg-orange-100 text-orange-700 border-orange-300'
                                                    : 'bg-rose-100 text-rose-700 border-rose-300';

                                            return (
                                                <span
                                                    key={idx}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium text-foreground bg-[var(--background)] border-l-[3px] dark:bg-gradient-to-r dark:from-white/5 dark:to-transparent"
                                                    style={{
                                                        borderLeftColor: item.tag_color || '#22c55e'
                                                    }}
                                                >
                                                    {item.name}
                                                    <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold border ${quantityColor}`}>
                                                        ×{item.quantity}
                                                    </span>
                                                    {item.is_ai_extracted && <GeminiBadge />}
                                                    {(item as { is_open_box?: boolean }).is_open_box && (
                                                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                                            علبة مفتوحة
                                                        </span>
                                                    )}
                                                    {/* Reason Tag - shows for return, rejected, cancelled orders */}
                                                    {orderReasonInfo?.reason && idx === 0 && (
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                                                            ['return', 'rejected', 'cancelled'].includes(orderReasonInfo.type || '') && "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
                                                            orderReasonInfo.type === 'no_response' && "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
                                                            !['return', 'rejected', 'cancelled', 'no_response'].includes(orderReasonInfo.type || '') && "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20"
                                                        )}>
                                                            {orderReasonInfo.reason}
                                                        </span>
                                                    )}
                                                </span>
                                            );
                                        })}
                                        {/* Review Required Tag - Next to items */}
                                        {(riskLevel === 'high' || riskLevel === 'blocked') &&
                                            ['new', 'contacted', 'confirmed'].includes(order.status) && (
                                                <span className="inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-red-100 text-red-700 animate-pulse border border-red-200 dark:bg-red-500/10 dark:text-rose-400 dark:border-red-500/20">
                                                    Review Required
                                                </span>
                                            )}
                                        {/* Review Duplicate Order Tag - Next to items */}
                                        {hasDuplicates && !isVerifiedCustomer &&
                                            ['new', 'contacted', 'confirmed'].includes(order.status) && (
                                                <span className="inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-orange-100 text-orange-700 animate-pulse border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20">
                                                    Review Required
                                                </span>
                                            )}
                                        {/* Delivery Attention Flag - prominent, next to items like Review Required */}
                                        {order.needs_attention && order.attention_reasons?.some(r => r.startsWith('delivery_')) && (
                                            <span className="inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-amber-100 text-amber-700 animate-pulse border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                {order.attention_reasons!.includes('delivery_price_changed') ? 'سعر معدّل' :
                                                    order.attention_reasons!.includes('delivery_force_delivered') ? 'تسليم إجباري' :
                                                        order.attention_reasons!.includes('delivery_amount_mismatch') ? 'فرق بالمبلغ' :
                                                            order.attention_reasons!.includes('delivery_phone_mismatch') ? 'فرق بالرقم' :
                                                                order.attention_reasons!.includes('delivery_already_delivered') ? 'مسلّم مسبقاً' :
                                                                    order.attention_reasons!.includes('delivery_wrong_status') ? 'حالة خاطئة' :
                                                                        order.attention_reasons!.includes('delivery_partial_delivery') ? 'تسليم جزئي' :
                                                                            'مراجعة توصيل'}
                                            </span>
                                        )}
                                        {/* COD risk signals stamped by the storefront at checkout (cod_risk_signals) */}
                                        <CodRiskChip
                                            variant="card"
                                            needsAttention={order.needs_attention}
                                            attentionReasons={order.attention_reasons}
                                        />
                                        {/* WhatsApp Attention Flag - shows when message sending failed */}
                                        {order.needs_attention && order.attention_reasons?.some(r => r.startsWith('whatsapp_')) && (
                                            <span className="inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-red-100 text-red-700 animate-pulse border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20" title={order.delivery_note || 'فشل إرسال واتساب'}>
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                {order.attention_reasons!.includes('whatsapp_wallet_empty') ? 'رصيد واتساب منتهي' :
                                                    order.attention_reasons!.includes('whatsapp_invalid_number') ? 'رقم غير صالح' :
                                                    order.attention_reasons!.includes('whatsapp_rate_limited') ? 'حد الإرسال' :
                                                        order.attention_reasons!.includes('whatsapp_network_error') ? 'خطأ شبكة' :
                                                            order.attention_reasons!.includes('whatsapp_config_error') ? 'خطأ إعداد' :
                                                                'فشل واتساب'}
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-sm text-muted">No products</span>
                                )}
                            </div>
                        </div>

                        {/* Phone & Address Row - Desktop only */}
                        <div className="hidden md:flex items-center gap-4 text-sm overflow-hidden">
                            {/* Primary Phone */}
                            <div className="flex items-center gap-1.5 text-foreground">
                                {/* Validation indicator */}
                                {!validatePhoneDetailed(order.phone).isValid && (
                                    <span className="relative flex h-2.5 w-2.5" title={validatePhoneDetailed(order.phone).errorMessageAr}>
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                    </span>
                                )}
                                {primaryIsWhatsApp ? (
                                    <MessageCircle className="w-3.5 h-3.5 text-emerald-500" aria-label={t("orders.phone.whatsappLine")} />
                                ) : (
                                    <Phone className="w-3.5 h-3.5 text-muted" />
                                )}
                                <span className={cn(
                                    "font-mono text-sm",
                                    !validatePhoneDetailed(order.phone).isValid && "text-red-600 dark:text-rose-400",
                                    hasDuplicates && !isVerifiedCustomer && "text-orange-600 font-semibold dark:text-orange-400",
                                    hasDuplicates && isVerifiedCustomer && "text-emerald-600 font-semibold dark:text-emerald-400",
                                    !(!validatePhoneDetailed(order.phone).isValid) && !(hasDuplicates) && "dark:text-[#D4D4D4]",
                                    // The stated contact line wins the colour: it is the number to dial.
                                    primaryIsWhatsApp && validatePhoneDetailed(order.phone).isValid && "text-emerald-600 font-semibold dark:text-emerald-400"
                                )}>
                                    {editable("phone", order.phone || "", <HighlightedPhone phone={order.phone} query={localSearchQuery} />, "font-mono")}
                                </span>
                                {/* Duplicate/Returning customer icon next to phone */}
                                {hasDuplicates && (
                                    <ClipboardCopy className={cn(
                                        "w-3.5 h-3.5",
                                        isVerifiedCustomer ? "text-emerald-500" : "text-orange-500"
                                    )} />
                                )}
                            </div>

                            {/* Secondary Phone */}
                            {order.secondary_phone && (
                                <>
                                    <span className="text-[var(--card-border)]">|</span>
                                    <div className="flex items-center gap-1.5 text-foreground">
                                        {/* Validation indicator */}
                                        {!validatePhoneDetailed(order.secondary_phone).isValid && (
                                            <span className="relative flex h-2.5 w-2.5" title={validatePhoneDetailed(order.secondary_phone).errorMessageAr}>
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                            </span>
                                        )}
                                        {secondaryIsWhatsApp ? (
                                            <MessageCircle className="w-3.5 h-3.5 text-emerald-500" aria-label={t("orders.phone.whatsappLine")} />
                                        ) : (
                                            <Phone className="w-3.5 h-3.5 text-muted" />
                                        )}
                                        <span className={cn(
                                            "font-mono text-sm",
                                            !validatePhoneDetailed(order.secondary_phone).isValid && "text-red-600",
                                            secondaryIsWhatsApp && validatePhoneDetailed(order.secondary_phone).isValid && "text-emerald-600 font-semibold dark:text-emerald-400"
                                        )}>
                                            <HighlightedPhone phone={order.secondary_phone} query={localSearchQuery} />
                                        </span>
                                    </div>
                                </>
                            )}

                            {/* Divider */}
                            {fullAddress && (
                                <>
                                    <span className="text-[var(--card-border)]">|</span>
                                    {/* Address */}
                                    <div className="flex items-center gap-1.5 text-muted flex-1 min-w-0">
                                        {/* Only show warning if address_details is empty */}
                                        {(!order.address_details || order.address_details.trim() === '') && (
                                            <span
                                                className="relative flex h-2.5 w-2.5 flex-shrink-0"
                                                title="لا يوجد تفاصيل عنوان"
                                            >
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
                                            </span>
                                        )}
                                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span className="truncate text-right" title={fullAddress}>{editable("address_details", order.address_details || "", <HighlightedText text={fullAddress} query={localSearchQuery} />)}</span>
                                        {/* Show governorate code - computed from stored value or extracted from city */}
                                        {governorateCode && (
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-semibold flex-shrink-0">
                                                {governorateCode}
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Notes Row - Order Notes (amber) and Internal Notes (blue) - hidden in semi-compact and for abandoned orders */}
                        {compact === 0 && order.status !== "pending_checkout" && (
                            <div className="flex flex-wrap gap-2">
                                {actualNotes && (
                                    <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 max-w-full overflow-hidden border border-amber-200">
                                        <FileText className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate" title={actualNotes}>{actualNotes}</span>
                                    </div>
                                )}
                                {actualInternalNotes && (
                                    <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 rounded-lg px-2 py-1 max-w-full overflow-hidden border border-blue-200">
                                        <FileText className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate" title={actualInternalNotes}>{actualInternalNotes}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* PRICE SECTION - Hidden on mobile (shown at bottom instead) */}
                    <motion.div layoutId={getLayoutId(`order-price-${order.id}-${order.status}`)} className="hidden md:block text-right min-w-[100px] flex-shrink-0">
                        {/* Which ad brought this order in — `source` only says LightFunnels. */}
                        {(order.attribution || order.ad_channel) && (
                            <div className="mb-1 flex justify-end">
                                <AdChannelBadge attribution={order.attribution} channel={order.ad_channel} />
                            </div>
                        )}
                        {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                            <>
                                <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5 dark:text-[#A1A1A1]">المبلغ الإجمالي</p>
                                <p className="text-lg font-bold text-emerald-600 dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]">
                                    واصل
                                </p>
                                <p className="text-xs text-muted font-mono dark:text-[#A1A1A1]">
                                    {formatIQD(Math.abs(Number(order.price)))}
                                </p>
                            </>
                        ) : (
                            <div className="flex flex-col items-end">
                                <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5 dark:text-[#A1A1A1]">المبلغ الإجمالي</p>
                                {order.discount_amount ? (
                                    <>
                                        <span className="text-xs text-muted line-through decoration-red-400 decoration-2 font-mono mb-0.5">
                                            {formatIQD(Math.abs(Number(order.price)) + order.discount_amount)}
                                        </span>
                                        <p className={cn(
                                            "text-xl font-bold tracking-tight tabular-nums",
                                            isReturn ? "text-red-600 dark:text-rose-400" : "text-foreground dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]"
                                        )}>
                                            {isReturn && "-"}
                                            {formatIQD(Math.abs(Number(order.price)))}
                                        </p>
                                        <div className="mt-1">
                                            <DiscountBadge
                                                price={Number(order.price)}
                                                discountAmount={order.discount_amount}
                                                className="scale-90 origin-right"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <p className={cn(
                                        "text-xl font-bold tracking-tight tabular-nums",
                                        isReturn ? "text-red-600 dark:text-rose-400" : "text-foreground dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]"
                                    )}>
                                        {isReturn && "-"}
                                        {formatIQD(Math.abs(Number(order.price)))}
                                    </p>
                                )}
                                {isReturn && orderReasonInfo && orderReasonInfo.deliveryDeduction > 0 && (
                                    <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                        <Truck className="w-2.5 h-2.5" />
                                        خصم توصيل: {formatIQD(orderReasonInfo.deliveryDeduction)}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>

                    {/* MOBILE SECTION: Phone, Address & Price - shows below main content on mobile */}
                    <div className="md:hidden space-y-3 px-4 pb-4">
                        {/* Top row: Phone & Price */}
                        <div className="flex items-center justify-between gap-3">
                            {/* Phone buttons - left aligned */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Primary Phone - WhatsApp button */}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!validatePhoneDetailed(order.phone).isValid) return;

                                        try {
                                            const link = generateWhatsAppLink(order.phone, `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`);
                                            const newWindow = window.open(link, "_blank");
                                            onContactRecorded?.(order.id);

                                            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                                navigator.clipboard.writeText(link).then(() => {
                                                    alert('متصفحك منع فتح النافذة المنبثقة. تم نسخ رابط واتساب إلى الحافظة!');
                                                }).catch(() => {
                                                    alert(`Popup blocked. Link: ${link}`);
                                                });
                                            }
                                        } catch (error) {
                                            alert('حدث خطأ عند فتح واتساب. يرجى التحقق من رقم الهاتف.');
                                        }
                                    }}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all active:scale-95 shadow-sm",
                                        validatePhoneDetailed(order.phone).isValid
                                            ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-green-200 dark:shadow-none dark:bg-none dark:bg-[rgba(0,255,100,0.15)] dark:text-[#00FFAA]"
                                            : "bg-red-100 text-red-600 border border-red-200 dark:bg-red-500/10 dark:text-rose-400 dark:border-red-500/20"
                                    )}
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    <span className="font-mono text-sm font-semibold tracking-wide">
                                        {editable("phone", order.phone || "", <HighlightedPhone phone={order.phone} query={localSearchQuery} />, "font-mono")}
                                    </span>
                                </button>

                                {/* Secondary Phone */}
                                {order.secondary_phone && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!validatePhoneDetailed(order.secondary_phone!).isValid) return;

                                            try {
                                                const link = generateWhatsAppLink(order.secondary_phone!, `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`);
                                                const newWindow = window.open(link, "_blank");
                                                onContactRecorded?.(order.id);

                                                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                                    navigator.clipboard.writeText(link).then(() => {
                                                        alert('متصفحك منع فتح النافذة المنبثقة. تم نسخ رابط واتساب إلى الحافظة!');
                                                    }).catch(() => {
                                                        alert(`Popup blocked. Link: ${link}`);
                                                    });
                                                }
                                            } catch (error) {
                                                alert('حدث خطأ عند فتح واتساب.');
                                            }
                                        }}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2.5 py-2 rounded-xl transition-all active:scale-95",
                                            !validatePhoneDetailed(order.secondary_phone).isValid
                                                ? "bg-red-50 text-red-600 border border-red-200"
                                                : secondaryIsWhatsApp
                                                    // The stated WhatsApp line gets the primary button's green
                                                    // weight, so it does not read as a fallback.
                                                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-sm shadow-green-200 dark:shadow-none dark:bg-none dark:bg-[rgba(0,255,100,0.15)] dark:text-[#00FFAA]"
                                                    : "bg-gray-100 text-gray-700 border border-gray-200"
                                        )}
                                    >
                                        {secondaryIsWhatsApp ? <MessageCircle className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                                        <span className="font-mono text-xs">
                                            <HighlightedPhone phone={order.secondary_phone} query={localSearchQuery} />
                                        </span>
                                    </button>
                                )}
                            </div>

                            {/* Price - right aligned, prominent */}
                            <div className="flex-shrink-0 text-right">
                                {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]">المبلغ الإجمالي</span>
                                        <span className="text-lg font-bold text-emerald-600 dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]">واصل</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-muted uppercase tracking-wider dark:text-[#A1A1A1]">المبلغ الإجمالي</span>

                                        {order.discount_amount ? (
                                            <>
                                                <span className="text-xs text-muted line-through decoration-red-400 decoration-2 font-mono mb-0.5">
                                                    {formatIQD(Math.abs(Number(order.price)) + order.discount_amount)}
                                                </span>
                                                <span className={cn(
                                                    "text-xl font-bold tabular-nums",
                                                    isReturn ? "text-red-600 dark:text-rose-400" : "text-foreground dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]"
                                                )}>
                                                    {isReturn && "-"}
                                                    {formatIQD(Math.abs(Number(order.price)))}
                                                </span>
                                                <div className="mt-1">
                                                    <DiscountBadge
                                                        price={Number(order.price)}
                                                        discountAmount={order.discount_amount}
                                                        className="scale-90 origin-right"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <span className={cn(
                                                "text-xl font-bold tabular-nums",
                                                isReturn ? "text-red-600" : "text-foreground"
                                            )}>
                                                {isReturn && "-"}
                                                {formatIQD(Math.abs(Number(order.price)))}
                                            </span>
                                        )}
                                        {isReturn && orderReasonInfo && orderReasonInfo.deliveryDeduction > 0 && (
                                            <div className="flex items-center gap-1 mt-1 text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                                خصم توصيل: {formatIQD(orderReasonInfo.deliveryDeduction)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Address row */}
                        {fullAddress && (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50/80 border border-gray-100 dark:bg-[#1A1A1A] dark:border-white/5">
                                <MapPin className="w-4 h-4 text-gray-400 dark:text-[var(--foreground-subtle)] flex-shrink-0" />
                                <span className="text-sm text-gray-600 dark:text-[var(--foreground-muted)] truncate flex-1 text-right">{editable("address_details", order.address_details || "", <HighlightedText text={fullAddress} query={localSearchQuery} />)}</span>
                                {governorateCode && (
                                    <span className="px-2 py-1 rounded-lg bg-emerald-500 text-white text-[11px] font-bold flex-shrink-0 shadow-sm">
                                        {governorateCode}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* REVIEW INDICATOR - Only for delivered orders */}
                    {isDelivered && onToggleReviewed && (
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleReviewed(order.id);
                                }}
                                className={cn(
                                    "w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center",
                                    isReviewed
                                        ? "bg-cyan-500 border-cyan-600 shadow-lg shadow-cyan-500/50"
                                        : "bg-white border-gray-300 hover:border-cyan-400 hover:shadow-sm"
                                )}
                                title={isReviewed ? "تم المراجعة - انقر لإلغاء" : "انقر للتأشير كمراجَع"}
                            >
                                {isReviewed && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    )}

                    {/* DIVIDER - Desktop only */}
                    <div className="w-px h-16 bg-[var(--card-border)] flex-shrink-0 hidden md:block dark:bg-white/5" />

                    {/* ACTION BUTTONS - Desktop only */}
                    <div className={cn(
                        "hidden md:flex flex-shrink-0 items-center",
                        actionDock
                            ? "bg-black/5 dark:bg-[#1A1A1A] p-1 gap-1 flex-row rounded-2xl border border-black/5 dark:border-white/5 shadow-inner"
                            : "gap-2"
                    )}>
                        {/* Follow-up cue badge */}
                        {followUp && (
                            <FollowUpCueBadge
                                state={followUp}
                                hoursSinceCreated={Math.floor(hoursSinceCreated)}
                            />
                        )}

                        {/* Chat Button - Primary with Contact Stage Indicator */}
                        {(() => {
                            const contactCount = order.contact_count || 0;
                            const isValidPhone = validatePhoneDetailed(order.phone).isValid;

                            // Dynamic styling based on contact count
                            const getButtonStyle = () => {
                                if (!isValidPhone) return "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none";
                                switch (contactCount) {
                                    case 0: return "bg-[var(--primary)] text-[var(--primary-fg)] hover:shadow-[0_0_10px_rgba(239,255,0,0.4)] shadow-[0_0_10px_rgba(239,255,0,0.2)] font-bold dark:bg-[rgba(239,255,0,0.1)] dark:text-[#EFFF00] dark:shadow-[0_0_10px_rgba(239,255,0,0.1)] dark:hover:shadow-[0_0_15px_rgba(239,255,0,0.3)] dark:hover:bg-[rgba(239,255,0,0.15)]"; // Neon - New
                                    case 1: return "bg-yellow-500 text-white hover:bg-yellow-600 shadow-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-400 dark:shadow-none"; // Yellow - Contacted once
                                    case 2: return "bg-orange-500 text-white hover:bg-orange-600 shadow-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400 dark:shadow-none"; // Orange - Contacted twice
                                    default: return "bg-red-500 text-white hover:bg-red-600 shadow-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:shadow-none"; // Red - Multiple contacts
                                }
                            };

                            const getBadgeStyle = () => {
                                switch (contactCount) {
                                    case 0: return "bg-white text-green-600 border-green-200 dark:bg-[#1E1E1E] dark:text-[#EFFF00] dark:border-[rgba(239,255,0,0.3)]";
                                    case 1: return "bg-white text-yellow-600 border-yellow-200 dark:bg-[#1E1E1E] dark:text-yellow-400 dark:border-yellow-500/30";
                                    case 2: return "bg-white text-orange-600 border-orange-200 dark:bg-[#1E1E1E] dark:text-orange-400 dark:border-orange-500/30";
                                    default: return "bg-white text-red-600 border-red-200 dark:bg-[#1E1E1E] dark:text-red-400 dark:border-red-500/30";
                                }
                            };

                            const getTitle = () => {
                                if (!isValidPhone) return validatePhoneDetailed(order.phone).errorMessageAr;
                                switch (contactCount) {
                                    case 0: return "WhatsApp - لم يتم التواصل بعد";
                                    case 1: return "WhatsApp - تم التواصل مرة واحدة";
                                    case 2: return "WhatsApp - تم التواصل مرتين";
                                    default: return `WhatsApp - تم التواصل ${contactCount} مرات`;
                                }
                            };

                            return (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isValidPhone) return;

                                        if (onOpenTemplatePanel && messageTemplates?.length > 0) {
                                            onOpenTemplatePanel(order);
                                        } else {
                                            try {
                                                const link = generateWhatsAppLink(
                                                    order.phone,
                                                    `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
                                                );
                                                const newWindow = window.open(link, "_blank");
                                                onContactRecorded?.(order.id);

                                                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                                    navigator.clipboard.writeText(link).then(() => {
                                                        alert('متصفحك منع فتح النافذة المنبثقة. تم نسخ رابط واتساب إلى الحافظة!');
                                                    }).catch(() => {
                                                        alert(`Popup blocked. Link: ${link}`);
                                                    });
                                                }
                                            } catch (error) {
                                                alert('حدث خطأ عند فتح واتساب. يرجى التحقق من رقم الهاتف.');
                                            }
                                        }
                                    }}
                                    disabled={!isValidPhone}
                                    className={cn(
                                        "w-10 h-10 transition-all flex items-center justify-center relative",
                                        actionDock ? "rounded-xl shadow-none" : "rounded-xl shadow-md",
                                        getButtonStyle()
                                    )}
                                    title={getTitle()}
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    <span className={cn(
                                        "absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm border",
                                        getBadgeStyle()
                                    )}>
                                        {contactCount > 0 ? (contactCount > 9 ? "9+" : contactCount) : ""}
                                    </span>
                                </button>
                            );
                        })()}

                        {/* Chat Button - Secondary Phone */}
                        {order.secondary_phone && validatePhoneDetailed(order.secondary_phone).isValid && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    try {
                                        const link = generateWhatsAppLink(
                                            order.secondary_phone!,
                                            `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id}`
                                        );
                                        const newWindow = window.open(link, "_blank");
                                        onContactRecorded?.(order.id);

                                        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                            navigator.clipboard.writeText(link).then(() => {
                                                alert('متصفحك منع فتح النافذة المنبثقة. تم نسخ رابط واتساب إلى الحافظة!');
                                            }).catch(() => {
                                                alert(`Popup blocked. Link: ${link}`);
                                            });
                                        }
                                    } catch (error) {
                                        alert('حدث خطأ عند فتح واتساب.');
                                    }
                                }}
                                className={cn(
                                    "w-10 h-10 bg-emerald-500 text-white hover:bg-emerald-600 transition-all flex items-center justify-center relative dark:bg-[rgba(0,255,100,0.15)] dark:text-[#00FFAA] dark:hover:bg-[rgba(0,255,100,0.25)]",
                                    actionDock ? "rounded-xl shadow-none" : "rounded-xl shadow-md shadow-emerald-500/20 dark:shadow-none"
                                )}
                                title="Chat on WhatsApp (Secondary)"
                            >
                                <MessageCircle className="w-4 h-4" />
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full text-[10px] font-bold text-emerald-600 flex items-center justify-center shadow-sm border border-emerald-200 dark:bg-[#1E1E1E] dark:border-[rgba(0,255,100,0.3)] dark:text-[#00FFAA]">
                                    {(order.contact_count || 0) > 0 ? ((order.contact_count || 0) > 9 ? "9+" : order.contact_count) : ""}
                                </span>
                            </button>
                        )}

                        {/* Edit Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewDetails(order);
                            }}
                            className={cn(
                                "w-10 h-10 flex items-center justify-center transition-all bg-[var(--background)] text-foreground hover:bg-[var(--card-border)] dark:text-[#A1A1A1] dark:hover:text-white dark:hover:bg-white/5",
                                actionDock
                                    ? "rounded-xl border-transparent bg-transparent dark:bg-transparent dark:border-transparent"
                                    : "rounded-xl border border-[var(--card-border)] dark:bg-black/20 dark:border-white/5 dark:hover:border-white/20"
                            )}
                            title="Edit Order"
                        >
                            <Edit className="w-4 h-4" />
                        </button>



                        {/* More Actions Dropdown - hidden in semi-compact */}
                        {compact === 0 && <div ref={actionsRef} className={cn("relative", actionsOpen && "z-50")}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (actionsOpen) {
                                        setActionsOpen(false);
                                        return;
                                    }
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMenuPosition({
                                        top: rect.bottom + 8,
                                        right: window.innerWidth - rect.right
                                    });
                                    setActionsOpen(true);
                                }}
                                className={cn(
                                    "w-10 h-10 transition-all flex items-center justify-center",
                                    actionDock ? "rounded-xl border-transparent" : "rounded-xl border",
                                    actionsOpen
                                        ? (actionDock ? "bg-black/5 text-gray-700 dark:bg-white/10 dark:text-white" : "bg-gray-100 border-gray-300 text-gray-700 dark:bg-white/10 dark:border-white/20 dark:text-white")
                                        : (actionDock ? "bg-transparent text-muted hover:bg-black/5 dark:text-[#A1A1A1] dark:hover:text-white dark:hover:bg-white/5" : "bg-[var(--background)] border-[var(--card-border)] text-muted hover:bg-[var(--card-border)] dark:bg-black/20 dark:border-white/5 dark:text-[#A1A1A1] dark:hover:text-white dark:hover:border-white/20 dark:hover:bg-white/5")
                                )}
                                title="More Actions"
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu - Portal to body to avoid clipping */}
                            {actionsOpen && menuPosition && typeof document !== 'undefined' && createPortal(
                                <div
                                    ref={menuRef}
                                    style={{
                                        position: 'fixed',
                                        top: menuPosition.top,
                                        right: menuPosition.right,
                                        zIndex: 9999
                                    }}
                                    className="bg-[var(--card-bg)] rounded-2xl shadow-lg border border-[var(--card-border)] py-2 min-w-[140px] dark:shadow-[0_10px_40px_rgba(0,0,0,0.8)] dark:border-[#333]"
                                >
                                    {/* Copy */}
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            await copyOrderToClipboard(order);
                                            setActionsOpen(false);
                                        }}
                                        className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-foreground hover:bg-[var(--pastel-green-dark)]/30 transition-colors"
                                    >
                                        <div className="w-7 h-7 rounded-lg bg-[var(--pastel-green)] flex items-center justify-center">
                                            <Copy className="w-3.5 h-3.5 text-green-700" />
                                        </div>
                                        <span className="font-medium">Copy</span>
                                    </button>

                                    <div className="my-1 mx-3 border-t border-[var(--card-border)]" />

                                    {/* Pin */}
                                    {onTogglePin && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onTogglePin(order.id);
                                                setActionsOpen(false);
                                            }}
                                            className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-foreground hover:bg-[var(--pastel-blue)]/30 transition-colors"
                                        >
                                            <div className={cn(
                                                "w-7 h-7 rounded-lg flex items-center justify-center",
                                                isPinned ? "bg-blue-100" : "bg-[var(--pastel-blue)]"
                                            )}>
                                                <Pin className={cn("w-3.5 h-3.5", isPinned ? "text-blue-600 -rotate-45" : "text-blue-700")} />
                                            </div>
                                            <span className="font-medium">{isPinned ? "Unpin" : "Pin"}</span>
                                        </button>
                                    )}

                                    <div className="my-1 mx-3 border-t border-[var(--card-border)]" />

                                    {/* Clone */}
                                    {onCloneOrder && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onCloneOrder(order.id);
                                                setActionsOpen(false);
                                            }}
                                            className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-foreground hover:bg-purple-100/50 transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                                                <CopyPlus className="w-3.5 h-3.5 text-purple-600" />
                                            </div>
                                            <span className="font-medium">Clone</span>
                                        </button>
                                    )}

                                    <div className="my-1 mx-3 border-t border-[var(--card-border)]" />

                                    {/* Screenshot */}
                                    {onScreenshot && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onScreenshot(order);
                                                setActionsOpen(false);
                                            }}
                                            className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-foreground hover:bg-violet-100/50 transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                                                <Camera className="w-3.5 h-3.5 text-violet-600" />
                                            </div>
                                            <span className="font-medium">Share</span>
                                        </button>
                                    )}

                                    {/* Blacklist toggle */}
                                    {(isBlacklisted ? onRemoveFromBlacklist : onAddToBlacklist) && (
                                        <>
                                            <div className="my-1 mx-3 border-t border-[var(--card-border)]" />
                                            {isBlacklisted ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setBlacklistDialogMode("remove");
                                                        setBlacklistDialogOpen(true);
                                                        setActionsOpen(false);
                                                    }}
                                                    className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-emerald-700 hover:bg-emerald-50/70 transition-colors"
                                                >
                                                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                    </div>
                                                    <span className="font-medium">{t("orderDetail.unblacklist")}</span>
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setBlacklistDialogMode("add");
                                                        setBlacklistDialogOpen(true);
                                                        setActionsOpen(false);
                                                    }}
                                                    className="w-full px-3 py-2 flex items-center gap-2.5 text-sm text-red-700 hover:bg-red-50/70 transition-colors"
                                                >
                                                    <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                                                        <Ban className="w-3.5 h-3.5 text-red-600" />
                                                    </div>
                                                    <span className="font-medium">{t("orderDetail.addBlacklist")}</span>
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>,

                                document.body
                            )}
                        </div>}

                        {/* Split Order Button - Only for confirmed/in_transit with multiple items */}
                        {onSplit && (order.status === 'confirmed' || order.status === 'in_transit') && (order.items && order.items.length > 1) && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSplit(order);
                                }}
                                className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 transition-all flex items-center justify-center"
                                title="Split Order"
                            >
                                <Scissors className="w-4 h-4" />
                            </button>
                        )}

                        {/* Undo Status Button - Only for terminal/advanced statuses */}
                        {["delivered", "completed", "rejected", "cancelled", "no_response", "return_pending"].includes(order.status) && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    let prevStatus: Order["status"] = "in_transit";
                                    if (order.status === "cancelled" || order.status === "no_response") {
                                        prevStatus = "contacted";
                                    } else if (order.status === "return_pending") {
                                        prevStatus = "delivered";
                                    }
                                    onStatusUpdate(order.id, prevStatus);
                                }}
                                disabled={isLoading}
                                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-all flex items-center justify-center disabled:opacity-50 dark:bg-white/10 dark:border-white/20 dark:text-[#A1A1A1] dark:hover:text-white dark:hover:bg-white/20"
                                title="تراجع - Undo Status Change"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        )}

                        {/* Quick Status Actions */}
                        {order.status !== "completed" && order.status !== "rejected" && order.status !== "cancelled" && order.status !== "no_response" && (
                            <>
                                {/* Contacted - Pastel Yellow */}
                                {order.status === "new" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "contacted");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] text-amber-800 hover:bg-[var(--pastel-yellow-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as Contacted"
                                    >
                                        <PhoneCall className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Confirmed - Pastel Green */}
                                {(order.status === "new" || order.status === "contacted") && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "confirmed");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-green)] text-green-800 hover:bg-[var(--pastel-green-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as Confirmed"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                    </button>
                                )}



                                {/* In Transit - Blue (order shipped) - only for confirmed orders */}
                                {order.status === "confirmed" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "in_transit");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 hover:bg-blue-200 transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as In Transit"
                                    >
                                        <Truck className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Delivered - Pastel Mint (only for in_transit orders) */}
                                {order.status === "in_transit" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "delivered");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-mint)] text-teal-800 hover:bg-[var(--pastel-mint-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as Delivered"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Rejected - Pastel Pink (customer rejected after delivery attempt - only for in_transit) */}
                                {order.status === "in_transit" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onRejectWithReason) {
                                                onRejectWithReason(order);
                                            } else {
                                                onStatusUpdate(order.id, "rejected");
                                            }
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-pink)] text-rose-800 hover:bg-[var(--pastel-pink-dark)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Mark as Rejected"
                                    >
                                        <XCircle className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Mark as Complete - Glowing green (only for delivered orders) */}
                                {order.status === "delivered" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "completed");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 ring-2 ring-emerald-300/50 transition-all flex items-center justify-center disabled:opacity-50 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                                        title="طلب تام - Mark as Complete"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                    </button>
                                )}

                                {/* Cancel Button - For new, contacted, and confirmed orders */}
                                {(order.status === "new" || order.status === "contacted" || order.status === "confirmed") && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onCancelWithReason) {
                                                onCancelWithReason(order);
                                            } else {
                                                onStatusUpdate(order.id, "cancelled");
                                            }
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-[var(--pastel-pink-light)] border border-[var(--pastel-pink)] text-rose-700 hover:bg-[var(--pastel-pink)] transition-all flex items-center justify-center disabled:opacity-50"
                                        title="Cancel Order"
                                    >
                                        <Ban className="w-4 h-4" />
                                    </button>
                                )}

                                {/* No Response Button - For contacted orders (alternative to cancel) */}
                                {order.status === "contacted" && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onStatusUpdate(order.id, "no_response");
                                        }}
                                        disabled={isLoading}
                                        className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center justify-center disabled:opacity-50"
                                        title="لم يرد - No Response"
                                    >
                                        <PhoneCall className="w-4 h-4" />
                                    </button>
                                )}
                                {/* Refund Status Actions - For orders in return_pending */}
                                {order.status === "return_pending" && isReturn && (
                                    <>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onStatusUpdate(order.id, "refund_delivered");
                                            }}
                                            disabled={isLoading}
                                            className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 ring-2 ring-emerald-300/50 transition-all flex items-center justify-center disabled:opacity-50"
                                            title="تم الاسترجاع - Refund Delivered"
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onStatusUpdate(order.id, "refund_failed");
                                            }}
                                            disabled={isLoading}
                                            className="w-10 h-10 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 ring-2 ring-red-300/50 transition-all flex items-center justify-center disabled:opacity-50"
                                            title="فشل الاسترجاع - Refund Failed"
                                        >
                                            <XCircle className="w-4 h-4" />
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>


            </motion.div >
        </motion.div >

        {/* Blacklist dialog — rendered outside the card motion wrapper */}
        <BlacklistDialog
            open={blacklistDialogOpen}
            onClose={() => setBlacklistDialogOpen(false)}
            mode={blacklistDialogMode}
            customerName={order.customer_name}
            customerPhone={order.phone}
            existingEntry={blacklistEntry}
            onConfirm={async (reason, notes) => {
                if (blacklistDialogMode === "add" && onAddToBlacklist && reason) {
                    await onAddToBlacklist(order.phone, reason, notes);
                } else if (blacklistDialogMode === "remove" && onRemoveFromBlacklist) {
                    await onRemoveFromBlacklist(order.phone);
                }
            }}
        />
        </>
    );
});

OrderCard.displayName = "OrderCard";
