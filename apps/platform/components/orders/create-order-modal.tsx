"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui/dialog";
import { Input } from "@scheniders/ui/input";
import { Textarea } from "@scheniders/ui/textarea";
import { Label } from "@scheniders/ui/label";
import { formatIQD, cn } from "@/lib/utils";
import { toWholeIqd } from "@/lib/order-money";
import { getAllGovernorateCodes } from "@/lib/address-validator";
import {
    calculateTotal,
    normalizeIraqiPhone,
    type OrderFormData,
    type ValidationErrors,
} from "@/lib/order-utils";
import type { OrderItem } from "@/lib/supabase";
import type { CreateOrderInput, CreateOrderResult, OrderSource } from "@/types/order";
import { useAuth } from "@/components/auth/auth-provider";
import { checkOrderLimitsAction } from "@/app/actions/orders";
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
    Banknote,
    CreditCard,
    Sun,
    CloudSun,
    Moon,
    Clock,
    Ban,
} from "lucide-react";
import type { BlacklistEntry } from "@/hooks/use-order-auxiliary";
import { OrderCustomerRiskPanel } from "./order-customer-risk-panel";
import { ProductPicker } from "./product-picker";
import { DiscountPresetSelector } from "./discount-preset-selector";
import { BulkUploadModal } from "./bulk-upload-modal";
import { DateTimePicker } from "@scheniders/ui/datetime-picker";

// TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
);

/** Prefill accepted by the create-order modal, exported so callers can type
 *  their own state instead of casting at the call site. */
export type CreateOrderModalInitialData = Partial<
    OrderFormData & { secondary_phone?: string; source?: OrderSource; order_id?: string }
>;

interface CreateOrderModalProps {
    open: boolean;
    onClose: () => void;
    onCreate: (orderData: CreateOrderInput) => Promise<CreateOrderResult>;
    checkOrderIdExists?: (orderId: string) => Promise<boolean>;
    initialData?: CreateOrderModalInitialData;
    getBlacklistEntry?: (phone: string) => BlacklistEntry | null;
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
    getBlacklistEntry,
}: CreateOrderModalProps) {
    const { session } = useAuth();
    const [limitWarning, setLimitWarning] = useState<string | null>(null);
    const [limitBlocked, setLimitBlocked] = useState<string | null>(null);
    const [orderType, setOrderType] = useState<OrderType>("delivery");
    const [formData, setFormData] = useState<OrderFormData & { secondary_phone?: string; source?: OrderSource; order_id?: string }>({
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
    const [customCreatedAt, setCustomCreatedAt] = useState<string>(new Date().toISOString());
    const [createAndNew, setCreateAndNew] = useState(false);
    const handleCreateRef = useRef<(() => void) | undefined>(undefined);

    // Check plan limits when modal opens
    useEffect(() => {
        if (open && session?.access_token) {
            setLimitWarning(null);
            setLimitBlocked(null);
            // The action resolves the tenant from the session token itself.
            checkOrderLimitsAction(session.access_token).then((result) => {
                if (!result.allowed) {
                    setLimitBlocked(result.reason ?? "Order limit reached");
                } else if (result.warning) {
                    setLimitWarning(result.warning);
                }
            }).catch(() => { /* non-critical */ });
        }
    }, [open, session?.access_token]);

    // Sync formData with initialData only when modal first opens
    useEffect(() => {
        if (open) {
            setCustomCreatedAt(new Date().toISOString());
        }
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

    const resetForm = () => {
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
        setCustomCreatedAt(new Date().toISOString());
    };

    const handleClose = () => {
        if (isCreating) return;
        resetForm();
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
            try {
                const exists = await checkOrderIdExists(id);
                setOrderIdStatus(exists ? "exists" : "available");
            } catch {
                // Could not verify (expired session / network) — stay silent
                // rather than claiming the id is available.
                setOrderIdStatus("idle");
            } finally {
                setIsCheckingId(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [formData.order_id, checkOrderIdExists]);

    const updateField = (field: string, value: string | number | boolean | undefined | string[]) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const updateItem = (index: number, field: keyof OrderItem, value: string | number | boolean) => {
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

    const handleProductSelect = (product: { product_id: string; name: string; price: number; quantity: number; image_url?: string; is_open_box?: boolean }) => {
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
        setCustomCreatedAt(new Date().toISOString());
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
            toast.error('الرجاء اختيار صورة');
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
                headers: {
                    ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {}),
                },
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
                    toast.warning('لم يتم العثور على بيانات في الصورة. الرجاء التحقق من الصورة والمحاولة مرة أخرى.');
                }
            } else {
                console.error("Failed to analyze image:", result.error);
                toast.error(`حدث خطأ أثناء تحليل الصورة: ${result.error || 'خطأ غير معروف'}`);
            }
        } catch (error) {
            console.error("Error uploading image:", error);
            toast.error('حدث خطأ أثناء رفع الصورة. الرجاء المحاولة مرة أخرى.');
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
        } else if (formData.items.some(item => !item.product_id)) {
            newErrors.items = "كل منتج يجب اختياره من قائمة المنتجات (حتى يُحسب من المخزون)";
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
            // `price` stores the discounted line-item subtotal WITHOUT delivery —
            // the canonical convention shared with the storefront and every
            // courier export (see lib/order-money). Delivery rides along in
            // `delivery_fee`; the courier collects price + delivery_fee.
            const finalPrice = Math.max(0, itemsTotal - discount);


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
                custom_created_at: customCreatedAt,
            });

            if (result.success) {
                const orderId = result.data?.order_id || '';
                const createdOrderId = result.data?.id;
                toast.success(`تم إنشاء الطلب ${orderId ? `#${orderId}` : 'بنجاح'}`, {
                    action: createdOrderId ? {
                        label: "عرض الطلب",
                        onClick: () => { window.location.href = `/orders?highlight=${createdOrderId}`; }
                    } : undefined,
                });

                if (createAndNew) {
                    resetForm();
                    setCreateAndNew(false);
                } else {
                    handleClose();
                }
            } else {
                setErrors({ items: result.error || "حدث خطأ" });
            }
        } catch {
            setErrors({ items: "حدث خطأ غير متوقع" });
        } finally {
            setIsCreating(false);
            setCreateAndNew(false);
        }
    };

    // Keep ref in sync for keyboard shortcut
    handleCreateRef.current = handleCreate;

    // Ctrl/Cmd+Enter keyboard shortcut to submit
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isCreating) {
                e.preventDefault();
                handleCreateRef.current?.();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, isCreating]);

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
                        {/* Plan Limit Block */}
                        {limitBlocked && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                                <Ban className="w-5 h-5 text-red-500 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-red-800">Cannot create order</p>
                                    <p className="text-xs text-red-600">{limitBlocked}</p>
                                </div>
                            </div>
                        )}
                        {/* Plan Limit Warning */}
                        {limitWarning && !limitBlocked && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <p className="text-xs text-amber-700">{limitWarning}</p>
                            </div>
                        )}
                        {/* Row 1: Order Type + Date/Time Picker */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => handleOrderTypeChange("delivery")}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all",
                                        orderType === "delivery"
                                            ? "border-green-400 bg-green-50 text-green-700 shadow-sm"
                                            : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500"
                                    )}
                                >
                                    <Truck className="h-3.5 w-3.5" />
                                    توصيل
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleOrderTypeChange("shop")}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all",
                                        orderType === "shop"
                                            ? "border-amber-400 bg-amber-50 text-amber-700 shadow-sm"
                                            : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-500"
                                    )}
                                >
                                    <Store className="h-3.5 w-3.5" />
                                    محل
                                </button>
                            </div>
                            <DateTimePicker
                                value={customCreatedAt}
                                onChange={(iso) => setCustomCreatedAt(iso)}
                                showTime={true}
                            />
                        </div>
                        {orderType === "shop" && (
                            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg -mt-2">
                                طلب المحل: رقم الهاتف اختياري، بدون رسوم توصيل
                            </p>
                        )}

                        {/* Row 2: Order ID + Source */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* Order ID */}
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted flex items-center gap-1">
                                    <Hash className="h-3 w-3" />
                                    رقم الطلب (اختياري)
                                </Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-mono">#</span>
                                    <Input
                                        value={formData.order_id || ""}
                                        onChange={(e) => handleOrderIdChange(e.target.value)}
                                        placeholder="تلقائي"
                                        dir="ltr"
                                        className={cn(
                                            "h-9 pl-7 rounded-lg font-mono text-sm",
                                            orderIdStatus === "exists"
                                                ? "border-red-300 bg-red-50"
                                                : orderIdStatus === "available"
                                                    ? "border-green-300 bg-green-50"
                                                    : "border-[var(--card-border)] bg-[var(--background)]"
                                        )}
                                    />
                                    {formData.order_id && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {isCheckingId ? (
                                                <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                            ) : orderIdStatus === "available" ? (
                                                <Check className="w-3.5 h-3.5 text-green-600" />
                                            ) : orderIdStatus === "exists" ? (
                                                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                                {orderIdStatus === "exists" && (
                                    <p className="text-[10px] text-red-500 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        موجود مسبقاً
                                    </p>
                                )}
                            </div>

                            {/* Source - moved here from customer section */}
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted">مصدر الطلب</Label>
                                <div className="flex flex-wrap gap-1">
                                    {ORDER_SOURCES.map((source) => (
                                        <button
                                            key={source.id}
                                            type="button"
                                            onClick={() => updateField("source", source.id)}
                                            className={cn(
                                                "flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all",
                                                formData.source === source.id
                                                    ? "border-green-300 bg-green-50 text-green-700"
                                                    : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"
                                            )}
                                            title={source.label}
                                        >
                                            <source.icon className={cn("h-3 w-3", formData.source === source.id ? source.color : "")} />
                                            <span className="hidden sm:inline">{source.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Row 3: AI Upload - Compact Strip */}
                        <div className="space-y-1.5">
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
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed cursor-pointer transition-all",
                                    isAnalyzingImage
                                        ? "border-purple-300 bg-purple-50/50 cursor-wait"
                                        : uploadedImage
                                            ? "border-purple-400 bg-purple-50/50"
                                            : "border-gray-300 bg-gray-50/30 hover:border-purple-400 hover:bg-purple-50/30"
                                )}
                            >
                                {isAnalyzingImage ? (
                                    <Loader2 className="h-4 w-4 text-purple-600 animate-spin shrink-0" />
                                ) : uploadedImage ? (
                                    <div className="relative">
                                        <img src={uploadedImage} alt="" className="w-8 h-8 rounded-lg object-cover border border-purple-300" />
                                        <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); handleRemoveImage(); }}
                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center"
                                        >
                                            <X className="h-2.5 w-2.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                                        <Sparkles className="h-4 w-4 text-purple-600" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-700">
                                        {isAnalyzingImage ? "جاري تحليل الصورة..." : uploadedImage ? "تم التحليل — اضغط لتغيير الصورة" : "ارفع صورة المحادثة للتعبئة التلقائية"}
                                    </p>
                                    {!isAnalyzingImage && !uploadedImage && (
                                        <p className="text-[10px] text-gray-400 mt-0.5">Instagram أو TikTok — استخراج تلقائي</p>
                                    )}
                                </div>
                                {uploadedImage && !isAnalyzingImage && (
                                    <Check className="h-4 w-4 text-purple-600 shrink-0" />
                                )}
                            </label>
                            <button
                                type="button"
                                onClick={() => setShowBulkUpload(true)}
                                className="text-[10px] text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1 hover:underline transition-all"
                            >
                                <Package className="h-3 w-3" />
                                رفع طلبات متعددة دفعة واحدة
                            </button>
                        </div>

                        {/* Customer Information — Card */}
                        <div className="rounded-xl border border-[var(--card-border)] bg-white overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/80 border-b border-[var(--card-border)]">
                                <User className="h-3.5 w-3.5 text-gray-500" />
                                <span className="text-xs font-semibold text-foreground">معلومات العميل</span>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {/* Customer Name */}
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-muted">اسم العميل <span className="text-red-500">*</span></Label>
                                        <Input
                                            value={formData.customer_name}
                                            onChange={(e) => updateField("customer_name", e.target.value)}
                                            placeholder="أحمد محمد"
                                            inputMode="text"
                                            autoComplete="name"
                                            className={cn(
                                                "h-9 rounded-lg border-[var(--card-border)] bg-[var(--background)] transition-all",
                                                errors.customer_name && "field-error animate-shake"
                                            )}
                                            data-error={!!errors.customer_name}
                                        />
                                        {errors.customer_name && <p className="field-error-text">{errors.customer_name}</p>}
                                    </div>

                                    {/* Primary Phone */}
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-muted flex items-center gap-1">
                                            <Phone className="h-3 w-3" />
                                            رقم الهاتف {orderType === "delivery" ? <span className="text-red-500">*</span> : <span className="text-gray-400">(اختياري)</span>}
                                        </Label>
                                        <Input
                                            value={formData.phone}
                                            onChange={(e) => updateField("phone", e.target.value)}
                                            onBlur={() => {
                                                if (formData.phone) {
                                                    updateField("phone", normalizeIraqiPhone(formData.phone));
                                                }
                                            }}
                                            placeholder="07XXXXXXXX"
                                            dir="ltr"
                                            inputMode="tel"
                                            autoComplete="tel"
                                            className={cn(
                                                "h-9 rounded-lg border-[var(--card-border)] bg-[var(--background)] font-mono transition-all",
                                                errors.phone && "field-error animate-shake"
                                            )}
                                            data-error={!!errors.phone}
                                        />
                                        {errors.phone && <p className="field-error-text">{errors.phone}</p>}
                                        {/* Blacklist warning */}
                                        {(() => {
                                            const normalizedPhone = normalizeIraqiPhone(formData.phone);
                                            const entry = normalizedPhone && getBlacklistEntry ? getBlacklistEntry(normalizedPhone) : null;
                                            if (!entry) return null;
                                            return (
                                                <div className="flex flex-row-reverse items-start gap-2 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2.5 mt-1 text-right">
                                                    <Ban className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                                    <div className="text-xs space-y-0.5">
                                                        <p className="font-bold text-red-700 dark:text-red-400">⛔ هذا الرقم في القائمة السوداء</p>
                                                        <p className="text-red-600/90 dark:text-red-400/80">السبب: {entry.reason}</p>
                                                        {entry.notes && <p className="text-red-500/80 dark:text-red-400/60">{entry.notes}</p>}
                                                        {entry.added_by && <p className="text-muted text-[11px]">أضافه: {entry.added_by}</p>}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                        {/* Pre-flight COD-risk panel (two-axis VALUE + RISK) */}
                                        <OrderCustomerRiskPanel phone={formData.phone} />

                                    {/* Secondary Phone */}
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-muted flex items-center gap-1">
                                            <Phone className="h-3 w-3" />
                                            رقم إضافي <span className="text-gray-400">(اختياري)</span>
                                        </Label>
                                        <Input
                                            value={formData.secondary_phone || ""}
                                            onChange={(e) => updateField("secondary_phone", e.target.value)}
                                            onBlur={() => {
                                                if (formData.secondary_phone) {
                                                    updateField("secondary_phone", normalizeIraqiPhone(formData.secondary_phone));
                                                }
                                            }}
                                            placeholder="07XXXXXXXX"
                                            dir="ltr"
                                            inputMode="tel"
                                            autoComplete="tel"
                                            className="h-9 rounded-lg border-[var(--card-border)] bg-[var(--background)] font-mono"
                                        />
                                    </div>

                                    {/* Governorate (City) - Hidden for shop orders */}
                                    {orderType === "delivery" && (
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted">المحافظة</Label>
                                            <div className="relative">
                                                <select
                                                    value={formData.city}
                                                    onChange={(e) => updateField("city", e.target.value)}
                                                    className={cn(
                                                        "h-9 w-full appearance-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 pr-8 text-sm font-medium text-foreground outline-none transition-all focus:ring-2 focus:ring-[var(--card-border)]",
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
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Address - Hidden for shop orders */}
                                {orderType === "delivery" && (
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-muted flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            العنوان الكامل
                                        </Label>
                                        <Textarea
                                            value={formData.address_details}
                                            onChange={(e) => updateField("address_details", e.target.value)}
                                            placeholder="أدخل العنوان التفصيلي..."
                                            rows={2}
                                            className={cn(
                                                "rounded-lg border-[var(--card-border)] bg-[var(--background)] resize-none transition-all text-sm",
                                                errors.address_details && "field-error animate-shake"
                                            )}
                                            data-error={!!errors.address_details}
                                        />
                                        {errors.address_details && <p className="field-error-text">{errors.address_details}</p>}
                                    </div>
                                )}

                                {/* Payment Status + Delivery Slot Row */}
                                <div className="flex flex-wrap items-center gap-3 pt-1">
                                    {/* Payment Status */}
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted">الدفع:</span>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() => updateField("payment_status", "cod")}
                                                className={cn(
                                                    "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all",
                                                    formData.payment_status === "cod"
                                                        ? "bg-amber-50 border-amber-300 text-amber-700"
                                                        : "bg-white border-[var(--card-border)] text-muted hover:border-amber-200"
                                                )}
                                            >
                                                <Banknote className="h-3 w-3" />
                                                عند الاستلام
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => updateField("payment_status", "prepaid")}
                                                className={cn(
                                                    "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all",
                                                    formData.payment_status === "prepaid"
                                                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                                        : "bg-white border-[var(--card-border)] text-muted hover:border-emerald-200"
                                                )}
                                            >
                                                <CreditCard className="h-3 w-3" />
                                                دفع الكتروني
                                            </button>
                                        </div>
                                    </div>

                                    {/* Delivery Slot - Only for delivery orders */}
                                    {orderType === "delivery" && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-muted flex items-center gap-0.5">
                                                <Clock className="h-2.5 w-2.5" />
                                                التوصيل:
                                            </span>
                                            <div className="flex gap-1">
                                                {[
                                                    { value: "morning" as const, label: "صباحي", icon: Sun, active: "bg-amber-50 border-amber-300 text-amber-700" },
                                                    { value: "afternoon" as const, label: "ظهري", icon: CloudSun, active: "bg-orange-50 border-orange-300 text-orange-700" },
                                                    { value: "evening" as const, label: "مسائي", icon: Moon, active: "bg-indigo-50 border-indigo-300 text-indigo-700" },
                                                ].map(({ value, label, icon: Icon, active }) => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => updateField("delivery_slot", formData.delivery_slot === value ? undefined : value)}
                                                        className={cn(
                                                            "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all",
                                                            formData.delivery_slot === value
                                                                ? active
                                                                : "bg-white border-[var(--card-border)] text-muted hover:bg-gray-50"
                                                        )}
                                                    >
                                                        <Icon className="h-3 w-3" />
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Products — Card */}
                        <div className="rounded-xl border border-[var(--card-border)] bg-white overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/80 border-b border-[var(--card-border)]">
                                <div className="flex items-center gap-2">
                                    <Package className="h-3.5 w-3.5 text-gray-500" />
                                    <span className="text-xs font-semibold text-foreground">المنتجات</span>
                                    {formData.items.length > 0 && (
                                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{formData.items.length}</span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowProductPicker(true)}
                                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-all"
                                >
                                    + إضافة
                                </button>
                            </div>

                            <div className="p-3">
                                {errors.items && (
                                    <p className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg mb-2">{errors.items}</p>
                                )}

                                {formData.items.length === 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowProductPicker(true)}
                                        className={cn(
                                            "w-full flex items-center justify-center gap-2 py-4 rounded-lg border border-dashed transition-all",
                                            errors.items
                                                ? "border-red-300 bg-red-50/50 text-red-500 animate-shake"
                                                : "border-gray-200 bg-gray-50/30 text-gray-400 hover:border-green-300 hover:bg-green-50/30 hover:text-green-600"
                                        )}
                                        data-error={!!errors.items}
                                    >
                                        <Package className="w-4 h-4" />
                                        <span className="text-xs font-medium">اضغط لإضافة منتج</span>
                                    </button>
                                ) : (
                                    <div className="space-y-1.5">
                                        {formData.items.map((item, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center gap-2.5 p-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                                                    <Package className="w-4 h-4 text-purple-500" />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="font-medium text-xs text-foreground truncate">{item.name}</p>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateItem(index, "is_open_box", !item.is_open_box)}
                                                            className={cn(
                                                                "shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold transition-all",
                                                                item.is_open_box
                                                                    ? "bg-amber-100 text-amber-700"
                                                                    : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                                            )}
                                                            title={item.is_open_box ? "علبة مفتوحة" : "جديد"}
                                                        >
                                                            {item.is_open_box ? "علبة مفتوحة" : "جديد"}
                                                        </button>
                                                    </div>
                                                    {editingPriceIndex === index ? (
                                                        <div className="flex items-center gap-1 mt-0.5">
                                                            <Input
                                                                type="number"
                                                                value={item.price}
                                                                onChange={(e) => updateItem(index, "price", toWholeIqd(e.target.value))}
                                                                className="w-20 h-5 text-[10px] px-1.5 rounded border-green-300"
                                                                autoFocus
                                                                onBlur={() => setEditingPriceIndex(null)}
                                                                onKeyDown={(e) => e.key === "Enter" && setEditingPriceIndex(null)}
                                                            />
                                                            <span className="text-[10px] text-muted">x {item.quantity}</span>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingPriceIndex(index)}
                                                            className="text-[10px] text-muted hover:text-green-600 flex items-center gap-1 group"
                                                        >
                                                            {formatIQD(item.price)} x {item.quantity}
                                                            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    <div className="flex items-center bg-white border border-[var(--card-border)] rounded-md">
                                                        <button
                                                            type="button"
                                                            onClick={() => updateItem(index, "quantity", Math.max(1, item.quantity - 1))}
                                                            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs"
                                                        >
                                                            -
                                                        </button>
                                                        <span className="w-5 text-center text-[10px] font-semibold">{item.quantity}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateItem(index, "quantity", item.quantity + 1)}
                                                            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs"
                                                        >
                                                            +
                                                        </button>
                                                    </div>

                                                    <span className="text-xs font-bold text-foreground font-mono w-20 text-right">
                                                        {formatIQD(item.price * item.quantity)}
                                                    </span>

                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(index)}
                                                        className="w-6 h-6 rounded-md bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-all"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Pricing Summary — inside products card */}
                            {formData.items.length > 0 && (
                                <div className="px-4 pb-4 space-y-2.5">
                                    <div className="border-t border-[var(--card-border)] pt-3 space-y-2">
                                        {/* Discount Preset */}
                                        <DiscountPresetSelector
                                            items={formData.items}
                                            currentDiscount={discount}
                                            onDiscountChange={setDiscount}
                                        />

                                        {/* Subtotal */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted">المجموع الفرعي</span>
                                            <span className="text-xs font-mono font-medium">{formatIQD(subtotal)}</span>
                                        </div>

                                        {/* Manual Discount */}
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-xs text-muted">خصم</span>
                                            <Input
                                                type="number"
                                                min="0"
                                                value={discount}
                                                onChange={(e) => setDiscount(toWholeIqd(e.target.value))}
                                                className="w-24 h-7 rounded-md border-[var(--card-border)] bg-white text-xs font-mono text-right"
                                                placeholder="0"
                                            />
                                        </div>

                                        {/* Delivery Fee */}
                                        {orderType === "delivery" && (
                                            <div className="flex items-center justify-between gap-3 px-2.5 py-2 bg-blue-50/50 rounded-lg border border-blue-100/80">
                                                <label className="flex items-center gap-1.5 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={includeDeliveryFee}
                                                        onChange={(e) => setIncludeDeliveryFee(e.target.checked)}
                                                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <Truck className="w-3 h-3 text-blue-500" />
                                                    <span className="text-xs text-blue-700">توصيل</span>
                                                </label>
                                                {includeDeliveryFee && (
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        value={deliveryFee}
                                                        onChange={(e) => setDeliveryFee(toWholeIqd(e.target.value))}
                                                        className="w-20 h-6 rounded border-blue-200 bg-white text-[10px] font-mono text-right"
                                                    />
                                                )}
                                            </div>
                                        )}

                                        {/* Total */}
                                        <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
                                            <span className="text-xs font-bold text-foreground">المجموع الكلي</span>
                                            <div className="flex items-center gap-1.5">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={total}
                                                    onChange={(e) => {
                                                        const newTotal = toWholeIqd(e.target.value);
                                                        const newDiscount = Math.max(0, Math.round(subtotal + actualDeliveryFee - newTotal));
                                                        setDiscount(newDiscount);
                                                    }}
                                                    className="w-24 h-7 rounded-md border-[var(--card-border)] bg-white text-xs font-mono text-right font-bold text-green-700"
                                                />
                                                <span className="text-[10px] text-muted">IQD</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Notes — Compact Two-Column */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 px-1">
                                    <FileText className="h-3 w-3 text-amber-500" />
                                    <span className="text-[10px] font-semibold text-amber-700">ملاحظات الطلب</span>
                                    <span className="text-[9px] text-amber-400">(الفاتورة)</span>
                                </div>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => updateField("notes", e.target.value)}
                                    placeholder="ملاحظات تظهر على الفاتورة..."
                                    rows={2}
                                    className="w-full px-3 py-2 bg-amber-50/40 border border-amber-200/80 rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 px-1">
                                    <FileText className="h-3 w-3 text-blue-500" />
                                    <span className="text-[10px] font-semibold text-blue-700">ملاحظات داخلية</span>
                                    <span className="text-[9px] text-blue-400">(الموظفين)</span>
                                </div>
                                <textarea
                                    value={formData.internal_notes || ""}
                                    onChange={(e) => updateField("internal_notes", e.target.value)}
                                    placeholder="ملاحظات داخلية..."
                                    rows={2}
                                    className="w-full px-3 py-2 bg-blue-50/40 border border-blue-200/80 rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Sticky Footer */}
                    <DialogFooter className="sticky bottom-0 z-10 flex items-center justify-between gap-3 px-6 py-3 bg-[var(--background)] border-t border-[var(--card-border)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isCreating}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors disabled:opacity-50"
                        >
                            <X className="h-4 w-4" />
                            إلغاء
                        </button>

                        {/* Live Total */}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50/80 rounded-lg border border-green-100">
                            <span className="text-[10px] text-green-600">المجموع</span>
                            <span className="text-sm font-mono font-bold text-green-700">{formatIQD(total)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Create & New */}
                            <button
                                type="button"
                                onClick={() => { setCreateAndNew(true); handleCreate(); }}
                                disabled={isCreating || !!limitBlocked}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 transition-all disabled:opacity-50"
                            >
                                {isCreating && createAndNew ? (
                                    <div className="w-3.5 h-3.5 border-2 border-gray-400/30 border-t-gray-500 rounded-full animate-spin" />
                                ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                إنشاء و جديد
                            </button>

                            {/* Create */}
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={isCreating || !!limitBlocked}
                                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[var(--button-success)] hover:bg-[var(--button-success-hover)] rounded-xl shadow-md transition-all disabled:opacity-50"
                            >
                                {isCreating && !createAndNew ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                                إنشاء الطلب
                            </button>
                        </div>
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
                                // ARCH-3: this was 'pending', which is not an
                                // OrderStatus. OrderSchema validates status against
                                // the enum, so every order this path created was
                                // rejected with a validation error — the bulk image
                                // upload could not create anything. Surfaced only
                                // once `onCreate` stopped being typed `any`.
                                status: 'new',
                                source: 'whatsapp',
                                priority: 'normal',
                                payment_status: 'cod',
                                is_return: false,
                                is_replacement: false,
                                is_archived: false,
                                order_id: '',
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
