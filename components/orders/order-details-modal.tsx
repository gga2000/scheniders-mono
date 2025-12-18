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
            city: order.city || "",
            governorate_code: order.governorate_code || "",
            address_details: order.address_details || "",
            notes: order.notes || "",
            price: order.price,
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
                    <>
                        {/* Quick Actions Bar */}
                        {onStatusUpdate && !isEditing && order.status !== "delivered" && (
                            <div className="border border-[var(--card-border)] rounded-2xl p-4 bg-[var(--background)]">
                                <div className="flex items-center gap-3 mb-3">
                                    <Zap className="w-4 h-4 text-amber-600" />
                                    <span className="text-sm font-bold text-foreground">Quick Actions</span>
                                </div>
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
                                                    "flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all border",
                                                    isCurrentStatus
                                                        ? "bg-[var(--foreground)] text-white cursor-not-allowed border-transparent"
                                                        : cn(action.bgColor, action.textColor, action.hoverColor, action.borderColor),
                                                    isUpdatingStatus && "opacity-50 cursor-wait"
                                                )}
                                            >
                                                <Icon className="w-4 h-4" />
                                                <span>{action.labelAr}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Order Management Controls */}
                        {!isEditing && (
                            <div className="border border-[var(--card-border)] rounded-2xl p-4 bg-[var(--background)]">
                                <div className="flex items-center gap-3 mb-3">
                                    <Clock className="w-4 h-4 text-blue-600" />
                                    <span className="text-sm font-bold text-foreground">Order Management</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Scheduled Delivery Date */}
                                    <div className="space-y-2">
                                        <label className="text-xs text-muted font-medium flex items-center gap-1.5">
                                            <CalendarDays className="w-3 h-3" />
                                            Scheduled Delivery
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="date"
                                                value={order.scheduled_date || ""}
                                                onChange={async (e) => {
                                                    const date = e.target.value || null;
                                                    await onUpdate(order.id, { scheduled_date: date } as Partial<Order>);
                                                }}
                                                className="flex-1 px-3 py-2 bg-white border border-[var(--card-border)] rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                            />
                                            <button
                                                onClick={async () => {
                                                    const tomorrow = new Date();
                                                    tomorrow.setDate(tomorrow.getDate() + 1);
                                                    await onUpdate(order.id, { scheduled_date: tomorrow.toISOString().split('T')[0] } as Partial<Order>);
                                                }}
                                                className="px-3 py-2 text-xs bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all"
                                            >
                                                Tomorrow
                                            </button>
                                        </div>
                                        {order.scheduled_date && (
                                            <p className="text-xs text-blue-600">
                                                📅 Scheduled: {new Date(order.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </p>
                                        )}
                                    </div>

                                    {/* Priority Level */}
                                    <div className="space-y-2">
                                        <label className="text-xs text-muted font-medium flex items-center gap-1.5">
                                            <Flag className="w-3 h-3" />
                                            Priority Level
                                        </label>
                                        <div className="flex gap-2">
                                            {[
                                                { value: 'normal', label: 'Normal', bg: 'bg-gray-100', text: 'text-gray-700', hover: 'hover:bg-gray-200' },
                                                { value: 'high', label: 'High', bg: 'bg-amber-100', text: 'text-amber-700', hover: 'hover:bg-amber-200', icon: Flag },
                                                { value: 'urgent', label: 'Urgent', bg: 'bg-red-100', text: 'text-red-700', hover: 'hover:bg-red-200', icon: Flame },
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
                                                            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border",
                                                            isActive
                                                                ? cn(p.bg, p.text, "border-current ring-2 ring-offset-1", p.value === 'urgent' ? "ring-red-300" : p.value === 'high' ? "ring-amber-300" : "ring-gray-300")
                                                                : cn("bg-white border-[var(--card-border)]", p.hover)
                                                        )}
                                                    >
                                                        {Icon && <Icon className="w-3 h-3" />}
                                                        {p.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-6">
                            {/* Customer Information */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                                    <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] flex items-center justify-center">
                                        <User className="h-4 w-4 text-amber-900" />
                                    </div>
                                    معلومات العميل
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs text-muted uppercase tracking-wider font-semibold">اسم العميل</label>
                                        {isEditing ? (
                                            <input
                                                value={displayValue("customer_name") as string}
                                                onChange={(e) => updateFormData("customer_name", e.target.value)}
                                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                            />
                                        ) : (
                                            <p className="text-foreground font-medium text-lg">{order.customer_name}</p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs text-muted uppercase tracking-wider font-semibold">رقم الهاتف</label>
                                        <div className="flex items-center gap-2">
                                            {isEditing ? (
                                                <input
                                                    value={displayValue("phone") as string}
                                                    onChange={(e) => updateFormData("phone", e.target.value)}
                                                    dir="ltr"
                                                    className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                                />
                                            ) : (
                                                <p className="text-foreground font-mono flex-1 text-lg" dir="ltr">
                                                    {order.phone}
                                                </p>
                                            )}
                                            <button
                                                onClick={handleWhatsApp}
                                                className="w-12 h-12 rounded-xl bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all flex items-center justify-center shadow-md shadow-green-500/20"
                                                title="فتح واتساب"
                                            >
                                                <MessageCircle className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs text-muted uppercase tracking-wider font-semibold">المدينة</label>
                                        {isEditing ? (
                                            <input
                                                value={(displayValue("city") || "") as string}
                                                onChange={(e) => updateFormData("city", e.target.value)}
                                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                            />
                                        ) : (
                                            <p className="text-foreground">{order.city || "-"}</p>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs text-muted uppercase tracking-wider font-semibold">كود المحافظة</label>
                                        {isEditing ? (
                                            <input
                                                value={(displayValue("governorate_code") || "") as string}
                                                onChange={(e) => updateFormData("governorate_code", e.target.value)}
                                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                            />
                                        ) : (
                                            <p className="text-foreground">{order.governorate_code || "-"}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs text-muted uppercase tracking-wider font-semibold flex items-center gap-2">
                                        <MapPin className="h-3 w-3" />
                                        العنوان الكامل
                                    </label>
                                    {isEditing ? (
                                        <textarea
                                            value={(displayValue("address_details") || "") as string}
                                            onChange={(e) => updateFormData("address_details", e.target.value)}
                                            rows={3}
                                            className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                                        />
                                    ) : (
                                        <p className="text-foreground bg-[var(--background)] p-4 rounded-xl border border-[var(--card-border)]">
                                            {order.address_details || "لم يتم تحديد العنوان"}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Order Items */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                                    <div className="w-8 h-8 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                                        <Package className="h-4 w-4 text-green-900" />
                                    </div>
                                    العناصر المطلوبة
                                </h3>
                                <div className="border border-[var(--card-border)] rounded-2xl overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-[var(--background)]">
                                            <tr>
                                                <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                                                    المنتج
                                                </th>
                                                <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                                                    الكمية
                                                </th>
                                                <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                                                    السعر
                                                </th>
                                                <th className="text-right px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">
                                                    المجموع
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {order.items && order.items.length > 0 ? (
                                                order.items.map((item, index) => (
                                                    <tr key={index} className="border-t border-[var(--card-border)]">
                                                        <td className="px-4 py-3 text-foreground font-medium">{item.name}</td>
                                                        <td className="px-4 py-3 text-foreground font-mono">
                                                            {item.quantity}×
                                                        </td>
                                                        <td className="px-4 py-3 text-foreground font-mono">
                                                            {formatIQD(item.price)}
                                                        </td>
                                                        <td className="px-4 py-3 text-foreground font-mono font-semibold">
                                                            {formatIQD(item.price * item.quantity)}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-6 text-center text-muted">
                                                        لا توجد عناصر
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        <tfoot className="bg-[var(--pastel-yellow-light)] border-t border-[var(--card-border)]">
                                            <tr>
                                                <td colSpan={3} className="px-4 py-4 text-right font-bold text-foreground">
                                                    المجموع الكلي
                                                </td>
                                                <td className="px-4 py-4 text-foreground font-mono font-bold text-xl">
                                                    {formatIQD(Number(order.price))}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                                    <div className="w-8 h-8 rounded-xl bg-[var(--pastel-mint)] flex items-center justify-center">
                                        <FileText className="h-4 w-4 text-teal-900" />
                                    </div>
                                    ملاحظات
                                </h3>
                                {isEditing ? (
                                    <textarea
                                        value={(displayValue("notes") || "") as string}
                                        onChange={(e) => updateFormData("notes", e.target.value)}
                                        placeholder="أضف ملاحظات داخلية هنا..."
                                        rows={4}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                                    />
                                ) : (
                                    <p className="text-foreground bg-[var(--background)] p-4 rounded-xl border border-[var(--card-border)] min-h-[80px]">
                                        {order.notes || "لا توجد ملاحظات"}
                                    </p>
                                )}
                            </div>

                            {/* Rejection Reason (if rejected) */}
                            {order.status === "rejected" && order.rejection_reason && (
                                <div className="space-y-2 border border-[var(--pastel-pink)] bg-[var(--pastel-pink-light)] p-4 rounded-xl">
                                    <h3 className="text-sm font-bold text-rose-900">سبب الرفض</h3>
                                    <p className="text-rose-800">{order.rejection_reason}</p>
                                </div>
                            )}
                        </div>
                    </>
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
