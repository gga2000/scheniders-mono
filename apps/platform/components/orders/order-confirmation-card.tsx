"use client";

import { useRef } from "react";
import { Order } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";
import { formatPhoneGrouped } from "@/lib/order-utils";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { captureAndDownload, captureAsBlob, shareImage, copyImageToClipboard } from "@/lib/screenshot";
import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import {
    Download,
    Share2,
    Copy,
    Check,
    Package,
    MapPin,
    Phone,
    Calendar,
    CreditCard,
} from "lucide-react";
import { useState } from "react";

interface OrderConfirmationCardProps {
    order: Order;
    onClose?: () => void;
}

export function OrderConfirmationCard({ order, onClose }: OrderConfirmationCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const { t } = useLanguage();

    const handleDownload = async () => {
        if (!cardRef.current) return;
        setDownloading(true);
        await captureAndDownload(cardRef.current, {
            filename: `order-${order.order_id}.png`,
            scale: 2,
            backgroundColor: "#FDFBF7",
        });
        setDownloading(false);
    };

    const handleShare = async () => {
        if (!cardRef.current) return;
        const blob = await captureAsBlob(cardRef.current, {
            scale: 2,
            backgroundColor: "#FDFBF7",
        });
        if (blob) {
            await shareImage(blob, `Order #${order.order_id}`, `تأكيد طلب ${order.customer_name}`);
        }
    };

    const handleCopy = async () => {
        if (!cardRef.current) return;
        const blob = await captureAsBlob(cardRef.current, {
            scale: 2,
            backgroundColor: "#FDFBF7",
        });
        if (blob) {
            const success = await copyImageToClipboard(blob);
            if (success) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        }
    };

    const total = (order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || Number(order.price)) - (order.discount_amount || 0);

    const statusConfig = {
        new: { label: t("orders.status.new"), color: "bg-orange-100 text-orange-800" },
        contacted: { label: t("orders.status.contacted"), color: "bg-amber-100 text-amber-800" },
        confirmed: { label: t("orders.status.confirmed"), color: "bg-emerald-100 text-emerald-800" },
        cancelled: { label: t("orders.status.cancelled"), color: "bg-gray-100 text-gray-700" },
        in_transit: { label: t("orders.status.in_transit"), color: "bg-blue-100 text-blue-800" },
        delivered: { label: t("orders.status.delivered"), color: "bg-teal-100 text-teal-800" },
        rejected: { label: t("orders.status.rejected"), color: "bg-rose-100 text-rose-800" },
        completed: { label: t("orders.status.completed"), color: "bg-emerald-200 text-emerald-900" },
        no_response: { label: t("orders.status.no_response"), color: "bg-slate-100 text-slate-600" },
        return_pending: { label: t("orders.status.return_pending"), color: "bg-rose-200 text-rose-800" },
        refund_delivered: { label: t("orders.status.refund_delivered"), color: "bg-pink-200 text-pink-900" },
        refund_failed: { label: t("orders.status.refund_failed"), color: "bg-red-200 text-red-900" },
        pending_checkout: { label: t("orders.status.pending_checkout"), color: "bg-yellow-100 text-yellow-800" },
        suspended: { label: t("orders.status.suspended"), color: "bg-orange-100 text-orange-800" },
    };

    const paymentConfig = {
        cod: { label: t("orders.confirm.payment.cod"), color: "bg-amber-50 text-amber-700" },
        prepaid: { label: t("orders.confirm.payment.prepaid"), color: "bg-green-50 text-green-700" },
        partial: { label: t("orders.confirm.payment.partial"), color: "bg-blue-50 text-blue-700" },
        pending: { label: t("orders.confirm.payment.pending"), color: "bg-gray-50 text-gray-700" },
        paid: { label: t("orders.confirm.payment.paid"), color: "bg-emerald-50 text-emerald-700" },
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-[var(--background)] rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
                {/* Header with actions */}
                <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
                    <h3 className="font-bold text-foreground">{t("orders.confirm.title")}</h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            className="p-2 rounded-xl hover:bg-[var(--card-border)] transition-colors"
                            title={t("orders.confirm.copyClipboard")}
                        >
                            {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={handleShare}
                            className="p-2 rounded-xl hover:bg-[var(--card-border)] transition-colors"
                            title={t("orders.confirm.share")}
                        >
                            <Share2 className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="p-2 rounded-xl bg-[var(--pastel-green)] text-green-800 hover:bg-[var(--pastel-green-dark)] transition-colors flex items-center gap-2"
                            title={t("orders.confirm.downloadImage")}
                        >
                            <Download className="w-5 h-5" />
                            {downloading && <span className="text-xs">...</span>}
                        </button>
                    </div>
                </div>

                {/* Capturable Card */}
                <div
                    ref={cardRef}
                    className="p-6 bg-gradient-to-br from-[#FDFBF7] to-[#F5F0E8]"
                    style={{ direction: "rtl" }}
                >
                    {/* Brand Header */}
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg mb-3">
                            <Package className="w-8 h-8 text-white" />
                        </div>
                        <p className="text-sm text-muted">{t("orders.confirm.title")}</p>
                        <p className="text-2xl font-bold text-foreground font-mono">#{order.order_id}</p>
                        {order.delivery_order_id && (
                            <p className="text-sm font-mono text-violet-600 mt-1">
                                🚚 {order.delivery_order_id}
                            </p>
                        )}
                    </div>

                    {/* Status Badge */}
                    <div className="flex justify-center mb-6">
                        <span className={`px-4 py-2 rounded-full text-sm font-bold ${statusConfig[order.status]?.color}`}>
                            {statusConfig[order.status]?.label}
                        </span>
                    </div>

                    {/* Customer Info */}
                    <div className="bg-white/70 rounded-2xl p-4 mb-4 shadow-sm">
                        <p className="text-lg font-bold text-foreground mb-2">{order.customer_name}</p>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-muted">
                                <Phone className="w-4 h-4" />
                                <span className="font-mono" style={{ direction: "ltr" }}>
                                    {formatPhoneGrouped(order.phone) || order.phone}
                                </span>
                            </div>
                            {order.city && (
                                <div className="flex items-center gap-2 text-muted">
                                    <MapPin className="w-4 h-4" />
                                    <span>{order.city}</span>
                                </div>
                            )}
                            {order.address_details && (
                                <p className="text-muted text-xs bg-gray-50 rounded-lg p-2 mt-2">
                                    {order.address_details}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Products */}
                    {order.items && order.items.length > 0 && (
                        <div className="bg-white/70 rounded-2xl p-4 mb-4 shadow-sm">
                            <p className="text-sm font-bold text-foreground mb-3">{t("orders.confirm.products")}</p>
                            <div className="space-y-2">
                                {mergeOrderItems(order.items).map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-sm">
                                        <span className="text-foreground">{item.name}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-muted">×{item.quantity}</span>
                                            <span className="font-mono font-bold">{formatIQD(item.price * item.quantity)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Total */}
                    <div className="bg-gradient-to-r from-emerald-100 to-teal-100 rounded-2xl p-4 text-center shadow-sm">
                        <p className="text-sm text-teal-700 mb-1">{t("orders.confirm.totalAmount")}</p>
                        <p className="text-3xl font-bold text-teal-900 font-mono">{formatIQD(total)}</p>
                        <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${paymentConfig[order.payment_status || "cod"]?.color}`}>
                            <CreditCard className="w-3 h-3 inline ml-1" />
                            {paymentConfig[order.payment_status || "cod"]?.label}
                        </span>
                    </div>

                    {/* Footer */}
                    <div className="mt-6 text-center">
                        <p className="text-xs text-muted flex items-center justify-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(order.created_at).toLocaleDateString("ar-IQ", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </p>
                    </div>
                </div>

                {/* Close Button */}
                {onClose && (
                    <div className="p-4 border-t border-[var(--card-border)]">
                        <button
                            onClick={onClose}
                            className="w-full py-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-foreground hover:bg-[var(--background)] transition-colors font-medium"
                        >
                            {t("orders.confirm.close")}
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
