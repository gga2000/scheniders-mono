"use client";

import { useState, useEffect, useEffectEvent, useRef } from "react";
import { useRouter } from "next/navigation";
import { calculateTotal, normalizeIraqiPhone, type OrderFormData, type ValidationErrors } from "@/lib/order-utils";
import type { OrderItem } from "@/lib/supabase";
import type { CreateOrderInput, CreateOrderResult, OrderSource, TakeKind } from "@/types/order";
import { useAuth } from "@/components/auth/auth-provider";
import { checkOrderLimitsAction } from "@/app/actions/orders";
import { toast } from "@/hooks/use-toast";
import { MessageCircle, Instagram, Store, MoreHorizontal } from "lucide-react";
import type { BlacklistEntry } from "@/hooks/use-order-auxiliary";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { findStockShortfalls, type StockShortfall } from "@/lib/orders/stock-shortfall";
import { useGroupedPhoneInput } from "@/hooks/use-grouped-phone-input";
import { routeCreateOrderDate } from "@/lib/order-date-guard";
import { useLanguage } from "@/hooks/use-language";
import { primeDistrictOfOrder, type PrimeDistrict } from "@/lib/prime/district";

// TikTok icon component
export const TikTokIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
);
/** Prefill accepted by the create-order modal, exported so callers can type
 *  their own state instead of casting at the call site. */
export type CreateOrderModalInitialData = Partial<
    OrderFormData & { secondary_phone?: string; source?: OrderSource; order_id?: string }
>;
export interface CreateOrderModalProps {
    open: boolean;
    onClose: () => void;
    onCreate: (orderData: CreateOrderInput) => Promise<CreateOrderResult>;
    checkOrderIdExists?: (orderId: string) => Promise<boolean>;
    initialData?: CreateOrderModalInitialData;
    getBlacklistEntry?: (phone: string) => BlacklistEntry | null;
}
export const ORDER_SOURCES = [
    { id: "whatsapp", labelKey: "orders.create.srcWhatsapp", icon: MessageCircle, color: "text-green-600" },
    { id: "meta", labelKey: "orders.create.srcMeta", icon: Instagram, color: "text-pink-600" },
    { id: "tiktok", labelKey: "orders.create.srcTiktok", icon: TikTokIcon, color: "text-gray-800" },
    { id: "shop", labelKey: "orders.create.srcShop", icon: Store, color: "text-amber-600" },
    { id: "other", labelKey: "orders.source.other", icon: MoreHorizontal, color: "text-gray-500" },
];
export type OrderType = "delivery" | "shop" | "take";
export type TakePricing = "free" | "set";

/** State, data and handlers of CreateOrderModal; the component and its sections render from this. */
export function useCreateOrderModel(props: CreateOrderModalProps) {
    const {
    open,
    onClose,
    onCreate,
    checkOrderIdExists,
    initialData,
    getBlacklistEntry,
} = props;
    const { t } = useLanguage();
    const router = useRouter();
    const { session } = useAuth();
    const [limitWarning, setLimitWarning] = useState<string | null>(null);
    const [limitBlocked, setLimitBlocked] = useState<string | null>(null);
    const [orderType, setOrderType] = useState<OrderType>("delivery");
    // Stock taken in person: who it is for, who took it, and whether it is free or paid.
    const [takeKind, setTakeKind] = useState<TakeKind>("staff");
    const [takenBy, setTakenBy] = useState("");
    const [takePricing, setTakePricing] = useState<TakePricing>("free");
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
        is_gift: initialData?.is_gift ?? false,
        payment_status: initialData?.payment_status || "cod",
        source: initialData?.source || "whatsapp",
        order_id: "",
    });
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [isCreating, setIsCreating] = useState(false);
    const { products } = useProductsCrud();
    // Set when the items need more than is free to sell. Creating again with
    // the same items goes ahead (a warning, not a block); changing them asks again.
    const [stockWarning, setStockWarning] = useState<{ items: string; shortfalls: StockShortfall[] } | null>(null);
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
    const postponeTo = routeCreateOrderDate(customCreatedAt).scheduledDate;
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
    // Reads initialData as it is when the modal opens; a parent re-render
    // with a new initialData object must not reset what the user has typed.
    const syncFromInitialData = useEffectEvent(() => {
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
                is_gift: initialData.is_gift ?? false,
                payment_status: initialData.payment_status || "cod",
                source: initialData.source || "whatsapp",
                order_id: "",
            });
            // If items are pre-filled, calculate discount if any
            if (initialData.items && initialData.items.length > 0) {
                setDiscount(0); // Reset discount, user can set it manually
            }
        }
    });
    useEffect(() => {
        syncFromInitialData();
    }, [open]);

    // Handle order type change
    const handleOrderTypeChange = (type: OrderType) => {
        setOrderType(type);
        if (type === "take") {
            updateField("source", "shop");
            setIncludeDeliveryFee(false);
            setDiscount(0);
        } else if (type === "shop") {
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
        setStockWarning(null);
        setOrderType("delivery");
        setTakeKind("staff");
        setTakenBy("");
        setTakePricing("free");
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
            is_gift: false,
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
        // A Prime district belongs to one governorate: changing it drops the pick.
        setFormData((prev) => ({ ...prev, [field]: value, ...(field === "city" && value !== prev.city ? { prime_district: null } : {}) }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const setPrimeDistrict = (district: PrimeDistrict | null) => {
        setFormData((prev) => ({ ...prev, prime_district: district }));
    };

    // Inputs show 4-3-4 grouping; formData keeps the un-spaced value normalized on blur/submit.
    const phoneInput = useGroupedPhoneInput(formData.phone, (value) => updateField("phone", value));
    const secondaryPhoneInput = useGroupedPhoneInput(formData.secondary_phone || "", (value) => updateField("secondary_phone", value));

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
            is_gift: false,
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
            toast.error(t("orders.create.pickImage"));
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
                        prime_district: result.data.city && result.data.city !== prev.city ? null : prev.prime_district,
                    }));

                } else {
                    toast.warning(t("orders.create.noDataInImage"));
                }
            } else {
                console.error("Failed to analyze image:", result.error);
                toast.error(t("orders.create.analyzeFailed", { error: result.error || t("orders.create.unknownError") }));
            }
        } catch (error) {
            console.error("Error uploading image:", error);
            toast.error(t("orders.create.uploadFailed"));
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
            newErrors.order_id = t("orders.create.errIdExists");
        } else if (orderIdStatus === "checking") {
            newErrors.order_id = t("orders.create.errIdChecking");
        }

        const isTake = orderType === "take";
        if (isTake) {
            if (takeKind !== "sample" && !takenBy.trim()) newErrors.taken_by = t("orders.create.errTakenBy");
            if (formData.items.length === 0) {
                newErrors.items = t("orders.create.errNoItems");
            } else if (formData.items.some(item => !item.product_id)) {
                newErrors.items = t("orders.create.errItemNotPicked");
            }
        } else if (!formData.customer_name.trim()) {
            newErrors.customer_name = t("orders.create.errName");
        }
        // Phone required only for delivery orders
        if (isTake) {
            // A take has no customer, phone or address.
        } else if (orderType === "delivery") {
            if (!normalizedPhone.trim()) {
                newErrors.phone = t("orders.create.errPhone");
            } else if (!/^07\d{8,9}$/.test(normalizedPhone.trim())) {
                newErrors.phone = t("orders.create.errPhoneInvalid");
            }
        } else if (normalizedPhone.trim() && !/^07\d{8,9}$/.test(normalizedPhone.trim())) {
            // For shop orders, validate phone only if provided
            newErrors.phone = t("orders.create.errPhoneInvalid");
        }
        if (!isTake && formData.items.length === 0) {
            newErrors.items = t("orders.create.errNoItems");
        } else if (!isTake && formData.items.some(item => !item.product_id)) {
            newErrors.items = t("orders.create.errItemNotPicked");
        }

        if (orderType === "delivery") {
            if (!formData.city) {
                newErrors.city = t("orders.create.errCity");
            }
            if (!formData.address_details?.trim()) {
                newErrors.address_details = t("orders.create.errAddress");
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

        const stockItems = formData.items.filter(item => item.name.trim());
        const itemsKey = JSON.stringify(stockItems.map(i => [i.product_id, i.variant_id, !!i.is_open_box, i.quantity]));
        if (stockWarning?.items !== itemsKey) {
            const shortfalls = findStockShortfalls([{ status: "new", items: stockItems }], products);
            if (shortfalls.length > 0) {
                setStockWarning({ items: itemsKey, shortfalls });
                setCreateAndNew(false);
                return;
            }
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

            if (isTake) {
                // Free: every line at 0, so the cost shows up as a loss and no
                // revenue is booked. Set price: the lines keep their prices.
                const takeItems = formData.items
                    .filter(item => item.name.trim())
                    .map(item => takePricing === "free" ? { ...item, price: 0 } : item);
                const takeTotal = takePricing === "free" ? 0 : takeItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
                const takeResult = await onCreate({
                    ...formData,
                    customer_name: takenBy.trim() || t("orders.create.takeSampleName"),
                    phone: "",
                    secondary_phone: undefined,
                    city: "",
                    address_details: "",
                    price: takeTotal,
                    discount_amount: 0,
                    delivery_fee: 0,
                    is_shop_order: true,
                    is_gift: false,
                    source: "shop",
                    status: "completed",
                    payment_status: takePricing === "free" ? "pending" : "paid",
                    take_kind: takeKind,
                    taken_by: takenBy.trim(),
                    internal_notes: formData.internal_notes || "",
                    items: takeItems,
                    custom_created_at: customCreatedAt,
                });
                if (takeResult.success) {
                    toast.success(t("orders.create.takeRecorded"));
                    if (createAndNew) {
                        resetForm();
                        setCreateAndNew(false);
                    } else {
                        handleClose();
                    }
                } else {
                    setErrors({ items: takeResult.error || t("orders.create.errGeneric") });
                }
                return;
            }


            const result = await onCreate({
                ...formData,
                phone: normalizedPhone,
                secondary_phone: normalizedSecondary || undefined,
                price: finalPrice,
                discount_amount: discount,
                delivery_fee: actualDeliveryFee,
                is_shop_order: orderType === "shop",
                is_gift: orderType === "delivery" && Boolean(formData.is_gift),
                prime_district: orderType === "delivery" ? primeDistrictOfOrder(formData) : null,
                status: orderType === "shop" ? "completed" : "confirmed",
                notes: orderType === "shop" ? `[طلب محل] ${formData.notes || ''}`.trim() : formData.notes,
                internal_notes: formData.internal_notes || "",
                items: formData.items.filter(item => item.name.trim()),
                custom_created_at: customCreatedAt,
            });

            if (result.success) {
                const orderId = result.data?.order_id || '';
                const createdOrderId = result.data?.id;
                toast.success(orderId ? t("orders.create.createdNumbered", { id: orderId }) : t("orders.create.created"), {
                    action: createdOrderId ? {
                        label: t("orders.create.viewOrder"),
                        onClick: () => { router.push(`/orders?order=${createdOrderId}`); }
                    } : undefined,
                });

                if (createAndNew) {
                    resetForm();
                    setCreateAndNew(false);
                } else {
                    handleClose();
                }
            } else {
                setErrors({ items: result.error || t("orders.create.errGeneric") });
            }
        } catch {
            setErrors({ items: t("orders.create.errUnexpected") });
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


    return {
        open,
        onClose,
        onCreate,
        checkOrderIdExists,
        initialData,
        getBlacklistEntry,
        t,
        router,
        session,
        limitWarning,
        setLimitWarning,
        limitBlocked,
        setLimitBlocked,
        orderType,
        setOrderType,
        takeKind,
        setTakeKind,
        takenBy,
        setTakenBy,
        takePricing,
        setTakePricing,
        formData,
        setFormData,
        errors,
        setErrors,
        isCreating,
        setIsCreating,
        products,
        stockWarning,
        setStockWarning,
        showProductPicker,
        setShowProductPicker,
        discount,
        setDiscount,
        orderIdStatus,
        setOrderIdStatus,
        isCheckingId,
        setIsCheckingId,
        deliveryFee,
        setDeliveryFee,
        includeDeliveryFee,
        setIncludeDeliveryFee,
        editingPriceIndex,
        setEditingPriceIndex,
        isAnalyzingImage,
        setIsAnalyzingImage,
        uploadedImage,
        setUploadedImage,
        showBulkUpload,
        setShowBulkUpload,
        customCreatedAt,
        setCustomCreatedAt,
        postponeTo,
        createAndNew,
        setCreateAndNew,
        handleCreateRef,
        handleOrderTypeChange,
        resetForm,
        handleClose,
        handleOrderIdChange,
        updateField,
        setPrimeDistrict,
        phoneInput,
        secondaryPhoneInput,
        updateItem,
        removeItem,
        handleProductSelect,
        handleClearFields,
        handleRemoveImage,
        handleImageUpload,
        handleCreate,
        subtotal,
        actualDeliveryFee,
        total,
    };
}

export type CreateOrderModel = ReturnType<typeof useCreateOrderModel>;
