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
    order,
    open,
    onClose,
    onUpdate,
    onStatusUpdate,
    onGetTimeline,
    onGetNotes,
}: OrderDetailsModalProps) {
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
        if (!onStatusUpdate) return;

        setIsUpdatingStatus(true);

        let rejectionReason: string | undefined;
        if (newStatus === "rejected") {
            const promptResult = prompt("سبب الرفض (اختياري):");
            rejectionReason = promptResult !== null ? promptResult : undefined;
        }

        const result = await onStatusUpdate(order.id, newStatus, rejectionReason);

        if (!result.success) {
            alert(`فشل تحديث الحالة: ${result.error}`);
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
                {/* Header Area with Quick Actions */}
                <DialogHeader className="space-y-0 pb-0">
                    {/* Top Row: Order ID, Status, Edit Button */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <DialogTitle className="font-mono text-xl">#{order.order_id}</DialogTitle>
                            <span className={cn(
                                "inline-block px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider",
                                getStatusBadgeStyle()
                            )}>
                                {getStatusLabel(order.status)}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isEditing && (
                                <button
                                    onClick={handleEdit}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all text-sm font-medium"
                                >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    تعديل
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Actions Row - Status + Management */}
                    {!isEditing && order.status !== "delivered" && (
                        <div className="flex flex-wrap items-center gap-2 py-3 border-y border-[var(--card-border)]">
                            {/* Status Actions */}
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
                                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                                    isCurrentStatus
                                                        ? "bg-[var(--foreground)] text-white border-transparent"
                                                        : "bg-white border-[var(--card-border)] text-muted hover:bg-[var(--background)] hover:text-foreground",
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

                            {/* Priority Buttons */}
                            {[
                                { value: 'normal', label: 'عادي' },
                                { value: 'high', label: 'هام', icon: Flag },
                                { value: 'urgent', label: 'عاجل', icon: Flame },
                            ].map((p) => {
                                const Icon = p.icon;
                                const isActive = order.priority === p.value || (!order.priority && p.value === 'normal');
                                return (
                                    <button
                                        key={p.value}
                                        onClick={async () => {
                                            await onUpdate(order.id, { priority: p.value } as Partial<Order>);
                                        }}
                                        className={cn(
                                            "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                                            isActive
                                                ? "bg-[var(--foreground)] text-white border-transparent"
                                                : "bg-white border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                        )}
                                    >
                                        {Icon && <Icon className="w-3 h-3" />}
                                        {p.label}
                                    </button>
                                );
                            })}

                            {/* Separator */}
                            <div className="w-px h-5 bg-[var(--card-border)] mx-1" />

                            {/* Schedule */}
                            <button
                                onClick={async () => {
                                    const dateInput = prompt('موعد التوصيل (YYYY-MM-DD):', order.scheduled_date || new Date().toISOString().split('T')[0]);
                                    if (dateInput) {
                                        await onUpdate(order.id, { scheduled_date: dateInput } as Partial<Order>);
                                    }
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border bg-white border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                            >
                                <CalendarDays className="w-3.5 h-3.5" />
                                {order.scheduled_date
                                    ? new Date(order.scheduled_date).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' })
                                    : 'موعد'
                                }
                            </button>
                            <button
                                onClick={async () => {
                                    const tomorrow = new Date();
                                    tomorrow.setDate(tomorrow.getDate() + 1);
                                    await onUpdate(order.id, { scheduled_date: tomorrow.toISOString().split('T')[0] } as Partial<Order>);
                                }}
                                className="px-2 py-1.5 text-xs rounded-lg border bg-white border-[var(--card-border)] text-muted hover:bg-[var(--background)] transition-all"
                            >
                                غداً
                            </button>
                        </div>
                    )}

                    <DialogDescription className="sr-only">
                        Order details for {order.order_id}
                    </DialogDescription>
                </DialogHeader>

                {/* Tab Navigation */}
                <div className="flex gap-2 py-2">
                    <button
                        onClick={() => setActiveTab("details")}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            activeTab === "details"
                                ? "bg-[var(--foreground)] text-white"
                                : "text-muted hover:bg-[var(--background)]"
                        )}
                    >
                        <Package className="w-4 h-4" />
                        Details
                    </button>
                    <button
                        onClick={() => setActiveTab("timeline")}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            activeTab === "timeline"
                                ? "bg-[var(--foreground)] text-white"
                                : "text-muted hover:bg-[var(--background)]"
                        )}
                    >
                        <History className="w-4 h-4" />
                        Timeline
                    </button>

                    {/* Date */}
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(order.created_at)}
                    </span>
                </div>

                {/* Timeline Tab */}
                {activeTab === "timeline" && (
                    <div className="py-4">
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

                {/* Details Tab Content */}
                {activeTab === "details" && (
                    <div className="space-y-4 max-h-[55vh] overflow-y-auto -mr-2 pr-4">

                        {/* Customer Info Card */}
                        <div className="bg-white rounded-xl border border-[var(--card-border)] overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--background)] border-b border-[var(--card-border)]">
                                <User className="h-4 w-4 text-muted" />
                                <span className="font-semibold text-foreground">معلومات العميل</span>
                            </div>
                            <div className="p-4 space-y-4">
                                {/* Customer Name */}
                                <div>
                                    <span className="text-xs text-muted uppercase tracking-wider block mb-1">الاسم</span>
                                    {isEditing ? (
                                        <input
                                            value={displayValue("customer_name") as string}
                                            onChange={(e) => updateFormData("customer_name", e.target.value)}
                                            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-lg font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                        />
                                    ) : (
                                        <p className="text-xl font-bold text-foreground">{order.customer_name}</p>
                                    )}
                                </div>

                                {/* Phones Row */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {/* Primary Phone */}
                                    <div className="bg-[var(--background)] rounded-lg p-3 border border-[var(--card-border)]">
                                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                                            <Phone className="w-3 h-3" />
                                            الرقم الأساسي
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {isEditing ? (
                                                <input
                                                    value={displayValue("phone") as string}
                                                    onChange={(e) => updateFormData("phone", e.target.value)}
                                                    dir="ltr"
                                                    className="flex-1 px-3 py-1.5 bg-white border border-[var(--card-border)] rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                                />
                                            ) : (
                                                <span className="flex-1 font-mono text-foreground" dir="ltr">{order.phone}</span>
                                            )}
                                            <button
                                                onClick={handleWhatsApp}
                                                className="w-8 h-8 rounded-lg bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all flex items-center justify-center"
                                                title="واتساب"
                                            >
                                                <MessageCircle className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    {/* Secondary Phone */}
                                    <div className="bg-[var(--background)] rounded-lg p-3 border border-[var(--card-border)]">
                                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                                            <Phone className="w-3 h-3" />
                                            الرقم الثانوي
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {isEditing ? (
                                                <input
                                                    value={(displayValue("secondary_phone") || "") as string}
                                                    onChange={(e) => updateFormData("secondary_phone", e.target.value)}
                                                    dir="ltr"
                                                    placeholder="اختياري"
                                                    className="flex-1 px-3 py-1.5 bg-white border border-[var(--card-border)] rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                                />
                                            ) : (
                                                <span className="flex-1 font-mono text-foreground" dir="ltr">
                                                    {order.secondary_phone || "—"}
                                                </span>
                                            )}
                                            {order.secondary_phone && (
                                                <button
                                                    onClick={() => {
                                                        const link = generateWhatsAppLink(
                                                            order.secondary_phone!,
                                                            `مرحباً، بخصوص طلب ${order.order_id}`
                                                        );
                                                        window.open(link, "_blank");
                                                    }}
                                                    className="w-8 h-8 rounded-lg bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all flex items-center justify-center"
                                                    title="واتساب"
                                                >
                                                    <MessageCircle className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* City & Address */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-xs text-muted uppercase tracking-wider block mb-1">المدينة</span>
                                        {isEditing ? (
                                            <input
                                                value={(displayValue("city") || "") as string}
                                                onChange={(e) => updateFormData("city", e.target.value)}
                                                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--card-border)]"
                                            />
                                        ) : (
                                            <p className="text-foreground">{order.city || "—"}</p>
                                        )}
                                    </div>
                                    <div>
                                        <span className="text-xs text-muted uppercase tracking-wider flex items-center gap-1 mb-1">
                                            <MapPin className="h-3 w-3" />
                                            العنوان
                                        </span>
                                        {isEditing ? (
                                            <textarea
                                                value={(displayValue("address_details") || "") as string}
                                                onChange={(e) => updateFormData("address_details", e.target.value)}
                                                rows={2}
                                                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[var(--card-border)] resize-none"
                                            />
                                        ) : (
                                            <p className="text-sm text-muted">
                                                {order.address_details || "لم يتم تحديد العنوان"}
                                            </p>
                                        )}
                                    </div>
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
