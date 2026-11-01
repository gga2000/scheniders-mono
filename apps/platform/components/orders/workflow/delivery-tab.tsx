"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, CheckCircle, XCircle, AlertTriangle, RefreshCw, MapPin, ChevronDown } from "lucide-react";
import { formatIQD, getBaseOrderId } from "@/lib/utils";
import { DualPhoneDisplay } from "@/components/ui/phone-display";
import type { Order } from "@/lib/supabase";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

interface DeliveryTabProps {
    orders: Order[];
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    onStatusUpdate: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onViewDetails: (order: Order) => void;
}

interface PartialDeliveryState {
    orderId: string;
    items: { name: string; quantity: number; accepted: number }[];
}

// Predefined rejection reasons. `label` is the Arabic text saved on the order
// (kept stable so reports group the same way); `labelKey` is what the picker shows.
const REJECTION_REASONS = [
    { value: "no_answer", label: "لم يرد على الاتصال", labelKey: "orders.rej.noAnswer" },
    { value: "no_response_after_agreement", label: "لا يرد بعد الاتفاق", labelKey: "orders.rej.noResponseAfterAgreement" },
    { value: "customer_unavailable", label: "العميل غير متواجد في العنوان", labelKey: "orders.rej.customerUnavailable" },
    { value: "customer_refused", label: "العميل رفض استلام الطلب", labelKey: "orders.rej.customerRefused" },
    { value: "changed_mind", label: "العميل غيّر رأيه", labelKey: "orders.rej.changedMind" },
    { value: "price_issue", label: "اعتراض على السعر", labelKey: "orders.rej.priceIssue" },
    { value: "wrong_product", label: "المنتج غير مطابق للطلب", labelKey: "orders.rej.wrongProduct" },
    { value: "product_quality", label: "جودة المنتج غير مرضية", labelKey: "orders.rej.productQuality" },
    { value: "damaged_product", label: "المنتج تالف أو مكسور", labelKey: "orders.rej.damagedProduct" },
    { value: "wrong_address", label: "عنوان غير صحيح أو غير مكتمل", labelKey: "orders.rej.wrongAddress" },
    { value: "remote_area", label: "منطقة خارج نطاق التوصيل", labelKey: "orders.rej.remoteArea" },
    { value: "payment_issue", label: "مشكلة في الدفع", labelKey: "orders.rej.paymentIssue" },
    { value: "duplicate_order", label: "طلب مكرر", labelKey: "orders.rej.duplicateOrder" },
    { value: "other", label: "سبب آخر...", labelKey: "orders.rej.other" },
];

export function DeliveryTab({
    orders,
    onUpdate,
    onStatusUpdate,
    onViewDetails,
}: DeliveryTabProps) {
    const { t } = useLanguage();
    const [partialModal, setPartialModal] = useState<PartialDeliveryState | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    // Rejection modal state
    const [rejectionModal, setRejectionModal] = useState<{ order: Order } | null>(null);
    const [selectedReason, setSelectedReason] = useState<string>("customer_refused");
    const [customReason, setCustomReason] = useState<string>("");

    const handleDelivered = async (order: Order) => {
        setLoadingId(order.id);
        try {
            await onStatusUpdate(order.id, "delivered");
        } finally {
            setLoadingId(null);
        }
    };

    const openRejectionModal = (order: Order) => {
        setRejectionModal({ order });
        setSelectedReason("customer_refused");
        setCustomReason("");
    };

    const handleRejectSubmit = async () => {
        if (!rejectionModal) return;
        setLoadingId(rejectionModal.order.id);
        try {
            const reason = selectedReason === "other"
                ? customReason || "Other reason"
                : REJECTION_REASONS.find(r => r.value === selectedReason)?.label || selectedReason;

            await onStatusUpdate(rejectionModal.order.id, "rejected", reason);
        } finally {
            setLoadingId(null);
            setRejectionModal(null);
        }
    };

    const openPartialModal = (order: Order) => {
        setPartialModal({
            orderId: order.id,
            items: order.items?.map(item => ({
                name: item.name,
                quantity: item.quantity,
                accepted: item.quantity,
            })) || [],
        });
    };

    const handlePartialSubmit = async () => {
        if (!partialModal) return;

        const order = orders.find(o => o.id === partialModal.orderId);
        if (!order) return;

        setLoadingId(partialModal.orderId);
        try {
            const totalAccepted = partialModal.items.reduce((sum, i) => sum + i.accepted, 0);
            const totalOriginal = partialModal.items.reduce((sum, i) => sum + i.quantity, 0);

            if (totalAccepted === 0) {
                openRejectionModal(order);
                setPartialModal(null);
                return;
            } else if (totalAccepted === totalOriginal) {
                await handleDelivered(order);
            } else {
                await onStatusUpdate(order.id, "delivered");
                const partialInfo = partialModal.items
                    .filter(i => i.accepted < i.quantity)
                    .map(i => `${i.name}: ${i.accepted}/${i.quantity}`)
                    .join(", ");
                // Append: this used to replace the order's notes, wiping
                // whatever the team had written there before.
                const partialNote = `Partial: ${partialInfo}`;
                await onUpdate(order.id, { notes: order.notes ? `${order.notes}\n${partialNote}` : partialNote });
            }
            setPartialModal(null);
        } finally {
            setLoadingId(null);
        }
    };

    const handleReorder = async (order: Order) => {
        toast({
            title: t("toast.comingSoon"),
            description: t("toast.reorderFeature").replace("{customer}", order.customer_name),
            variant: "default",
        });
    };

    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-16 h-16 rounded-2xl bg-[var(--pastel-yellow)] flex items-center justify-center mb-4">
                    <Truck className="w-8 h-8 text-amber-700" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">{t("orders.dlv.emptyTitle")}</h3>
                <p className="text-muted text-center">{t("orders.dlv.emptyHint")}</p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-4">
                {/* Stats */}
                <div className="flex items-center justify-center">
                    <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--pastel-yellow)] text-amber-800 text-sm font-medium">
                        <Truck className="w-4 h-4" />
                        {t("orders.dlv.count", { count: orders.length })}
                    </span>
                </div>

                {/* Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {orders.map((order, index) => {
                        const isLoading = loadingId === order.id;
                        const itemLines = mergeOrderItems(order.items);

                        return (
                            <motion.div
                                key={order.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                                className="pastel-card p-4"
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span
                                                onClick={() => onViewDetails(order)}
                                                className="font-mono text-sm font-bold text-amber-700 cursor-pointer hover:bg-amber-50 hover:text-amber-800 px-1.5 py-0.5 rounded transition-colors"
                                            >
                                                #{getBaseOrderId(order.order_id)}
                                            </span>
                                        </div>
                                        <p
                                            onClick={() => onViewDetails(order)}
                                            className="font-semibold text-foreground cursor-pointer hover:underline hover:text-amber-700 transition-colors w-fit"
                                        >
                                            {order.customer_name}
                                        </p>
                                        <DualPhoneDisplay
                                            primaryPhone={order.phone}
                                            secondaryPhone={order.secondary_phone}
                                            customerName={order.customer_name}
                                            orderId={order.order_id}
                                            showWhatsApp={true}
                                            size="sm"
                                        />
                                        <span className="flex items-center gap-1 text-muted text-sm mt-1">
                                            <MapPin className="w-3 h-3 text-amber-600" />
                                            <span>
                                                {[order.city, order.address_details]
                                                    .filter(Boolean)
                                                    .map(s => s?.trim())
                                                    .filter(s => s && s.length > 0)
                                                    .join(' • ')}
                                            </span>
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-foreground">{formatIQD(Number(order.price))}</p>
                                        <p className="text-xs text-muted">{t("orders.wf.nItems", { count: itemLines.length })}</p>
                                    </div>
                                </div>

                                {/* Items */}
                                <div className="bg-[var(--background)] rounded-xl p-3 mb-4 border border-[var(--card-border)]">
                                    {itemLines.slice(0, 3).map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-sm py-1 border-b border-dashed border-[var(--card-border)] last:border-0">
                                            <span className="text-foreground">{item.name}</span>
                                            <span className="font-mono font-bold text-muted">×{item.quantity}</span>
                                        </div>
                                    ))}
                                    {itemLines.length > 3 && (
                                        <p className="text-xs text-muted mt-2">{t("orders.wf.nMore", { count: itemLines.length - 3 })}</p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-4 gap-2">
                                    <button
                                        onClick={() => handleDelivered(order)}
                                        disabled={isLoading}
                                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-[var(--button-success)] text-white text-xs font-bold hover:bg-[var(--button-success-hover)] transition-all disabled:opacity-50"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        {t("orders.dlv.delivered")}
                                    </button>
                                    <button
                                        onClick={() => openRejectionModal(order)}
                                        disabled={isLoading}
                                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-all disabled:opacity-50"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        {t("orders.dlv.rejected")}
                                    </button>
                                    <button
                                        onClick={() => openPartialModal(order)}
                                        disabled={isLoading}
                                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-all disabled:opacity-50"
                                    >
                                        <AlertTriangle className="w-4 h-4" />
                                        {t("orders.dlv.partial")}
                                    </button>
                                    <button
                                        onClick={() => handleReorder(order)}
                                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 transition-all"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        {t("orders.dlv.reorder")}
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Partial Delivery Modal */}
            <AnimatePresence>
                {partialModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                        onClick={() => setPartialModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            className="pastel-card p-6 w-full max-w-md"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">{t("orders.dlv.partialTitle")}</h3>
                                    <p className="text-sm text-muted">{t("orders.dlv.partialHint")}</p>
                                </div>
                            </div>

                            <div className="space-y-2 mb-5">
                                {partialModal.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)]">
                                        <span className="flex-1 text-sm font-medium">{item.name}</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const updated = [...partialModal.items];
                                                    updated[idx].accepted = Math.max(0, updated[idx].accepted - 1);
                                                    setPartialModal({ ...partialModal, items: updated });
                                                }}
                                                className="w-8 h-8 rounded-lg border-2 border-[var(--card-border)] flex items-center justify-center font-bold hover:border-rose-300 hover:text-rose-600 transition-all"
                                            >
                                                −
                                            </button>
                                            <span className="w-12 text-center font-mono font-bold">
                                                {item.accepted}/{item.quantity}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const updated = [...partialModal.items];
                                                    updated[idx].accepted = Math.min(item.quantity, updated[idx].accepted + 1);
                                                    setPartialModal({ ...partialModal, items: updated });
                                                }}
                                                className="w-8 h-8 rounded-lg border-2 border-[var(--card-border)] flex items-center justify-center font-bold hover:border-emerald-300 hover:text-emerald-600 transition-all"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setPartialModal(null)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border-2 border-[var(--card-border)] text-muted font-semibold hover:bg-[var(--background)] transition-all"
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    onClick={handlePartialSubmit}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-all"
                                >
                                    {t("common.confirm")}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rejection Reason Modal */}
            <AnimatePresence>
                {rejectionModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setRejectionModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                                    <XCircle className="w-5 h-5 text-rose-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">{t("orders.dlv.rejectTitle")}</h3>
                                    <p className="text-sm text-muted">{t("orders.dlv.orderNo", { id: getBaseOrderId(rejectionModal.order.order_id) })}</p>
                                </div>
                            </div>

                            <div className="space-y-3 mb-4">
                                <label className="text-sm font-medium text-muted">{t("orders.dlv.pickReason")}</label>
                                <div className="relative">
                                    <select
                                        value={selectedReason}
                                        onChange={(e) => setSelectedReason(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-[var(--card-border)] bg-[var(--background)] text-foreground font-medium appearance-none cursor-pointer focus:border-rose-300 focus:outline-none transition-all"
                                    >
                                        {REJECTION_REASONS.map((reason) => (
                                            <option key={reason.value} value={reason.value}>
                                                {t(reason.labelKey)}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none" />
                                </div>

                                {selectedReason === "other" && (
                                    <input
                                        type="text"
                                        value={customReason}
                                        onChange={(e) => setCustomReason(e.target.value)}
                                        placeholder={t("orders.dlv.reasonPlaceholder")}
                                        className="w-full px-4 py-3 rounded-xl border-2 border-[var(--card-border)] bg-[var(--background)] text-foreground placeholder:text-[var(--foreground-muted)] focus:border-rose-300 focus:outline-none transition-all"
                                    />
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setRejectionModal(null)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border-2 border-[var(--card-border)] text-muted font-semibold hover:bg-[var(--background)] transition-all"
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    onClick={handleRejectSubmit}
                                    disabled={loadingId === rejectionModal.order.id}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-600 transition-all disabled:opacity-50"
                                >
                                    {loadingId === rejectionModal.order.id ? t("common.saving") : t("orders.dlv.confirmReject")}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
