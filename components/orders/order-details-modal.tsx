"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatIQD, formatDate, generateWhatsAppLink, getStatusLabel } from "@/lib/utils";
import type { Order } from "@/lib/supabase";
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
} from "lucide-react";

interface OrderDetailsModalProps {
    order: Order | null;
    open: boolean;
    onClose: () => void;
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
}

export function OrderDetailsModal({
    order,
    open,
    onClose,
    onUpdate,
}: OrderDetailsModalProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<Partial<Order>>({});

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

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <DialogTitle className="font-mono">{order.order_id}</DialogTitle>
                            <Badge variant={order.status}>{getStatusLabel(order.status)}</Badge>
                        </div>
                        {!isEditing ? (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleEdit}
                                className="gap-2"
                            >
                                <Edit2 className="h-4 w-4" />
                                تعديل
                            </Button>
                        ) : null}
                    </div>
                    <DialogDescription>
                        <div className="flex items-center gap-2 text-zinc-400">
                            <Calendar className="h-4 w-4" />
                            {formatDate(order.created_at)}
                        </div>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Customer Information */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <User className="h-5 w-5 text-primary" />
                            معلومات العميل
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>اسم العميل</Label>
                                {isEditing ? (
                                    <Input
                                        value={displayValue("customer_name") as string}
                                        onChange={(e) => updateFormData("customer_name", e.target.value)}
                                    />
                                ) : (
                                    <p className="text-foreground font-medium">{order.customer_name}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>رقم الهاتف</Label>
                                <div className="flex items-center gap-2">
                                    {isEditing ? (
                                        <Input
                                            value={displayValue("phone") as string}
                                            onChange={(e) => updateFormData("phone", e.target.value)}
                                            dir="ltr"
                                            className="flex-1"
                                        />
                                    ) : (
                                        <p className="text-foreground font-mono flex-1" dir="ltr">
                                            {order.phone}
                                        </p>
                                    )}
                                    <Button
                                        size="icon"
                                        variant="primary"
                                        onClick={handleWhatsApp}
                                        title="فتح واتساب"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>المدينة</Label>
                                {isEditing ? (
                                    <Input
                                        value={(displayValue("city") || "") as string}
                                        onChange={(e) => updateFormData("city", e.target.value)}
                                    />
                                ) : (
                                    <p className="text-foreground">{order.city || "-"}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>كود المحافظة</Label>
                                {isEditing ? (
                                    <Input
                                        value={(displayValue("governorate_code") || "") as string}
                                        onChange={(e) => updateFormData("governorate_code", e.target.value)}
                                    />
                                ) : (
                                    <p className="text-foreground">{order.governorate_code || "-"}</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                العنوان الكامل
                            </Label>
                            {isEditing ? (
                                <Textarea
                                    value={(displayValue("address_details") || "") as string}
                                    onChange={(e) => updateFormData("address_details", e.target.value)}
                                    rows={3}
                                />
                            ) : (
                                <p className="text-foreground bg-surface p-3 rounded-lg">
                                    {order.address_details || "لم يتم تحديد العنوان"}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Order Items */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Package className="h-5 w-5 text-primary" />
                            العناصر المطلوبة
                        </h3>
                        <div className="border border-border rounded-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-surface border-b border-border">
                                    <tr>
                                        <th className="text-right px-4 py-3 text-sm font-semibold text-zinc-300">
                                            المنتج
                                        </th>
                                        <th className="text-right px-4 py-3 text-sm font-semibold text-zinc-300">
                                            الكمية
                                        </th>
                                        <th className="text-right px-4 py-3 text-sm font-semibold text-zinc-300">
                                            السعر
                                        </th>
                                        <th className="text-right px-4 py-3 text-sm font-semibold text-zinc-300">
                                            المجموع
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items && order.items.length > 0 ? (
                                        order.items.map((item, index) => (
                                            <tr key={index} className="border-b border-border last:border-0">
                                                <td className="px-4 py-3 text-foreground">{item.name}</td>
                                                <td className="px-4 py-3 text-foreground font-mono">
                                                    {item.quantity}×
                                                </td>
                                                <td className="px-4 py-3 text-financial font-mono">
                                                    {formatIQD(item.price)}
                                                </td>
                                                <td className="px-4 py-3 text-financial font-mono font-semibold">
                                                    {formatIQD(item.price * item.quantity)}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                                                لا توجد عناصر
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot className="bg-surface border-t border-border">
                                    <tr>
                                        <td colSpan={3} className="px-4 py-3 text-right font-semibold text-foreground">
                                            المجموع الكلي
                                        </td>
                                        <td className="px-4 py-3 text-financial font-mono font-bold text-lg">
                                            {formatIQD(Number(order.price))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">ملاحظات</h3>
                        {isEditing ? (
                            <Textarea
                                value={(displayValue("notes") || "") as string}
                                onChange={(e) => updateFormData("notes", e.target.value)}
                                placeholder="أضف ملاحظات داخلية هنا..."
                                rows={4}
                            />
                        ) : (
                            <p className="text-foreground bg-surface p-3 rounded-lg min-h-[80px]">
                                {order.notes || "لا توجد ملاحظات"}
                            </p>
                        )}
                    </div>

                    {/* Rejection Reason (if rejected) */}
                    {order.status === "rejected" && order.rejection_reason && (
                        <div className="space-y-2 border border-destructive/20 bg-destructive/5 p-4 rounded-lg">
                            <h3 className="text-sm font-semibold text-destructive">سبب الرفض</h3>
                            <p className="text-foreground">{order.rejection_reason}</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {isEditing ? (
                        <>
                            <Button variant="ghost" onClick={handleCancel} disabled={isSaving}>
                                <X className="h-4 w-4 mr-2" />
                                إلغاء
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleSave}
                                isLoading={isSaving}
                                disabled={isSaving}
                            >
                                <Save className="h-4 w-4 mr-2" />
                                حفظ التعديلات
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" onClick={onClose}>
                                إغلاق
                            </Button>
                            <Button variant="primary" onClick={handleWhatsApp}>
                                <MessageCircle className="h-4 w-4 mr-2" />
                                فتح واتساب
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
