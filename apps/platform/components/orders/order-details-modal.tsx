"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { formatIQD, formatDate, generateWhatsAppLink, getStatusLabel } from "@/lib/utils";
import { validatePhoneDetailed, formatPhoneForDisplay } from "@/lib/order-utils";
import { cn } from "@/lib/utils";
import type { Order, OrderStatusHistory, OrderNote } from "@/lib/supabase";
import { OrderTimeline } from "./order-timeline";
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
} from "lucide-react";

interface OrderDetailsModalProps {
    order: Order | null;
    open: boolean;
    onClose: () => void;
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    onStatusUpdate?: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onGetTimeline?: (orderId: string) => Promise<OrderStatusHistory[]>;
    onGetNotes?: (orderId: string) => Promise<OrderNote[]>;
}

export function OrderDetailsModal({
    order: propOrder,
    open,
    onClose,
    onUpdate,
    onStatusUpdate,
    onGetTimeline,
    onGetNotes,
}: OrderDetailsModalProps) {
    const [order, setOrder] = useState<Order | null>(propOrder);

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
        }
    }, [open]);

    if (!order) return null;

    const handleEdit = () => {
        setFormData({
            customer_name: order.customer_name,
            phone: order.phone,
            secondary_phone: order.secondary_phone || "",
            city: order.city || "",
            governorate_code: order.governorate_code || "",
            address_details: order.address_details || "",
            notes: order.notes || "",
            price: order.price,
            discount_amount: order.discount_amount || 0,
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
            setIsEditing(false);
            setFormData({});
        } else {
            alert(`فشل الحفظ: ${result.error}`);
        }

        setIsSaving(false);
    };

    const handleStatusChange = async (newStatus: Order["status"]) => {
        if (!onStatusUpdate || !order) return;

        setIsUpdatingStatus(true);

        const previousStatus = order.status;

        // Optimistic update
        setOrder(prev => prev ? { ...prev, status: newStatus } : null);

        let rejectionReason: string | undefined;
        if (newStatus === "rejected") {
            const promptResult = prompt("سبب الرفض (اختياري):");
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
            alert(`فشل تحديث الحالة: ${result.error}`);
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

    const getStatusBadgeStyle = () => {
        switch (order.status) {
            case "new": return "bg-orange-200 text-orange-900";
            case "contacted": return "bg-[var(--pastel-yellow)] text-amber-900";
            case "confirmed": return "bg-[var(--pastel-green)] text-green-900";
            case "delivered": return "bg-[var(--pastel-mint)] text-teal-900";
            case "rejected": return "bg-[var(--pastel-pink)] text-rose-900";
            default: return "bg-gray-100 text-gray-700";
        }
    };

    // Quick action buttons config - Soft pastel colors
    const quickActions = [
        {
            status: "contacted" as Order["status"],
            label: "Contacted",
            labelAr: "تم الاتصال",
            icon: PhoneCall,
            bgColor: "bg-[var(--pastel-yellow)]",
            textColor: "text-amber-900",
            hoverColor: "hover:bg-[var(--pastel-yellow-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "confirmed" as Order["status"],
            label: "Confirmed",
            labelAr: "مؤكد",
            icon: CheckCircle,
            bgColor: "bg-[var(--pastel-green)]",
            textColor: "text-green-900",
            hoverColor: "hover:bg-[var(--pastel-green-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "delivered" as Order["status"],
            label: "Delivered",
            labelAr: "تم التوصيل",
            icon: Truck,
            bgColor: "bg-[var(--pastel-mint)]",
            textColor: "text-teal-900",
            hoverColor: "hover:bg-[var(--pastel-mint-dark)]",
            borderColor: "border-transparent",
        },
        {
            status: "rejected" as Order["status"],
            label: "Reject",
            labelAr: "رفض",
            icon: XCircle,
            bgColor: "bg-[var(--pastel-pink)]",
            textColor: "text-rose-900",
            hoverColor: "hover:bg-[var(--pastel-pink-dark)]",
            borderColor: "border-transparent",
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl overflow-hidden">
                {/* Header Area */}
                <DialogHeader className="space-y-0 pb-0">
                    {/* Top Row: Order ID, Status, Timeline + Edit Buttons */}
                    <div className="flex items-center justify-between mb-3 mr-6">
                        <div className="flex items-center gap-3">
                            <DialogTitle className="font-mono text-xl">#{order.order_id}</DialogTitle>
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
                                السجل
                            </button>
                            {/* Edit Button */}
                            {!isEditing && (
                                <button
                                    onClick={handleEdit}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all text-xs font-medium"
                                >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    تعديل
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Actions Row - Status + Management (with colors!) */}
                    {!isEditing && order.status !== "delivered" && (
                        <div className="flex flex-wrap items-center gap-2 py-3 border-y border-[var(--card-border)]">
                            {/* Status Actions - Colored */}
                            {onStatusUpdate && (
                                <>
                                    {quickActions.map((action) => {
                                        const Icon = action.icon;
                                        const isCurrentStatus = order.status === action.status;
                                        return (
                                            <button
                                                key={action.status}
                                                onClick={() => handleStatusChange(action.status)}
                                                disabled={isUpdatingStatus || isCurrentStatus}
                                                className={cn(
                                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                                    isCurrentStatus
                                                        ? "bg-[var(--foreground)] text-white"
                                                        : cn(action.bgColor, action.textColor, action.hoverColor),
                                                    isUpdatingStatus && "opacity-50 cursor-wait"
                                                )}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                                <span>{action.labelAr}</span>
                                            </button>
                                        );
                                    })}

                                    {/* Separator */}
                                    <div className="w-px h-5 bg-[var(--card-border)] mx-1" />
                                </>
                            )}

                            {/* Priority Buttons - Colored */}
                            {[
                                { value: 'normal', label: 'عادي', bg: 'bg-gray-100', text: 'text-gray-700', hover: 'hover:bg-gray-200' },
                                { value: 'high', label: 'هام', bg: 'bg-amber-100', text: 'text-amber-800', hover: 'hover:bg-amber-200', icon: Flag },
                                { value: 'urgent', label: 'عاجل', bg: 'bg-red-100', text: 'text-red-800', hover: 'hover:bg-red-200', icon: Flame },
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
                                                // Revert
                                                setOrder(prev => prev ? { ...prev, priority: oldPriority } : null);
                                            }
                                        }}
                                        className={cn(
                                            "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            isActive
                                                ? "bg-[var(--foreground)] text-white"
                                                : cn(p.bg, p.text, p.hover)
                                        )}
                                    >
                                        {Icon && <Icon className="w-3 h-3" />}
                                        {p.label}
                                    </button>
                                );
                            })}

                            {/* Separator */}
                            <div className="w-px h-5 bg-[var(--card-border)] mx-1" />

                            {/* Schedule - Colored */}
                            <button
                                onClick={async () => {
                                    if (!order) return;
                                    const dateInput = prompt('موعد التوصيل (YYYY-MM-DD):', order.scheduled_date || new Date().toISOString().split('T')[0]);
                                    if (dateInput) {
                                        const oldDate = order.scheduled_date;
                                        setOrder(prev => prev ? { ...prev, scheduled_date: dateInput } : null);

                                        const result = await onUpdate(order.id, { scheduled_date: dateInput } as Partial<Order>);
                                        if (!result.success) {
                                            setOrder(prev => prev ? { ...prev, scheduled_date: oldDate } : null);
                                        }
                                    }
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all bg-blue-100 text-blue-700 hover:bg-blue-200"
                            >
                                <CalendarDays className="w-3.5 h-3.5" />
                                {order.scheduled_date
                                    ? new Date(order.scheduled_date).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' })
                                    : 'موعد'
                                }
                            </button>
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
                                className="px-2 py-1.5 text-xs rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                            >
                                غداً
                            </button>
                        </div>
                    )}

                    <DialogDescription className="sr-only">
                        Order details for {order.order_id}
                    </DialogDescription>
                </DialogHeader>

                {/* Timeline View */}
                {activeTab === "timeline" && (
                    <div className="py-4 max-h-[50vh] overflow-y-auto">
                        {loadingTimeline ? (
                            <div className="text-center py-8">
                                <div className="w-6 h-6 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                                <p className="text-sm text-muted">Loading timeline...</p>
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
                                    <span className="font-semibold text-foreground">معلومات العميل</span>
                                </div>
                            </div>

                            <div className="p-4 grid gap-4">
                                {/* Name & Governorate Row */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="md:col-span-2">
                                        <span className="text-xs text-muted uppercase tracking-wider block mb-1">الاسم</span>
                                        {isEditing ? (
                                            <input
                                                value={displayValue("customer_name") as string}
                                                onChange={(e) => updateFormData("customer_name", e.target.value)}
                                                className="w-full px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                            />
                                        ) : (
                                            <p className="text-lg font-bold text-foreground">{order.customer_name}</p>
                                        )}
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted uppercase tracking-wider block mb-1">المحافظة</span>
                                        {isEditing ? (
                                            <input
                                                value={(displayValue("city") || "") as string}
                                                onChange={(e) => updateFormData("city", e.target.value)}
                                                className="w-full px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                            />
                                        ) : (
                                            <p className="text-lg font-medium text-foreground">{order.city || "—"}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Phones Row */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Primary Phone */}
                                    <div>
                                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                                            <Phone className="w-3 h-3" />
                                            الرقم الأساسي
                                            {/* Validation indicator for display mode */}
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
                                                            "w-full px-3 py-1.5 bg-white border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2",
                                                            !validatePhoneDetailed(displayValue("phone") as string).isValid
                                                                ? "border-red-300 focus:ring-red-200"
                                                                : "border-[var(--card-border)] focus:ring-[var(--card-border)]"
                                                        )}
                                                    />
                                                    {/* Real-time validation indicator while editing */}
                                                    {!validatePhoneDetailed(displayValue("phone") as string).isValid && (
                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 group">
                                                            <span className="relative flex h-2.5 w-2.5">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                                            </span>
                                                            {/* Tooltip */}
                                                            <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                {validatePhoneDetailed(displayValue("phone") as string).errorMessageAr}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span
                                                    className={cn(
                                                        "flex-1 font-mono text-lg tracking-wide",
                                                        !validatePhoneDetailed(order.phone).isValid && "text-red-600"
                                                    )}
                                                    dir="ltr"
                                                >
                                                    {formatPhoneForDisplay(order.phone) || "—"}
                                                </span>
                                            )}
                                            <button
                                                onClick={handleWhatsApp}
                                                disabled={!validatePhoneDetailed(order.phone).isValid}
                                                className={cn(
                                                    "w-8 h-8 rounded-lg transition-all flex items-center justify-center flex-shrink-0",
                                                    validatePhoneDetailed(order.phone).isValid
                                                        ? "bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)]"
                                                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                                )}
                                                title={validatePhoneDetailed(order.phone).isValid ? "واتساب" : validatePhoneDetailed(order.phone).errorMessageAr}
                                            >
                                                <MessageCircle className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    {/* Secondary Phone */}
                                    <div>
                                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                                            <Phone className="w-3 h-3" />
                                            الرقم الثانوي
                                            {/* Validation indicator for display mode (only if phone exists) */}
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
                                                        placeholder="اختياري"
                                                        className={cn(
                                                            "w-full px-3 py-1.5 bg-white border rounded-lg text-foreground font-mono focus:outline-none focus:ring-2",
                                                            (displayValue("secondary_phone") as string) && !validatePhoneDetailed(displayValue("secondary_phone") as string).isValid
                                                                ? "border-red-300 focus:ring-red-200"
                                                                : "border-[var(--card-border)] focus:ring-[var(--card-border)]"
                                                        )}
                                                    />
                                                    {/* Real-time validation indicator while editing */}
                                                    {(displayValue("secondary_phone") as string) && !validatePhoneDetailed(displayValue("secondary_phone") as string).isValid && (
                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 group">
                                                            <span className="relative flex h-2.5 w-2.5">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                                            </span>
                                                            {/* Tooltip */}
                                                            <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                {validatePhoneDetailed(displayValue("secondary_phone") as string).errorMessageAr}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span
                                                    className={cn(
                                                        "flex-1 font-mono text-lg tracking-wide",
                                                        order.secondary_phone && !validatePhoneDetailed(order.secondary_phone).isValid && "text-red-600"
                                                    )}
                                                    dir="ltr"
                                                >
                                                    {formatPhoneForDisplay(order.secondary_phone) || "—"}
                                                </span>
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
                                                    className="w-8 h-8 rounded-lg bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all flex items-center justify-center flex-shrink-0"
                                                    title="واتساب"
                                                >
                                                    <MessageCircle className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Address Row */}
                                <div>
                                    <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-1.5">
                                        <MapPin className="h-3 w-3" />
                                        العنوان الكامل
                                    </span>
                                    {isEditing ? (
                                        <textarea
                                            value={(displayValue("address_details") || "") as string}
                                            onChange={(e) => updateFormData("address_details", e.target.value)}
                                            rows={2}
                                            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--card-border)] resize-none"
                                        />
                                    ) : (
                                        <p className="text-sm font-medium text-foreground bg-[var(--background)] px-3 py-2.5 rounded-lg leading-relaxed">
                                            {order.address_details || "لم يتم تحديد العنوان"}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Payment Type Toggle */}
                            <div>
                                <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-2">
                                    <CreditCard className="h-3 w-3" />
                                    طريقة الدفع
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={async () => {
                                            if (!order) return;
                                            const oldStatus = order.payment_status;
                                            setOrder(prev => prev ? { ...prev, payment_status: 'cod' } : null);
                                            const result = await onUpdate(order.id, { payment_status: 'cod' } as Partial<Order>);
                                            if (!result.success) {
                                                setOrder(prev => prev ? { ...prev, payment_status: oldStatus } : null);
                                            }
                                        }}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                                            order.payment_status === 'cod' || !order.payment_status
                                                ? "bg-amber-100 border-amber-300 text-amber-800"
                                                : "bg-white border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                        )}
                                    >
                                        <Banknote className="w-4 h-4" />
                                        كاش (COD)
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!order) return;
                                            const oldStatus = order.payment_status;
                                            setOrder(prev => prev ? { ...prev, payment_status: 'prepaid' } : null);
                                            const result = await onUpdate(order.id, { payment_status: 'prepaid' } as Partial<Order>);
                                            if (!result.success) {
                                                setOrder(prev => prev ? { ...prev, payment_status: oldStatus } : null);
                                            }
                                        }}
                                        className={cn(
                                            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                                            order.payment_status === 'prepaid'
                                                ? "bg-green-100 border-green-300 text-green-800"
                                                : "bg-white border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                        )}
                                    >
                                        <CreditCard className="w-4 h-4" />
                                        دفع الكتروني
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Products Card */}
                        <div className="bg-white rounded-xl border border-[var(--card-border)] overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)]">
                                <Package className="h-4 w-4 text-muted" />
                                <span className="font-semibold text-foreground">المنتجات</span>
                                <span className="text-xs text-muted">
                                    {order.items?.length || 0} عنصر
                                </span>
                                {/* Add Product Button */}
                                {isEditing && (
                                    <button
                                        className="ml-auto px-2 py-1 text-xs bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-lg hover:bg-white transition-all"
                                        onClick={() => {
                                            alert('إضافة منتج - قريباً');
                                        }}
                                    >
                                        + إضافة
                                    </button>
                                )}
                            </div>
                            <div className="divide-y divide-[var(--card-border)]">
                                {order.items && order.items.length > 0 ? (
                                    order.items.map((item, index) => (
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
                                                    <span>×{item.quantity}</span>
                                                    <span>•</span>
                                                    <span>{formatIQD(item.price)}</span>
                                                </div>
                                            </div>
                                            <span className="font-bold text-foreground font-mono">
                                                {formatIQD(item.price * item.quantity)}
                                            </span>
                                            {/* Remove Button - Show on edit/hover */}
                                            {isEditing && (
                                                <button
                                                    className="w-8 h-8 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-all flex items-center justify-center"
                                                    onClick={() => {
                                                        // TODO: Implement remove product functionality
                                                        alert('حذف منتج - قريباً');
                                                    }}
                                                    title="حذف"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-6 text-center text-muted">لا توجد عناصر</div>
                                )}
                            </div>
                            {/* Discount + Total */}
                            <div className="border-t border-[var(--card-border)]">
                                {/* Discount Row */}
                                <div className="flex items-center justify-between px-4 py-2">
                                    <span className="text-sm text-muted">خصم</span>
                                    {isEditing ? (
                                        <input
                                            type="number"
                                            value={(displayValue("discount_amount") as number) || 0}
                                            onChange={(e) => updateFormData("discount_amount", Number(e.target.value))}
                                            className="w-24 px-2 py-1 text-right bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                            placeholder="0"
                                        />
                                    ) : (
                                        <span className="font-mono text-muted">
                                            {order.discount_amount ? `- ${formatIQD(order.discount_amount)}` : "—"}
                                        </span>
                                    )}
                                </div>
                                {/* Total */}
                                <div className="flex items-center justify-between px-4 py-3 bg-[var(--background)]">
                                    <span className="font-semibold text-foreground">المجموع</span>
                                    <span className="text-lg font-bold text-foreground font-mono">
                                        {formatIQD(Number(order.price) - (order.discount_amount || 0))}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Notes Card */}
                        <div className="bg-white rounded-xl border border-[var(--card-border)] overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)]">
                                <FileText className="h-4 w-4 text-muted" />
                                <span className="font-semibold text-foreground">ملاحظات</span>
                            </div>
                            <div className="p-4">
                                {isEditing ? (
                                    <textarea
                                        value={(displayValue("notes") || "") as string}
                                        onChange={(e) => updateFormData("notes", e.target.value)}
                                        placeholder="أضف ملاحظات داخلية هنا..."
                                        rows={2}
                                        className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--card-border)] resize-none"
                                    />
                                ) : (
                                    <p className="text-sm text-muted min-h-[40px]">
                                        {order.notes || "لا توجد ملاحظات"}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Rejection Reason */}
                        {order.status === "rejected" && order.rejection_reason && (
                            <div className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4">
                                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                                    <XCircle className="w-4 h-4 text-muted" />
                                    سبب الرفض
                                </h4>
                                <p className="text-sm text-muted">{order.rejection_reason}</p>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {isEditing ? (
                        <>
                            <button
                                onClick={handleCancel}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all font-medium"
                            >
                                <X className="h-4 w-4" />
                                إلغاء
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all font-semibold shadow-md shadow-green-500/20 disabled:opacity-50"
                            >
                                <Save className="h-4 w-4" />
                                حفظ التعديلات
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={onClose}
                                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all font-medium"
                            >
                                إغلاق
                            </button>
                            <button
                                onClick={handleWhatsApp}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all font-semibold shadow-md shadow-green-500/20"
                            >
                                <MessageCircle className="h-4 w-4" />
                                فتح واتساب
                            </button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
