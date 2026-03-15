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
    normalizeIraqiPhone,
    type OrderFormData,
    type ValidationErrors,
} from "@/lib/order-utils";
import type { OrderItem } from "@/lib/supabase";
import { toast } from "sonner";
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
    Upload,
    Image as ImageIcon,
    Loader2,
    Sparkles,
    RefreshCw,
    XCircle,
} from "lucide-react";
import { ProductPicker } from "./product-picker";
import { DiscountPresetSelector } from "./discount-preset-selector";
import { BulkUploadModal } from "./bulk-upload-modal";

// TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
);

interface CreateOrderModalProps {
    open: boolean;
    onClose: () => void;
    onCreate: (orderData: any) => Promise<any>;
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
        internal_notes: initialData?.internal_notes || "",
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
    const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [showBulkUpload, setShowBulkUpload] = useState(false);

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
                internal_notes: initialData.internal_notes || "",
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
            setIncludeDeliveryFee(false);
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
            internal_notes: "",
            delivery_slot: undefined,
            payment_status: "cod",
            source: "whatsapp",
            order_id: "",
        });
        setErrors({});
        setDiscount(0);
        setDeliveryFee(5000);
        setIncludeDeliveryFee(false);
        setOrderIdStatus("idle");
        setEditingPriceIndex(null);
        onClose();
    };

    const handleOrderIdChange = (value: string) => {
        updateField("order_id", value);
    };

    useEffect(() => {
        const id = formData.order_id?.trim();
        if (!checkOrderIdExists || !id) {
            setOrderIdStatus("idle");
            return;
        }

        setOrderIdStatus("checking");
        setIsCheckingId(true);

        const timer = setTimeout(async () => {
            const exists = await checkOrderIdExists(id);
            setOrderIdStatus(exists ? "exists" : "available");
            setIsCheckingId(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [formData.order_id, checkOrderIdExists]);

    const updateField = (field: string, value: string | number | boolean | undefined | string[]) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const updateItem = (index: number, field: keyof OrderItem, value: string | number) => {
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

    const handleClearFields = () => {
        setFormData({
            customer_name: "",
            phone: "",
            secondary_phone: "",
            city: "",
            address_details: "",
            items: [],
            notes: "",
            internal_notes: "",
            delivery_slot: undefined,
            payment_status: "cod",
            source: orderType === "shop" ? "shop" : "whatsapp",
            order_id: "",
        });
        setUploadedImage(null);
        setDiscount(0);
        setDeliveryFee(5000);
        setIncludeDeliveryFee(false);
    };

    const handleRemoveImage = () => {
        setUploadedImage(null);
        // Reset the file input
        const fileInput = document.getElementById('chat-image-upload') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('الرجاء اختيار صورة');
            return;
        }

        // Show preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setUploadedImage(reader.result as string);
        };
        reader.readAsDataURL(file);

        // Analyze with Gemini
        setIsAnalyzingImage(true);
        try {
            const formData = new FormData();
            formData.append("image", file);

            const response = await fetch("/api/orders/analyze-image", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (result.success && result.data) {
                // Auto-fill the form with extracted data
                const hasData = result.data.customer_name || result.data.phone || result.data.city || result.data.address;

                if (hasData) {
                    setFormData((prev) => ({
                        ...prev,
                        customer_name: result.data.customer_name || prev.customer_name,
                        phone: result.data.phone || prev.phone,
                        secondary_phone: result.data.secondary_phone || prev.secondary_phone,
                        city: result.data.city || prev.city,
                        address_details: result.data.address || prev.address_details,
                    }));

                    // Show success message
                    console.log('✅ تم استخراج البيانات بنجاح:', result.data);
                } else {
                    console.warn('⚠️ لم يتم العثور على بيانات في الصورة');
                    alert('لم يتم العثور على بيانات في الصورة. الرجاء التحقق من الصورة والمحاولة مرة أخرى.');
                }
            } else {
                console.error("Failed to analyze image:", result.error, result.details);
                alert(`حدث خطأ أثناء تحليل الصورة: ${result.error || 'خطأ غير معروف'}`);
            }
        } catch (error) {
            console.error("Error uploading image:", error);
            alert('حدث خطأ أثناء رفع الصورة. الرجاء المحاولة مرة أخرى.');
        } finally {
            setIsAnalyzingImage(false);
        }
    };

    const handleCreate = async () => {
        // Normalize phones before validation
        const normalizedPhone = normalizeIraqiPhone(formData.phone);
        const normalizedSecondary = normalizeIraqiPhone(formData.secondary_phone || '');
        // Update form with normalized values
        setFormData(prev => ({ ...prev, phone: normalizedPhone, secondary_phone: normalizedSecondary || prev.secondary_phone }));

        const newErrors: ValidationErrors = {};

        if (orderIdStatus === "exists") {
            newErrors.order_id = "رقم الطلب هذا موجود مسبقاً";
        } else if (orderIdStatus === "checking") {
            newErrors.order_id = "جاري التحقق من رقم الطلب...";
        }

        if (!formData.customer_name.trim()) {
            newErrors.customer_name = "اسم العميل مطلوب";
        }
        // Phone required only for delivery orders
        if (orderType === "delivery") {
            if (!normalizedPhone.trim()) {
                newErrors.phone = "رقم الهاتف مطلوب";
            } else if (!/^07\d{8,9}$/.test(normalizedPhone.trim())) {
                newErrors.phone = "رقم الهاتف غير صحيح";
            }
        } else if (normalizedPhone.trim() && !/^07\d{8,9}$/.test(normalizedPhone.trim())) {
            // For shop orders, validate phone only if provided
            newErrors.phone = "رقم الهاتف غير صحيح";
        }
        if (formData.items.length === 0) {
            newErrors.items = "أضف منتج واحد على الأقل";
        }

        if (orderType === "delivery") {
            if (!formData.city) {
                newErrors.city = "المحافظة مطلوبة";
            }
            if (!formData.address_details?.trim()) {
                newErrors.address_details = "العنوان مطلوب";
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);

            // Autoscroll to the first error
            setTimeout(() => {
                const firstErrorField = document.querySelector('.field-error, [data-error="true"]');
                if (firstErrorField) {
                    firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Trigger shake animation by adding then removing a class if needed, 
                    // or just rely on the class we already have.
                }
            }, 100);
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
                phone: normalizedPhone,
                secondary_phone: normalizedSecondary || undefined,
                price: finalPrice,
                discount_amount: discount,
                delivery_fee: actualDeliveryFee,
                is_shop_order: orderType === "shop",
                status: orderType === "shop" ? "completed" : "confirmed",
                notes: orderType === "shop" ? `[طلب محل] ${formData.notes || ''}`.trim() : formData.notes,
                internal_notes: formData.internal_notes || "",
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
                        <DialogTitle className="flex items-center justify-between text-foreground">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                                    <Package className="h-4 w-4 text-green-700" />
                                </div>
                                <div>
                                    <span className="text-lg font-bold">طلب جديد</span>
                                    <p className="text-xs font-normal text-muted mt-0.5">أضف تفاصيل الطلب والمنتجات</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleClearFields}
                                    className="px-2 py-1 flex items-center gap-1 text-[10px] font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 transition-all opacity-70 hover:opacity-100"
                                    title="مسح جميع الحقول"
                                >
                                    <RefreshCw className="h-3 w-3" />
                                    مسح
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOrderType("delivery");
                                        setFormData(prev => ({
                                            ...prev,
                                            customer_name: "علي-تيست",
                                            phone: "07802301677",
                                            secondary_phone: "07811262261",
                                            city: "واسط",
                                            address_details: "العزيزية - الجمعية",
                                            source: "tiktok",
                                            is_test: true,
                                            items: prev.items.length > 0 ? prev.items : [{ name: "Test Product", price: 15000, quantity: 1 }]
                                        }));

                                        }}
                                        className="px-2 py-1 flex items-center gap-1 text-[10px] font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 transition-all opacity-50 hover:opacity-100 shadow-sm"
                                        title="تعبئة بيانات تجريبية"
                                    >
                                        Test
                                    </button>
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

                        {/* AI Image Upload - Smart Order Entry */}
                        <div className="space-y-2">
                            <Label className="text-xs text-muted flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-purple-600" />
                                رفع صورة المحادثة (اختياري)
                            </Label>
                            <div className="relative">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                    id="chat-image-upload"
                                    disabled={isAnalyzingImage}
                                />
                                <label
                                    htmlFor="chat-image-upload"
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                                        isAnalyzingImage
                                            ? "border-purple-300 bg-purple-50/50 cursor-wait"
                                            : uploadedImage
                                                ? "border-purple-400 bg-purple-50"
                                                : "border-gray-300 bg-gray-50/50 hover:border-purple-400 hover:bg-purple-50/50"
                                    )}
                                >
                                    {isAnalyzingImage ? (
                                        <>
                                            <Loader2 className="h-8 w-8 text-purple-600 animate-spin" />
                                            <div className="text-center">
                                                <p className="text-sm font-semibold text-purple-700">جاري تحليل الصورة...</p>
                                                <p className="text-xs text-purple-600 mt-1">الذكاء الاصطناعي يستخرج البيانات</p>
                                            </div>
                                        </>
                                    ) : uploadedImage ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    handleRemoveImage();
                                                }}
                                                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-md z-10"
                                                title="إزالة الصورة"
                                            >
                                                <XCircle className="h-4 w-4" />
                                            </button>
                                            <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-purple-300">
                                                <img src={uploadedImage} alt="Uploaded" className="w-full h-full object-cover" />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-semibold text-purple-700 flex items-center gap-1.5 justify-center">
                                                    <Check className="h-4 w-4" />
                                                    تم التحليل بنجاح
                                                </p>
                                                <p className="text-xs text-purple-600 mt-1">اضغط لرفع صورة أخرى</p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-12 h-12 rounded-xl bg-linear-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                                                <ImageIcon className="h-6 w-6 text-purple-600" />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 justify-center">
                                                    <Upload className="h-4 w-4" />
                                                    ارفع صورة المحادثة
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">من Instagram أو TikTok - سيتم استخراج الرقم والعنوان تلقائياً</p>
                                            </div>
                                        </>
                                    )}
                                </label>
                            </div>
                            <p className="text-xs text-muted bg-purple-50/50 px-3 py-2 rounded-lg flex items-center gap-1.5">
                                <Sparkles className="h-3 w-3 text-purple-600 shrink-0" />
                                <span>الذكاء الاصطناعي سيستخرج رقم الهاتف والعنوان من الصورة تلقائياً</span>
                            </p>
                            <button
                                type="button"
                                onClick={() => setShowBulkUpload(true)}
                                className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1 hover:underline transition-all"
                            >
                                <Package className="h-3 w-3" />
                                رفع طلبات متعددة دفعة واحدة
                            </button>
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
                                            "h-10 rounded-lg border-[var(--card-border)] bg-[var(--background)] transition-all",
                                            errors.customer_name && "field-error animate-shake"
                                        )}
                                        data-error={!!errors.customer_name}
                                    />
                                    {errors.customer_name && <p className="field-error-text">{errors.customer_name}</p>}
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
                                        onBlur={() => {
                                            if (formData.phone) {
                                                updateField("phone", normalizeIraqiPhone(formData.phone));
                                            }
                                        }}
                                        placeholder="07XXXXXXXX / +964 / ٠٧..."
                                        dir="ltr"
                                        inputMode="tel"
                                        autoComplete="tel"
                                        className={cn(
                                            "h-10 rounded-lg border-[var(--card-border)] bg-[var(--background)] font-mono transition-all",
                                            errors.phone && "field-error animate-shake"
                                        )}
                                        data-error={!!errors.phone}
                                    />
                                    {errors.phone && <p className="field-error-text">{errors.phone}</p>}
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
                                        onBlur={() => {
                                            if (formData.secondary_phone) {
                                                updateField("secondary_phone", normalizeIraqiPhone(formData.secondary_phone));
                                            }
                                        }}
                                        placeholder="07XXXXXXXX / +964 / ٠٧..."
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
                                                    "h-10 w-full appearance-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 pr-8 text-sm font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-[var(--card-border)]",
                                                    !formData.city && "text-muted-foreground",
                                                    errors.city && "field-error animate-shake"
                                                )}
                                                data-error={!!errors.city}
                                            >
                                                <option value="" disabled>اختر المحافظة...</option>
                                                {governorates.map((gov) => (
                                                    <option key={gov.code} value={gov.nameAr}>
                                                        {gov.nameAr}
                                                    </option>
                                                ))}
                                            </select>
                                            {errors.city && <p className="field-error-text">{errors.city}</p>}
                                            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
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
                                        className={cn(
                                            "rounded-lg border-[var(--card-border)] bg-[var(--background)] resize-none transition-all",
                                            errors.address_details && "field-error animate-shake"
                                        )}
                                        data-error={!!errors.address_details}
                                    />
                                    {errors.address_details && <p className="field-error-text">{errors.address_details}</p>}
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
                                        className={cn(
                                            "mt-2 text-xs text-green-600 hover:underline transition-all p-2 rounded-md",
                                            errors.items && "bg-red-50 text-red-600 animate-shake"
                                        )}
                                        data-error={!!errors.items}
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
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min="0"
                                                value={total}
                                                onChange={(e) => {
                                                    const newTotal = parseFloat(e.target.value) || 0;
                                                    const newDiscount = Math.max(0, subtotal + actualDeliveryFee - newTotal);
                                                    setDiscount(newDiscount);
                                                }}
                                                className="w-28 h-8 rounded-lg border-[var(--card-border)] bg-white text-sm font-mono text-right font-bold text-green-700"
                                            />
                                            <span className="text-xs text-muted">IQD</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Notes - Two Column Layout */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* Order Notes - Shown on invoice */}
                            <div className="rounded-xl border border-amber-200 overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
                                    <FileText className="h-3.5 w-3.5 text-amber-600" />
                                    <div>
                                        <span className="text-xs font-semibold text-amber-900">Order Notes</span>
                                        <span className="text-[10px] text-amber-600 mr-1">(Shown on invoice)</span>
                                    </div>
                                </div>
                                <div className="p-3">
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => updateField("notes", e.target.value)}
                                        placeholder="Notes visible to customer on invoice..."
                                        rows={2}
                                        className="w-full px-3 py-2 bg-amber-50/50 border border-amber-200 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                                    />
                                </div>
                            </div>

                            {/* Internal Notes - Employees only */}
                            <div className="rounded-xl border border-blue-200 overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200">
                                    <FileText className="h-3.5 w-3.5 text-blue-600" />
                                    <div>
                                        <span className="text-xs font-semibold text-blue-900">Internal Notes</span>
                                        <span className="text-[10px] text-blue-600 mr-1">(Employees only)</span>
                                    </div>
                                </div>
                                <div className="p-3">
                                    <textarea
                                        value={formData.internal_notes || ""}
                                        onChange={(e) => updateField("internal_notes", e.target.value)}
                                        placeholder="ملاحظات داخلية..."
                                        rows={2}
                                        className="w-full px-3 py-2 bg-blue-50/50 border border-blue-200 rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                                    />
                                </div>
                            </div>
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

            {/* Bulk Upload Modal */}
            <BulkUploadModal
                open={showBulkUpload}
                onClose={() => setShowBulkUpload(false)}
                onCreate={async (orders) => {
                    let successCount = 0;
                    let failCount = 0;

                    // Create all orders with per-order error handling
                    for (const orderData of orders) {
                        try {
                            const result = await onCreate({
                                customer_name: orderData.customer_name,
                                phone: orderData.phone,
                                secondary_phone: orderData.secondary_phone || undefined,
                                city: orderData.city,
                                address_details: orderData.address,
                                items: [],
                                notes: '',
                                internal_notes: `[AI رفع مجمع] تم استخراج البيانات تلقائياً`,
                                price: 0,
                                discount_amount: 0,
                                delivery_fee: 0,
                                is_shop_order: false,
                                status: 'pending',
                                source: 'whatsapp',
                            });
                            
                            if (result?.success) {
                                successCount++;
                            } else {
                                failCount++;
                                console.error(`Failed to create order for ${orderData.customer_name}:`, result?.error);
                            }
                        } catch (err) {
                            failCount++;
                            console.error(`Error creating order for ${orderData.customer_name}:`, err);
                        }
                    }
                    
                    if (failCount === 0) {
                        toast.success(`✅ تم إنشاء ${successCount} طلب بنجاح!`);
                    } else if (successCount > 0) {
                        toast.warning(`تم إنشاء ${successCount} طلب بنجاح، وفشل ${failCount} طلب.`);
                    } else {
                        toast.error(`❌ فشل إنشاء جميع الطلبات (${failCount}).`);
                    }
                }}
            />
        </>
    );
}
