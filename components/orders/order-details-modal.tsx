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
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <DialogTitle className="font-mono text-xl">#{order.order_id}</DialogTitle>
                            <span className={cn(
                                "inline-block px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider",
                                getStatusBadgeStyle()
                            )}>
                                {getStatusLabel(order.status)}
                            </span>
                        </div>
                        {!isEditing ? (
                            <button
                                onClick={handleEdit}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all text-sm font-medium"
                            >
                                <Edit2 className="h-4 w-4" />
                                تعديل
                            </button>
                        ) : null}
                    </div>
                    <DialogDescription>
                        <div className="flex items-center gap-2 text-muted mt-2">
                            <Calendar className="h-4 w-4" />
                            {formatDate(order.created_at)}
                        </div>
                    </DialogDescription>
                </DialogHeader>

                {/* Tab Navigation */}
                <div className="flex gap-2 border-b border-[var(--card-border)] pb-2">
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
                    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
                        {/* Top Action Bar - Quick Actions + Priority + Schedule */}
                        {!isEditing && order.status !== "delivered" && (
                            <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 rounded-2xl border border-amber-200 p-4 space-y-3">
                                {/* Quick Status Actions */}
                                {onStatusUpdate && (
                                    <div className="flex items-center gap-3">
                                        <Zap className="w-5 h-5 text-amber-600 flex-shrink-0" />
                                        <div className="flex flex-wrap gap-2">
                                            {quickActions.map((action) => {
                                                const Icon = action.icon;
                                                const isCurrentStatus = order.status === action.status;
                                                return (
                                                    <button
                                                        key={action.status}
                                                        onClick={() => handleStatusChange(action.status)}
                                                        disabled={isUpdatingStatus || isCurrentStatus}
                                                        className={cn(
                                                            "flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-all shadow-sm",
                                                            isCurrentStatus
                                                                ? "bg-[var(--foreground)] text-white cursor-not-allowed"
                                                                : cn(action.bgColor, action.textColor, action.hoverColor),
                                                            isUpdatingStatus && "opacity-50 cursor-wait"
                                                        )}
                                                    >
                                                        <Icon className="w-3.5 h-3.5" />
                                                        <span>{action.labelAr}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Priority + Schedule Row */}
                                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-amber-200/50">
                                    {/* Priority Buttons */}
                                    <div className="flex items-center gap-2">
                                        <Flag className="w-4 h-4 text-muted" />
                                        {[
                                            { value: 'normal', label: 'عادي', bg: 'bg-gray-100', activeBg: 'bg-gray-300', text: 'text-gray-700' },
                                            { value: 'high', label: 'هام', bg: 'bg-amber-100', activeBg: 'bg-amber-300', text: 'text-amber-800', icon: Flag },
                                            { value: 'urgent', label: 'عاجل', bg: 'bg-red-100', activeBg: 'bg-red-300', text: 'text-red-800', icon: Flame },
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
                                                        "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                                                        isActive ? cn(p.activeBg, p.text) : cn(p.bg, p.text, "hover:opacity-80")
                                                    )}
                                                >
                                                    {Icon && <Icon className="w-3 h-3" />}
                                                    {p.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Divider */}
                                    <div className="w-px h-6 bg-amber-300/50" />

                                    {/* Schedule Button */}
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="w-4 h-4 text-muted" />
                                        <button
                                            onClick={async () => {
                                                const dateInput = prompt('موعد التوصيل (YYYY-MM-DD):', order.scheduled_date || new Date().toISOString().split('T')[0]);
                                                if (dateInput) {
                                                    await onUpdate(order.id, { scheduled_date: dateInput } as Partial<Order>);
                                                }
                                            }}
                                            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-all font-medium"
                                        >
                                            {order.scheduled_date
                                                ? new Date(order.scheduled_date).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'short' })
                                                : 'حدد موعد'
                                            }
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const tomorrow = new Date();
                                                tomorrow.setDate(tomorrow.getDate() + 1);
                                                await onUpdate(order.id, { scheduled_date: tomorrow.toISOString().split('T')[0] } as Partial<Order>);
                                            }}
                                            className="px-2 py-1 text-xs bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition-all"
                                        >
                                            غداً
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Customer Info - Full Width, Prominent */}
                        <div className="bg-white rounded-2xl border-2 border-[var(--pastel-yellow)] shadow-md overflow-hidden">
                            <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-amber-100 to-yellow-100 border-b border-amber-200">
                                <div className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] flex items-center justify-center shadow-sm">
                                    <User className="h-5 w-5 text-amber-900" />
                                </div>
                                <span className="text-lg font-bold text-foreground">معلومات العميل</span>
                            </div>
                            <div className="p-5">
                                {/* Customer Name - Large */}
                                <div className="mb-4 pb-4 border-b border-[var(--card-border)]">
                                    <span className="text-xs text-muted uppercase tracking-wider block mb-1">الاسم</span>
                                    {isEditing ? (
                                        <input
                                            value={displayValue("customer_name") as string}
                                            onChange={(e) => updateFormData("customer_name", e.target.value)}
                                            className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-amber-200"
                                        />
                                    ) : (
                                        <p className="text-2xl font-bold text-foreground">{order.customer_name}</p>
                                    )}
                                </div>

                                {/* Phones Row */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    {/* Primary Phone */}
                                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                                        <span className="text-xs text-green-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                                            <Phone className="w-3 h-3" />
                                            الرقم الأساسي
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {isEditing ? (
                                                <input
                                                    value={displayValue("phone") as string}
                                                    onChange={(e) => updateFormData("phone", e.target.value)}
                                                    dir="ltr"
                                                    className="flex-1 px-3 py-2 bg-white border border-green-200 rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-green-200"
                                                />
                                            ) : (
                                                <span className="flex-1 font-mono text-lg text-foreground" dir="ltr">{order.phone}</span>
                                            )}
                                            <button
                                                onClick={handleWhatsApp}
                                                className="w-10 h-10 rounded-xl bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all flex items-center justify-center shadow-md"
                                                title="واتساب"
                                            >
                                                <MessageCircle className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    {/* Secondary Phone */}
                                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                                        <span className="text-xs text-blue-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
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
                                                    className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                />
                                            ) : (
                                                <span className="flex-1 font-mono text-lg text-foreground" dir="ltr">
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
                                                    className="w-10 h-10 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-all flex items-center justify-center shadow-md"
                                                    title="واتساب"
                                                >
                                                    <MessageCircle className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* City & Address */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-xs text-muted uppercase tracking-wider block mb-1">المدينة</span>
                                        {isEditing ? (
                                            <input
                                                value={(displayValue("city") || "") as string}
                                                onChange={(e) => updateFormData("city", e.target.value)}
                                                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-amber-200"
                                            />
                                        ) : (
                                            <p className="text-foreground font-medium">{order.city || "—"}</p>
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
                                                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                                            />
                                        ) : (
                                            <p className="text-sm text-foreground bg-[var(--background)] px-3 py-2 rounded-lg">
                                                {order.address_details || "لم يتم تحديد العنوان"}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Products Card with Add/Remove */}
                        <div className="bg-white rounded-2xl border border-[var(--card-border)] shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100">
                                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                                    <Package className="h-4 w-4 text-green-900" />
                                </div>
                                <span className="font-bold text-foreground">المنتجات</span>
                                <span className="text-xs text-muted">
                                    {order.items?.length || 0} عنصر
                                </span>
                                {/* Add Product Button */}
                                {isEditing && (
                                    <button
                                        className="ml-auto px-3 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-all font-medium"
                                        onClick={() => {
                                            // TODO: Implement add product functionality
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
                                <div className="flex items-center justify-between px-4 py-2 bg-rose-50/50">
                                    <span className="text-sm text-rose-700">خصم</span>
                                    {isEditing ? (
                                        <input
                                            type="number"
                                            value={(displayValue("discount_amount") as number) || 0}
                                            onChange={(e) => updateFormData("discount_amount", Number(e.target.value))}
                                            className="w-24 px-2 py-1 text-right bg-white border border-rose-200 rounded-lg text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
                                            placeholder="0"
                                        />
                                    ) : (
                                        <span className="font-mono text-rose-700">
                                            {order.discount_amount ? `- ${formatIQD(order.discount_amount)}` : "—"}
                                        </span>
                                    )}
                                </div>
                                {/* Total */}
                                <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-yellow-50">
                                    <span className="font-bold text-foreground">المجموع</span>
                                    <span className="text-xl font-bold text-amber-900 font-mono">
                                        {formatIQD(Number(order.price) - (order.discount_amount || 0))}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Notes Card */}
                        <div className="bg-white rounded-2xl border border-[var(--card-border)] shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-teal-100">
                                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-mint)] flex items-center justify-center">
                                    <FileText className="h-4 w-4 text-teal-900" />
                                </div>
                                <span className="font-bold text-foreground">ملاحظات</span>
                            </div>
                            <div className="p-4">
                                {isEditing ? (
                                    <textarea
                                        value={(displayValue("notes") || "") as string}
                                        onChange={(e) => updateFormData("notes", e.target.value)}
                                        placeholder="أضف ملاحظات داخلية هنا..."
                                        rows={3}
                                        className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-200 resize-none"
                                    />
                                ) : (
                                    <p className="text-sm text-foreground bg-[var(--background)] p-3 rounded-xl min-h-[60px]">
                                        {order.notes || "لا توجد ملاحظات"}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Rejection Reason */}
                        {order.status === "rejected" && order.rejection_reason && (
                            <div className="bg-rose-50 rounded-2xl border border-rose-200 shadow-sm p-4">
                                <h4 className="text-sm font-bold text-rose-900 flex items-center gap-2 mb-2">
                                    <XCircle className="w-4 h-4" />
                                    سبب الرفض
                                </h4>
                                <p className="text-sm text-rose-800">{order.rejection_reason}</p>
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
