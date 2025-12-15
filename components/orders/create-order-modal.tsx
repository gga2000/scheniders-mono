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
import { formatIQD, generateWhatsAppLink } from "@/lib/utils";
import {
    generateOrderId,
    validateOrderForm,
    calculateTotal,
    formatPhoneToStandard,
    type OrderFormData,
    type ValidationErrors,
} from "@/lib/order-utils";
import type { OrderItem } from "@/lib/supabase";
import {
    User,
    Phone,
    MapPin,
    Package,
    Plus,
    Trash2,
    Save,
    X,
} from "lucide-react";

interface CreateOrderModalProps {
    open: boolean;
    onClose: () => void;
    onCreate: (orderData: any) => Promise<{ success: boolean; error?: string }>;
}

export function CreateOrderModal({
    open,
    onClose,
    onCreate,
}: CreateOrderModalProps) {
    const [formData, setFormData] = useState<OrderFormData>({
        customer_name: "",
        phone: "",
        city: "",
        governorate_code: "",
        address_details: "",
        items: [{ name: "", quantity: 1, price: 0 }],
        notes: "",
    });

    const [errors, setErrors] = useState<ValidationErrors>({});
    const [isCreating, setIsCreating] = useState(false);

    const handleClose = () => {
        // Reset form
        setFormData({
            customer_name: "",
            phone: "",
            city: "",
            governorate_code: "",
            address_details: "",
            items: [{ name: "", quantity: 1, price: 0 }],
            notes: "",
        });
        setErrors({});
        onClose();
    };

    const updateField = (field: keyof OrderFormData, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        // Clear error for this field
        if (errors[field]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const updateItem = (index: number, field: keyof OrderItem, value: any) => {
        setFormData((prev) => ({
            ...prev,
            items: prev.items.map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            ),
        }));
        // Clear items error
        if (errors.items) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors.items;
                return newErrors;
            });
        }
    };

    const addItem = () => {
        setFormData((prev) => ({
            ...prev,
            items: [...prev.items, { name: "", quantity: 1, price: 0 }],
        }));
    };

    const removeItem = (index: number) => {
        if (formData.items.length > 1) {
            setFormData((prev) => ({
                ...prev,
                items: prev.items.filter((_, i) => i !== index),
            }));
        }
    };

    const handleCreate = async () => {
        // Validate form
        const validationErrors = validateOrderForm(formData);

        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }

        setIsCreating(true);

        // Prepare order data
        const orderData = {
            order_id: generateOrderId(),
            customer_name: formData.customer_name.trim(),
            phone: formatPhoneToStandard(formData.phone),
            city: formData.city?.trim() || null,
            governorate_code: formData.governorate_code?.trim() || null,
            address_details: formData.address_details?.trim() || null,
            items: formData.items,
            price: calculateTotal(formData.items),
            status: "new" as const,
            whatsapp_link: generateWhatsAppLink(
                formatPhoneToStandard(formData.phone),
                `مرحباً ${formData.customer_name}، شكراً لطلبك`
            ),
            notes: formData.notes?.trim() || null,
        };

        const result = await onCreate(orderData);

        if (result.success) {
            handleClose();
        } else {
            alert(`فشل إنشاء الطلب: ${result.error}`);
        }

        setIsCreating(false);
    };

    const total = calculateTotal(formData.items);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="h-6 w-6 text-primary" />
                        طلب جديد
                    </DialogTitle>
                    <DialogDescription>
                        أضف طلب جديد مع تفاصيل العميل والمنتجات
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                    {/* Customer Information */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <User className="h-5 w-5 text-primary" />
                            معلومات العميل
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>اسم العميل *</Label>
                                <Input
                                    value={formData.customer_name}
                                    onChange={(e) => updateField("customer_name", e.target.value)}
                                    placeholder="مثال: أحمد محمد"
                                    className={errors.customer_name ? "border-destructive" : ""}
                                />
                                {errors.customer_name && (
                                    <p className="text-sm text-destructive">{errors.customer_name}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Phone className="h-4 w-4" />
                                    رقم الهاتف *
                                </Label>
                                <Input
                                    value={formData.phone}
                                    onChange={(e) => updateField("phone", e.target.value)}
                                    placeholder="07XXXXXXXX"
                                    dir="ltr"
                                    className={errors.phone ? "border-destructive" : ""}
                                />
                                {errors.phone && (
                                    <p className="text-sm text-destructive">{errors.phone}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>المدينة</Label>
                                <Input
                                    value={formData.city}
                                    onChange={(e) => updateField("city", e.target.value)}
                                    placeholder="مثال: بغداد"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>كود المحافظة</Label>
                                <Input
                                    value={formData.governorate_code}
                                    onChange={(e) => updateField("governorate_code", e.target.value)}
                                    placeholder="مثال: BG"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                العنوان الكامل
                            </Label>
                            <Textarea
                                value={formData.address_details}
                                onChange={(e) => updateField("address_details", e.target.value)}
                                placeholder="أدخل العنوان التفصيلي هنا..."
                                rows={3}
                            />
                        </div>
                    </div>

                    {/* Items Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Package className="h-5 w-5 text-primary" />
                                المنتجات
                            </h3>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={addItem}
                                className="gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                إضافة منتج
                            </Button>
                        </div>

                        {errors.items && (
                            <p className="text-sm text-destructive">{errors.items}</p>
                        )}

                        <div className="space-y-3">
                            {formData.items.map((item, index) => (
                                <div
                                    key={index}
                                    className="flex items-end gap-3 p-4 border border-border rounded-lg bg-surface/50"
                                >
                                    <div className="flex-1 space-y-2">
                                        <Label className="text-xs">اسم المنتج</Label>
                                        <Input
                                            value={item.name}
                                            onChange={(e) => updateItem(index, "name", e.target.value)}
                                            placeholder="مثال: Dior Sauvage"
                                        />
                                    </div>

                                    <div className="w-24 space-y-2">
                                        <Label className="text-xs">الكمية</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={item.quantity}
                                            onChange={(e) =>
                                                updateItem(index, "quantity", parseInt(e.target.value) || 1)
                                            }
                                        />
                                    </div>

                                    <div className="w-32 space-y-2">
                                        <Label className="text-xs">السعر (IQD)</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            value={item.price}
                                            onChange={(e) =>
                                                updateItem(index, "price", parseFloat(e.target.value) || 0)
                                            }
                                        />
                                    </div>

                                    <div className="w-32 space-y-2">
                                        <Label className="text-xs">المجموع</Label>
                                        <div className="h-10 flex items-center font-mono text-financial font-semibold">
                                            {formatIQD(item.price * item.quantity)}
                                        </div>
                                    </div>

                                    {formData.items.length > 1 && (
                                        <Button
                                            size="icon"
                                            variant="destructive"
                                            onClick={() => removeItem(index)}
                                            title="حذف المنتج"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Total */}
                        <div className="flex justify-end items-center gap-4 p-4 bg-surface border border-border rounded-lg">
                            <span className="text-lg font-semibold">المجموع الكلي:</span>
                            <span className="text-2xl font-mono font-bold text-financial">
                                {formatIQD(total)}
                            </span>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">ملاحظات</h3>
                        <Textarea
                            value={formData.notes}
                            onChange={(e) => updateField("notes", e.target.value)}
                            placeholder="أضف ملاحظات داخلية هنا..."
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={handleClose} disabled={isCreating}>
                        <X className="h-4 w-4 mr-2" />
                        إلغاء
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleCreate}
                        isLoading={isCreating}
                        disabled={isCreating}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        إنشاء الطلب
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
