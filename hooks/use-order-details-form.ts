import { useState, useEffect } from "react";
import { Order } from "@/lib/supabase";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import { toast } from "@/hooks/use-toast";
import { getBaseOrderId } from "@/lib/utils";

interface UseOrderDetailsFormProps {
    order: Order | null;
    setOrder: React.Dispatch<React.SetStateAction<Order | null>>;
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    t: (key: string) => string;
}

export function useOrderDetailsForm({ order, setOrder, onUpdate, t }: UseOrderDetailsFormProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<Partial<Order>>({});
    const [showProductPicker, setShowProductPicker] = useState(false);

    const handleEdit = () => {
        if (!order) return;
        setFormData({
            customer_name: order.customer_name,
            phone: formatPhoneForDisplay(order.phone),
            secondary_phone: formatPhoneForDisplay(order.secondary_phone) || "",
            city: order.city || "",
            governorate_code: order.governorate_code || "",
            address_details: order.address_details || "",
            notes: order.notes || "",
            internal_notes: order.internal_notes || "",
            price: order.price,
            discount_amount: order.discount_amount || 0,
            payment_status: order.payment_status || "cod",
            delivery_slot: order.delivery_slot || undefined,
            delivery_order_id: order.delivery_order_id || "",
            items: order.items ? [...order.items] : [],
            created_at: order.created_at,
        });
        setIsEditing(true);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setFormData({});
    };

    const handleSave = async () => {
        if (!order) return;
        setIsSaving(true);

        const dataToSave = { ...formData };
        const dateActuallyChanged = dataToSave.created_at &&
            new Date(dataToSave.created_at).getTime() !== new Date(order.created_at).getTime();
        if (dateActuallyChanged && !order.original_created_at) {
            dataToSave.original_created_at = order.created_at;
        }

        const result = await onUpdate(order.id, dataToSave);

        if (result.success) {
            setOrder((prev) => prev ? { ...prev, ...dataToSave } as Order : prev);
            setIsEditing(false);
            setFormData({});
            toast.success(t("toast.orderUpdated"), t("toast.orderUpdatedDesc"));
        } else {
            toast.error(t("toast.saveFailed"), result.error || t("orderDetail.saveFailed"));
        }

        setIsSaving(false);
    };

    const displayValue = (key: keyof Order) => {
        if (!order) return undefined;
        if (isEditing && key in formData) {
            return formData[key];
        }
        return order[key];
    };

    const updateFormData = (key: string, value: any) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    const handleRemoveItem = (indexToRemove: number) => {
        if (!order) return;
        const currentItems = (formData.items || order.items || []) as any[];
        const updatedItems = currentItems.filter((_, idx) => idx !== indexToRemove);
        const newTotal = updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setFormData((prev) => ({
            ...prev,
            items: updatedItems,
            price: newTotal
        }));
    };

    const handleUpdateItemQuantity = (index: number, newQuantity: number) => {
        if (!order) return;
        if (newQuantity < 1) return;
        const currentItems = [...((formData.items || order.items || []) as any[])];
        currentItems[index] = { ...currentItems[index], quantity: newQuantity };
        const newTotal = currentItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setFormData((prev) => ({
            ...prev,
            items: currentItems,
            price: newTotal
        }));
    };

    const handleAddItem = () => {
        setShowProductPicker(true);
    };

    const handleProductSelect = (product: { name: string; price: number; quantity: number; image_url?: string; tag_color?: string }) => {
        if (!order) return;
        setFormData((prev) => {
            const currentItems = [...((prev.items || order.items || []) as any[])];
            currentItems.push(product);
            const newTotal = currentItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            return {
                ...prev,
                items: currentItems,
                price: newTotal
            };
        });
    };

    return {
        isEditing,
        setIsEditing,
        isSaving,
        formData,
        setFormData,
        handleEdit,
        handleCancel,
        handleSave,
        displayValue,
        updateFormData,
        handleRemoveItem,
        handleUpdateItemQuantity,
        handleAddItem,
        handleProductSelect,
        showProductPicker,
        setShowProductPicker
    };
}

interface UseOrderIdEditProps {
    order: Order | null;
    setOrder: React.Dispatch<React.SetStateAction<Order | null>>;
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    checkOrderIdExists?: (orderId: string, excludeId?: string) => Promise<boolean>;
    t: (key: string) => string;
}

export function useOrderIdEdit({ order, setOrder, onUpdate, checkOrderIdExists, t }: UseOrderIdEditProps) {
    const [isEditingId, setIsEditingId] = useState(false);
    const [tempOrderId, setTempOrderId] = useState("");
    const [idError, setIdError] = useState<string | null>(null);
    const [isCheckingId, setIsCheckingId] = useState(false);
    const [showIdWarning, setShowIdWarning] = useState(false);
    const [idCountdown, setIdCountdown] = useState(5);
    const [isSavingId, setIsSavingId] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (showIdWarning && idCountdown > 0) {
            timer = setTimeout(() => setIdCountdown(prev => prev - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [showIdWarning, idCountdown]);

    const startIdEdit = () => {
        if (!order) return;
        setTempOrderId(getBaseOrderId(order.order_id || ""));
        setIdError(null);
        setIsEditingId(true);
    };

    const cancelIdEdit = () => {
        setIsEditingId(false);
        setTempOrderId("");
        setIdError(null);
    };

    const handleIdChange = async (val: string) => {
        setTempOrderId(val);
        setIdError(null);

        if (!val.trim()) {
            setIdError(t("orderDetail.idEmpty"));
            return;
        }

        if (checkOrderIdExists) {
            setIsCheckingId(true);
            const exists = await checkOrderIdExists(val, order?.id);
            setIsCheckingId(false);
            if (exists) {
                setIdError(t("orderDetail.idExists"));
            }
        }
    };

    const initiateIdSave = () => {
        if (idError || !tempOrderId.trim()) return;
        if (order && tempOrderId === order.order_id) {
            setIsEditingId(false);
            return;
        }
        setShowIdWarning(true);
        setIdCountdown(5);
    };

    const confirmIdSave = async () => {
        if (!order || !onUpdate) return;

        setIsSavingId(true);
        const result = await onUpdate(order.id, { order_id: tempOrderId } as Partial<Order>);
        setIsSavingId(false);

        if (result.success) {
            setOrder(prev => prev ? { ...prev, order_id: tempOrderId } : prev);
            setShowIdWarning(false);
            setIsEditingId(false);
        } else {
            toast.error(t("toast.updateFailed"), result.error || t("updateIdFailedDesc"));
            setShowIdWarning(false);
        }
    };

    return {
        isEditingId,
        tempOrderId,
        idError,
        isCheckingId,
        showIdWarning,
        setShowIdWarning,
        idCountdown,
        isSavingId,
        startIdEdit,
        cancelIdEdit,
        handleIdChange,
        initiateIdSave,
        confirmIdSave
    };
}
