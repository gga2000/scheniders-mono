"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatIQD, cn } from "@/lib/utils";
import { getAllGovernorateCodes } from "@/lib/address-validator";
import {
    calculateTotal,
    type OrderFormData,
    type ValidationErrors,
} from "@/lib/order-utils";
import type { OrderItem } from "@/lib/supabase";
import {
    User,
    Phone,
    MapPin,
    Package,
    Trash2,
    Save,
    X,
    MessageCircle,
    Instagram,
    FileText,
    Hash,
    AlertTriangle,
    Check,
    Store,
    Truck,
    MoreHorizontal,
    Pencil,
} from "lucide-react";
import { ProductPicker } from "./product-picker";
import { DiscountPresetSelector } from "./discount-preset-selector";

// TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
);

interface CreateOrderModalProps {
    open: boolean;
    onClose: () => void;
    onCreate: (orderData: any) => Promise<{ success: boolean; error?: string }>;
    checkOrderIdExists?: (orderId: string) => Promise<boolean>;
    initialData?: Partial<OrderFormData & { secondary_phone?: string; source?: string; order_id?: string }>;
}

const ORDER_SOURCES = [
    { id: "whatsapp", label: "واتساب", icon: MessageCircle, color: "text-green-600" },
    { id: "meta", label: "Meta", icon: Instagram, color: "text-pink-600" },
    { id: "tiktok", label: "TikTok", icon: TikTokIcon, color: "text-gray-800" },
    { id: "shop", label: "المحل", icon: Store, color: "text-amber-600" },
    { id: "other", label: "أخرى", icon: MoreHorizontal, color: "text-gray-500" },
];

type OrderType = "delivery" | "shop";

export function CreateOrderModal({
    open,
    onClose,
    onCreate,
    checkOrderIdExists,
    initialData,
}: CreateOrderModalProps) {
    const [orderType, setOrderType] = useState<OrderType>("delivery");
    const [formData, setFormData] = useState<OrderFormData & { secondary_phone?: string; source?: string; order_id?: string }>({
        customer_name: initialData?.customer_name || "",
        phone: initialData?.phone || "",
        secondary_phone: initialData?.secondary_phone || "",
        city: initialData?.city || "",
        address_details: initialData?.address_details || "",
        items: initialData?.items || [],
        notes: initialData?.notes || "",
        delivery_slot: initialData?.delivery_slot,
        payment_status: initialData?.payment_status || "cod",
        source: initialData?.source || "whatsapp",
        order_id: "",
    });
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [isCreating, setIsCreating] = useState(false);
    const governorates = getAllGovernorateCodes();
    const [showProductPicker, setShowProductPicker] = useState(false);
    const [discount, setDiscount] = useState(0);
    const [orderIdStatus, setOrderIdStatus] = useState<"idle" | "checking" | "available" | "exists">("idle");
    const [isCheckingId, setIsCheckingId] = useState(false);
    const [deliveryFee, setDeliveryFee] = useState(5000);
    const [includeDeliveryFee, setIncludeDeliveryFee] = useState(false);
    const [editingPriceIndex, setEditingPriceIndex] = useState<number | null>(null);

    // Sync formData with initialData only when modal first opens
    useEffect(() => {
        if (open && initialData) {
            setFormData({
                customer_name: initialData.customer_name || "",
                phone: initialData.phone || "",
                secondary_phone: initialData.secondary_phone || "",
                city: initialData.city || "",
                address_details: initialData.address_details || "",
                items: initialData.items || [],
                notes: initialData.notes || "",
                delivery_slot: initialData.delivery_slot,
                payment_status: initialData.payment_status || "cod",
                source: initialData.source || "whatsapp",
                order_id: "",
            });
            // If items are pre-filled, calculate discount if any
            if (initialData.items && initialData.items.length > 0) {
                setDiscount(0); // Reset discount, user can set it manually
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]); // Only depend on 'open', not initialData, to prevent reset when parent re-renders

    // Handle order type change
    const handleOrderTypeChange = (type: OrderType) => {
        setOrderType(type);
        if (type === "shop") {
            // Shop orders: auto-set source, disable delivery fee
            updateField("source", "shop");
            setIncludeDeliveryFee(false);
        } else {
            updateField("source", "whatsapp");
            setIncludeDeliveryFee(true);
            setDiscount(0);
        }
    };

    const handleClose = () => {
        if (isCreating) return;
        setOrderType("delivery");
        setFormData({
            customer_name: "",
            phone: "",
            secondary_phone: "",
            city: "",
            address_details: "",
            items: [],
            notes: "",
            delivery_slot: undefined,
            payment_status: "cod",
            source: "whatsapp",
            order_id: "",
        });
        setErrors({});
        setDiscount(0);
        setDeliveryFee(5000);
        setIncludeDeliveryFee(true);
        setOrderIdStatus("idle");
        setEditingPriceIndex(null);
        onClose();
    };

    const handleOrderIdChange = async (value: string) => {
        updateField("order_id", value);
        setOrderIdStatus("idle");

        // Only check if user entered something
        if (value.trim() && checkOrderIdExists) {
            setIsCheckingId(true);
            setOrderIdStatus("checking");
            const exists = await checkOrderIdExists(value.trim());
            setOrderIdStatus(exists ? "exists" : "available");
            setIsCheckingId(false);
        }
    };

    const updateField = (field: string, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const updateItem = (index: number, field: keyof OrderItem, value: any) => {
        setFormData((prev) => {
            const newItems = [...prev.items];
            newItems[index] = { ...newItems[index], [field]: value };
            return { ...prev, items: newItems };
        });
    };

    const removeItem = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index),
        }));
    };

    const handleProductSelect = (product: { name: string; price: number; quantity: number; image_url?: string }) => {
        setFormData((prev) => ({
            ...prev,
            items: [...prev.items, product],
        }));
    };

    const handleCreate = async () => {
        const newErrors: ValidationErrors = {};

        if (!formData.customer_name.trim()) {
            newErrors.customer_name = "اسم العميل مطلوب";
        }
        // Phone required only for delivery orders
        if (orderType === "delivery") {
            if (!formData.phone.trim()) {
                newErrors.phone = "رقم الهاتف مطلوب";
            } else if (!/^07\d{8,9}$/.test(formData.phone.trim())) {
                newErrors.phone = "رقم الهاتف غير صحيح";
            }
        } else if (formData.phone.trim() && !/^07\d{8,9}$/.test(formData.phone.trim())) {
            // For shop orders, validate phone only if provided
            newErrors.phone = "رقم الهاتف غير صحيح";
        }
        if (formData.items.length === 0) {
            newErrors.items = "أضف منتج واحد على الأقل";
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsCreating(true);
        try {

            // Calculate total price from items
            const itemsTotal = formData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const actualDeliveryFee = orderType === "shop" ? 0 : (includeDeliveryFee ? deliveryFee : 0);
            const finalPrice = Math.max(0, itemsTotal - discount + actualDeliveryFee);


            const result = await onCreate({
                ...formData,
                price: finalPrice,
                discount_amount: discount,
                delivery_fee: actualDeliveryFee,
                is_shop_order: orderType === "shop",
                status: orderType === "shop" ? "completed" : "new",
                notes: orderType === "shop" ? `[طلب محل] ${formData.notes || ''}`.trim() : formData.notes,
                items: formData.items.filter(item => item.name.trim()),
            });

            if (result.success) {
                handleClose();
            } else {
                setErrors({ items: result.error || "حدث خطأ" });
            }
        } catch {
            setErrors({ items: "حدث خطأ غير متوقع" });
        } finally {
            setIsCreating(false);
        }
    };

    const subtotal = calculateTotal(formData.items);
    const actualDeliveryFee = orderType === "shop" ? 0 : (includeDeliveryFee ? deliveryFee : 0);
    const total = Math.max(0, subtotal - discount + actualDeliveryFee);

    return (
        <>
            <Dialog open={open} onOpenChange={() => { if (!showProductPicker) handleClose(); }} modal={!showProductPicker}>
                <DialogContent className="max-w-2xl bg-white border border-[var(--card-border)] !rounded-2xl overflow-hidden p-0 create-order-modal">
                    {/* Header */}
                    <DialogHeader className="px-6 py-4 border-b border-[var(--card-border)] bg-[var(--background)]">
                        <DialogTitle className="flex items-center gap-3 text-foreground">
                            <div className="w-9 h-9 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                                <Package className="h-4 w-4 text-green-700" />
                            </div>
                            <div>
                                <span className="text-lg font-bold">طلب جديد</span>
                                <p className="text-xs font-normal text-muted mt-0.5">أضف تفاصيل الطلب والمنتجات</p>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
                        {/* Order Type Toggle */}
                        <div className="space-y-2">
                            <Label className="text-xs text-muted">نوع الطلب</Label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleOrderTypeChange("delivery")}
                                    className={cn(
                                        "flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all",
                                        orderType === "delivery"
                                            ? "border-green-500 bg-green-50 text-green-700 shadow-sm"
                                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                                    )}
                                >
                                    <Truck className="h-4 w-4" />
                                    طلب توصيل
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleOrderTypeChange("shop")}
                                    className={cn(
                                        "flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold transition-all",
                                        orderType === "shop"
                                            ? "border-amber-500 bg-amber-50 text-amber-700 shadow-sm"
                                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                                    )}
                                >
                                    <Store className="h-4 w-4" />
                                    طلب من المحل
                                </button>
                            </div>
                            {orderType === "shop" && (
                                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                    ✨ طلب المحل: رقم الهاتف اختياري، بدون رسوم توصيل
                                </p>
                            )}
                        </div>

                        {/* Optional Order ID */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted flex items-center gap-1">
                                <Hash className="h-3 w-3" />
                                رقم الطلب (اختياري)
                            </Label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-mono">#</span>
                                    <Input
                                        value={formData.order_id || ""}
                                        onChange={(e) => handleOrderIdChange(e.target.value)}
                                        placeholder="اترك فارغاً للإنشاء تلقائياً"
                                        dir="ltr"
                                        className={cn(
                                            "h-10 pl-7 rounded-lg font-mono",
                                            orderIdStatus === "exists"
                                                ? "border-red-300 bg-red-50"
                                                : orderIdStatus === "available"
                                                    ? "border-green-300 bg-green-50"
                                                    : "border-[var(--card-border)] bg-[var(--background)]"
                                        )}
                                    />
                                    {/* Status indicator */}
                                    {formData.order_id && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {isCheckingId ? (
                                                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                            ) : orderIdStatus === "available" ? (
                                                <Check className="w-4 h-4 text-green-600" />
                                            ) : orderIdStatus === "exists" ? (
                                                <AlertTriangle className="w-4 h-4 text-red-600" />
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {orderIdStatus === "exists" && (
                                <p className="text-xs text-red-500 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    رقم الطلب موجود مسبقاً
                                </p>
                            )}
                            {!formData.order_id && (
                                <p className="text-xs text-muted">سيتم إنشاء رقم تلقائي عند ترك هذا الحقل فارغاً</p>
                            )}
                        </div>

                        {/* Customer Information */}
                        <div className="space-y-4">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                <User className="h-4 w-4 text-muted" />
                                معلومات العميل
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Customer Name */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted">اسم العميل <span className="text-red-500">*</span></Label>
                                    <Input
                                        value={formData.customer_name}
                                        onChange={(e) => updateField("customer_name", e.target.value)}
                                        placeholder="أحمد محمد"
                                        inputMode="text"
                                        autoComplete="name"
                                        className={cn(
                                            "h-10 rounded-lg border-[var(--card-border)] bg-[var(--background)]",
                                            errors.customer_name && "border-red-300 bg-red-50"
                                        )}
                                    />
                                    {errors.customer_name && <p className="text-xs text-red-500">{errors.customer_name}</p>}
                                </div>

                                {/* Primary Phone */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        رقم الهاتف {orderType === "delivery" ? <span className="text-red-500">*</span> : "(اختياري)"}
                                    </Label>
                                    <Input
                                        value={formData.phone}
                                        onChange={(e) => updateField("phone", e.target.value)}
                                        placeholder="07XXXXXXXX"
                                        dir="ltr"
                                        inputMode="tel"
                                        autoComplete="tel"
                                        className={cn(
                                            "h-10 rounded-lg border-[var(--card-border)] bg-[var(--background)] font-mono",
                                            errors.phone && "border-red-300 bg-red-50"
                                        )}
                                    />
                                    {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                                </div>

                                {/* Secondary Phone */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        رقم إضافي (اختياري)
                                    </Label>
                                    <Input
                                        value={formData.secondary_phone || ""}
                                        onChange={(e) => updateField("secondary_phone", e.target.value)}
                                        placeholder="07XXXXXXXX"
                                        dir="ltr"
                                        inputMode="tel"
                                        autoComplete="tel"
                                        className="h-10 rounded-lg border-[var(--card-border)] bg-[var(--background)] font-mono"
                                    />
                                </div>

                                {/* Governorate (City) - Hidden for shop orders */}
                                {orderType === "delivery" && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted">المحافظة</Label>
                                        <div className="relative">
                                            <select
                                                value={formData.city}
                                                onChange={(e) => {
                                                    const selectedName = e.target.value;
                                                    updateField("city", selectedName);
                                                }}
                                                className={cn(
                                                    "h-10 w-full appearance-none rounded-lg border-[var(--card-border)] bg-[var(--background)] px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--card-border)]",
                                                    !formData.city && "text-muted-foreground"
                                                )}
                                            >
                                                <option value="" disabled>اختر المحافظة...</option>
                                                {governorates.map((gov) => (
                                                    <option key={gov.code} value={gov.nameAr}>
                                                        {gov.nameAr}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Address - Hidden for shop orders */}
                            {orderType === "delivery" && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        العنوان الكامل
                                    </Label>
                                    <Textarea
                                        value={formData.address_details}
                                        onChange={(e) => updateField("address_details", e.target.value)}
                                        placeholder="أدخل العنوان التفصيلي..."
                                        rows={2}
                                        className="rounded-lg border-[var(--card-border)] bg-[var(--background)] resize-none"
                                    />
                                </div>
                            )}

                            {/* Order Source */}
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted">مصدر الطلب</Label>
                                <div className="flex flex-wrap gap-2">
                                    {ORDER_SOURCES.map((source) => (
                                        <button
                                            key={source.id}
                                            type="button"
                                            onClick={() => updateField("source", source.id)}
                                            className={cn(
                                                "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                                                formData.source === source.id
                                                    ? "border-[var(--pastel-green-dark)] bg-[var(--pastel-green-light)] text-foreground"
                                                    : "border-[var(--card-border)] bg-white hover:bg-[var(--background)]"
                                            )}
                                        >
                                            <source.icon className={cn("h-3.5 w-3.5", source.color)} />
                                            {source.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Products */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <Package className="h-4 w-4 text-muted" />
                                    المنتجات
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setShowProductPicker(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-all"
                                >
                                    + إضافة منتج
                                </button>
                            </div>

                            {errors.items && (
                                <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{errors.items}</p>
                            )}

                            {formData.items.length === 0 ? (
                                <div className="text-center py-8 text-muted bg-[var(--background)] rounded-lg border border-dashed border-[var(--card-border)]">
                                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                    <p className="text-sm">لم تتم إضافة منتجات بعد</p>
                                    <button
                                        type="button"
                                        onClick={() => setShowProductPicker(true)}
                                        className="mt-2 text-xs text-green-600 hover:underline"
                                    >
                                        اضغط لإضافة منتج
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {formData.items.map((item, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center gap-3 p-3 bg-[var(--background)] border border-[var(--card-border)] rounded-lg"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                                                <Package className="w-5 h-5 text-purple-600" />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm text-foreground truncate">{item.name}</p>
                                                {editingPriceIndex === index ? (
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <Input
                                                            type="number"
                                                            value={item.price}
                                                            onChange={(e) => updateItem(index, "price", parseFloat(e.target.value) || 0)}
                                                            className="w-24 h-6 text-xs px-2 rounded border-green-300"
                                                            autoFocus
                                                            onBlur={() => setEditingPriceIndex(null)}
                                                            onKeyDown={(e) => e.key === "Enter" && setEditingPriceIndex(null)}
                                                        />
                                                        <span className="text-xs text-muted">× {item.quantity}</span>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingPriceIndex(index)}
                                                        className="text-xs text-muted hover:text-green-600 flex items-center gap-1 group"
                                                    >
                                                        {formatIQD(item.price)} × {item.quantity}
                                                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1 bg-white border border-[var(--card-border)] rounded-lg px-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateItem(index, "quantity", Math.max(1, item.quantity - 1))}
                                                        className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateItem(index, "quantity", item.quantity + 1)}
                                                        className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700"
                                                    >
                                                        +
                                                    </button>
                                                </div>

                                                <span className="text-sm font-bold text-foreground font-mono w-24 text-right">
                                                    {formatIQD(item.price * item.quantity)}
                                                </span>

                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(index)}
                                                    className="w-7 h-7 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-all"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Discount & Total */}
                            {formData.items.length > 0 && (
                                <div className="space-y-3 pt-3 border-t border-[var(--card-border)]">
                                    {/* Discount Preset Selector */}
                                    <DiscountPresetSelector
                                        items={formData.items}
                                        currentDiscount={discount}
                                        onDiscountChange={setDiscount}
                                    />

                                    {/* Subtotal */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted">المجموع الفرعي</span>
                                        <span className="text-sm font-mono font-medium">{formatIQD(subtotal)}</span>
                                    </div>

                                    {/* Manual Discount Input */}
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm text-muted">خصم مخصص</span>
                                        <Input
                                            type="number"
                                            min="0"
                                            value={discount}
                                            onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                                            className="w-28 h-8 rounded-lg border-[var(--card-border)] bg-white text-sm font-mono text-right"
                                            placeholder="0"
                                        />
                                    </div>

                                    {/* Delivery Fee - Only for delivery orders */}
                                    {orderType === "delivery" && (
                                        <div className="space-y-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                                            <div className="flex items-center justify-between">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={includeDeliveryFee}
                                                        onChange={(e) => setIncludeDeliveryFee(e.target.checked)}
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                                                    <span className="text-sm text-blue-800">رسوم التوصيل</span>
                                                </label>
                                                {includeDeliveryFee && (
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        value={deliveryFee}
                                                        onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                                                        className="w-24 h-7 rounded border-blue-200 bg-white text-xs font-mono text-right"
                                                    />
                                                )}
                                            </div>
                                            {includeDeliveryFee && (
                                                <p className="text-xs text-blue-600/70">سيتم إضافة {formatIQD(deliveryFee)} للمجموع</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Total */}
                                    <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
                                        <span className="text-sm font-semibold text-foreground">المجموع الكلي</span>
                                        <span className="text-lg font-bold font-mono text-green-700">{formatIQD(total)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                ملاحظات
                            </Label>
                            <Textarea
                                value={formData.notes}
                                onChange={(e) => updateField("notes", e.target.value)}
                                placeholder="ملاحظات داخلية..."
                                rows={2}
                                className="rounded-lg border-[var(--card-border)] bg-[var(--background)] resize-none"
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <DialogFooter className="flex items-center justify-end gap-3 px-6 py-4 bg-[var(--background)] border-t border-[var(--card-border)]">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isCreating}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors disabled:opacity-50"
                        >
                            <X className="h-4 w-4" />
                            إلغاء
                        </button>
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={isCreating}
                            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[var(--button-success)] hover:bg-[var(--button-success-hover)] rounded-xl shadow-md transition-all disabled:opacity-50"
                        >
                            {isCreating ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            إنشاء الطلب
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Product Picker */}
            <ProductPicker
                open={showProductPicker}
                onClose={() => setShowProductPicker(false)}
                onSelect={handleProductSelect}
            />
        </>
    );
}
