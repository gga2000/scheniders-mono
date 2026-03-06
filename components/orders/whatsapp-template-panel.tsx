"use client";

import { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    MessageCircle,
    Copy,
    Check,
    Sparkles,
    Bell,
    Gift,
    ArrowRight,
    Phone,
    Eye,
    EyeOff,
    Percent,
    Send,
    Loader2,
} from "lucide-react";
import { cn, formatIQD, generateWhatsAppLink, getBaseOrderId } from "@/lib/utils";
import { processEmojis } from "@/lib/emoji-shortcodes";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import type { MessageTemplate, Order } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

interface WhatsAppTemplatePanelProps {
    open: boolean;
    onClose: () => void;
    order: Order;
    templates: MessageTemplate[];
    onContactSent?: (orderId: string, newCount: number) => void; // Callback when message is sent
    onStatusUpdate?: (orderId: string, newStatus: Order["status"]) => void; // Callback when status changes
}

// Template type configuration
const templateConfig = {
    confirmation: {
        icon: MessageCircle,
        label: "تأكيد الطلب",
        labelEn: "Confirmation",
        description: "First contact message",
        color: "emerald",
        bgClass: "bg-emerald-50 border-emerald-200",
        iconBgClass: "bg-emerald-100",
        iconClass: "text-emerald-600",
        badgeClass: "bg-emerald-100 text-emerald-700",
        recommended: true,
    },
    reminder: {
        icon: Bell,
        label: "تذكير",
        labelEn: "Reminder",
        description: "No response follow-up",
        color: "amber",
        bgClass: "bg-amber-50 border-amber-200",
        iconBgClass: "bg-amber-100",
        iconClass: "text-amber-600",
        badgeClass: "bg-amber-100 text-amber-700",
        recommended: false,
    },
    discount: {
        icon: Gift,
        label: "عرض خاص",
        labelEn: "Discount Offer",
        description: "Sweeten the deal",
        color: "rose",
        bgClass: "bg-rose-50 border-rose-200",
        iconBgClass: "bg-rose-100",
        iconClass: "text-rose-600",
        badgeClass: "bg-rose-100 text-rose-700",
        recommended: false,
    },
};

export function WhatsAppTemplatePanel({
    open,
    onClose,
    order,
    templates,
    onContactSent,
    onStatusUpdate,
}: WhatsAppTemplatePanelProps) {
    const [selectedType, setSelectedType] = useState<'confirmation' | 'reminder' | 'discount'>('confirmation');
    const [showPreview, setShowPreview] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [discountPercent, setDiscountPercent] = useState(10);
    const [sendingTo, setSendingTo] = useState<string | null>(null); // Track which phone is sending
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

    // Get the template for the selected type
    const selectedTemplate = useMemo(() => {
        return templates.find(t => t.template_type === selectedType) || templates[0];
    }, [templates, selectedType]);

    // Process template with order data and emoji shortcodes
    const processTemplate = (content: string): string => {
        if (!order) return content;

        // Build product name(s) - show with + sign if multiple
        const items = order.items || [];
        let productDisplay = "";
        if (items.length === 0) {
            productDisplay = "المنتج";
        } else if (items.length === 1) {
            productDisplay = items[0].name;
        } else {
            // Multiple items: "Product1 + Product2 + ..."
            productDisplay = items.map(item => item.name).join(" + ");
        }

        // Calculate items count
        const itemsCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

        // Calculate discount percentage from items compare_at_price if available
        const firstItem = items[0];
        const orderPrice = order.price || 0;

        // Try to calculate discount from compare_at_price
        let calculatedDiscount = 0;
        let originalPrice = orderPrice;

        if (firstItem?.compare_at_price && firstItem.compare_at_price > firstItem.price) {
            // Calculate discount from compare_at_price
            calculatedDiscount = Math.round((1 - firstItem.price / firstItem.compare_at_price) * 100);
            // Calculate total original price based on compare_at_price
            originalPrice = items.reduce((sum, item) => {
                const comparePrice = item.compare_at_price || item.price;
                return sum + (comparePrice * (item.quantity || 1));
            }, 0);
        }

        // Use calculated discount if available, otherwise use slider
        const activeDiscount = calculatedDiscount > 0 ? calculatedDiscount : discountPercent;
        const discountedPrice = calculatedDiscount > 0
            ? orderPrice  // If we have compare_at_price, order.price is already discounted
            : Math.round(orderPrice * (1 - discountPercent / 100));  // Otherwise apply slider discount

        // For display: original price is compare_at_price total, or order price if no discount
        const displayOriginalPrice = calculatedDiscount > 0 ? originalPrice : orderPrice;

        // Build full address: combine city (governorate) with address details
        // If city and address_details both exist, show "city - address_details"
        const city = order.city || "";
        const addressDetails = order.address_details || "";
        let fullAddress = "";
        if (city && addressDetails) {
            fullAddress = `${city} - ${addressDetails}`;
        } else {
            fullAddress = city || addressDetails || "";
        }

        // Format phone numbers for display (Iraqi format)
        const formattedPhone = formatPhoneForDisplay(order.phone) || order.phone || "";
        const formattedSecondaryPhone = formatPhoneForDisplay(order.secondary_phone) || "";

        // Replace variables
        let processed = content
            .replace(/\{customer_name\}/g, order.customer_name || "")
            .replace(/\{order_id\}/g, order.order_id || "")
            .replace(/\{sequence_number\}/g, order.sequence_number?.toString() || getBaseOrderId(order.order_id))
            .replace(/\{product\}/g, productDisplay)
            .replace(/\{products\}/g, productDisplay)
            .replace(/\{items_count\}/g, itemsCount.toString())
            .replace(/\{address\}/g, fullAddress)
            .replace(/\{phone\}/g, formattedPhone)
            .replace(/\{secondary_phone\}/g, formattedSecondaryPhone || "—")
            .replace(/\{original_price\}/g, formatIQD(displayOriginalPrice))
            .replace(/\{price\}/g, formatIQD(orderPrice))
            .replace(/\{discounted_price\}/g, formatIQD(discountedPrice))
            .replace(/\{discount_percent\}/g, activeDiscount.toString())
            .replace(/\{city\}/g, city)
            .replace(/\{status\}/g, order.status || "");

        // Convert emoji shortcodes to actual emojis
        processed = processEmojis(processed);

        return processed;
    };

    const handleCopy = async () => {
        if (!selectedTemplate) return;
        const processed = processTemplate(selectedTemplate.content_ar || selectedTemplate.content);
        await navigator.clipboard.writeText(processed);
        setCopiedId(selectedTemplate.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleSendWhatsApp = (phone: string) => {
        if (!selectedTemplate) return;
        const processed = processTemplate(selectedTemplate.content_ar || selectedTemplate.content);
        const link = generateWhatsAppLink(phone, processed);
        window.open(link, "_blank");

        // Increment contact count
        const newCount = (order.contact_count || 0) + 1;
        if (onContactSent) {
            onContactSent(order.id, newCount);
        }

        onClose();
    };

    /**
     * Send the confirmation template via Interakt API (auto-updates status to contacted)
     */
    const handleSendTemplate = async (phone: string) => {
        setSendingTo(phone);
        setSendResult(null);

        try {
            const res = await fetch("/api/webhooks/interakt/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    order,
                    overridePhone: phone !== order.phone ? phone : undefined,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setSendResult({ success: true, message: "✅ تم إرسال الرسالة بنجاح" });

                // Increment contact count
                const newCount = (order.contact_count || 0) + 1;
                if (onContactSent) {
                    onContactSent(order.id, newCount);
                }

                // Notify parent about status change
                if (onStatusUpdate) {
                    onStatusUpdate(order.id, "contacted");
                }

                // Auto-close after 1.5s
                setTimeout(() => {
                    onClose();
                    setSendResult(null);
                }, 1500);
            } else {
                setSendResult({ success: false, message: `❌ ${data.error || "فشل الإرسال"}` });
            }
        } catch (err) {
            setSendResult({ success: false, message: "❌ خطأ في الاتصال" });
        } finally {
            setSendingTo(null);
        }
    };

    const processedContent = selectedTemplate
        ? processTemplate(selectedTemplate.content_ar || selectedTemplate.content)
        : "";

    const primaryDisplay = formatPhoneForDisplay(order.phone) || order.phone;
    const secondaryDisplay = order.secondary_phone ? formatPhoneForDisplay(order.secondary_phone) : null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-lg">
                            <MessageCircle className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <span className="text-lg">Select WhatsApp Template</span>
                            <p className="text-sm text-muted font-normal">
                                Sending to <strong>{order.customer_name}</strong>
                            </p>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4 space-y-4">
                    {/* Template Type Selection */}
                    <div className="grid grid-cols-3 gap-3">
                        {(Object.keys(templateConfig) as Array<keyof typeof templateConfig>).map((type) => {
                            const config = templateConfig[type];
                            const Icon = config.icon;
                            const isSelected = selectedType === type;
                            const hasTemplate = templates.some(t => t.template_type === type);

                            return (
                                <motion.button
                                    key={type}
                                    onClick={() => {
                                        setSelectedType(type);
                                        setShowPreview(true);
                                    }}
                                    disabled={!hasTemplate}
                                    whileHover={{ scale: hasTemplate ? 1.02 : 1 }}
                                    whileTap={{ scale: hasTemplate ? 0.98 : 1 }}
                                    className={cn(
                                        "relative p-4 rounded-xl border-2 transition-all text-center",
                                        isSelected
                                            ? `${config.bgClass} border-2 shadow-md`
                                            : "border-[var(--card-border)] hover:border-gray-300 bg-white",
                                        !hasTemplate && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {config.recommended && (
                                        <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow-sm">
                                            ✓ NEW
                                        </span>
                                    )}

                                    <div className={cn(
                                        "w-12 h-12 rounded-xl mx-auto mb-2 flex items-center justify-center",
                                        isSelected ? config.iconBgClass : "bg-gray-100"
                                    )}>
                                        <Icon className={cn(
                                            "w-6 h-6",
                                            isSelected ? config.iconClass : "text-gray-500"
                                        )} />
                                    </div>

                                    <h3 className="font-bold text-foreground text-sm" dir="rtl">
                                        {config.label}
                                    </h3>
                                    <p className="text-[11px] text-muted mt-0.5">
                                        {config.description}
                                    </p>
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Discount Slider (only for discount type) */}
                    <AnimatePresence>
                        {selectedType === 'discount' && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="bg-rose-50 rounded-xl p-4 border border-rose-200">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Percent className="w-4 h-4 text-rose-600" />
                                            <span className="font-semibold text-rose-900">Discount Amount</span>
                                        </div>
                                        <span className="text-2xl font-bold text-rose-600">{discountPercent}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="5"
                                        max="30"
                                        step="5"
                                        value={discountPercent}
                                        onChange={(e) => setDiscountPercent(Number(e.target.value))}
                                        className="w-full h-2 bg-rose-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                    />
                                    <div className="flex justify-between text-xs text-rose-600 mt-1">
                                        <span>5%</span>
                                        <span>30%</span>
                                    </div>
                                    <div className="mt-3 p-2 bg-white rounded-lg border border-rose-100">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">Original Price:</span>
                                            <span className="font-mono">{formatIQD(order.price)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm font-bold text-rose-600">
                                            <span>After Discount:</span>
                                            <span className="font-mono">{formatIQD(Math.round(order.price * (1 - discountPercent / 100)))}</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Preview Section */}
                    <div className="space-y-2">
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
                        >
                            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            {showPreview ? "Hide Preview" : "Show Preview"}
                        </button>

                        <AnimatePresence>
                            {showPreview && selectedTemplate && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-[#e5ddd5] rounded-xl p-4 border border-gray-200">
                                        {/* WhatsApp-style message bubble */}
                                        <div className="bg-[#dcf8c6] rounded-lg p-3 max-w-[90%] ml-auto shadow-sm">
                                            <p
                                                className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed"
                                                dir="rtl"
                                            >
                                                {processedContent}
                                            </p>
                                            <div className="flex items-center justify-end gap-1 mt-2">
                                                <span className="text-[10px] text-gray-500">
                                                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <Check className="w-3 h-3 text-blue-500" />
                                                <Check className="w-3 h-3 text-blue-500 -ml-2" />
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Send Result Message */}
                    <AnimatePresence>
                        {sendResult && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className={cn(
                                    "p-3 rounded-xl text-center text-sm font-semibold",
                                    sendResult.success
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : "bg-red-50 text-red-700 border border-red-200"
                                )}
                                dir="rtl"
                            >
                                {sendResult.message}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Action Buttons */}
                <DialogFooter className="border-t border-[var(--card-border)] pt-4 mt-2">
                    <div className="flex flex-col gap-3 w-full">
                        {/* Row 1: Send Template via Interakt API */}
                        {selectedType === 'confirmation' && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleSendTemplate(order.phone)}
                                    disabled={!!sendingTo}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold hover:from-blue-600 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-60"
                                >
                                    {sendingTo === order.phone ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                    <span>إرسال قالب التأكيد</span>
                                    <span className="text-xs opacity-75">({primaryDisplay})</span>
                                </button>

                                {/* Send to secondary phone */}
                                {order.secondary_phone && (
                                    <button
                                        onClick={() => handleSendTemplate(order.secondary_phone!)}
                                        disabled={!!sendingTo}
                                        className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-indigo-500 text-white font-semibold hover:bg-indigo-600 transition-all disabled:opacity-60"
                                        title={`إرسال قالب التأكيد إلى ${secondaryDisplay}`}
                                    >
                                        {sendingTo === order.secondary_phone ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                        <span className="text-xs">2nd</span>
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Row 2: Copy + WhatsApp Web */}
                        <div className="flex items-center gap-2">
                            {/* Copy Button */}
                            <button
                                onClick={handleCopy}
                                className={cn(
                                    "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all",
                                    copiedId
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                )}
                            >
                                {copiedId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copiedId ? "Copied!" : "Copy"}
                            </button>

                            {/* WhatsApp Web Buttons */}
                            <div className="flex-1 flex gap-2">
                                {/* Primary Phone */}
                                <button
                                    onClick={() => handleSendWhatsApp(order.phone)}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:from-green-600 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg"
                                >
                                    <MessageCircle className="w-5 h-5" />
                                    <span>Send WhatsApp</span>
                                    <ArrowRight className="w-4 h-4" />
                                </button>

                                {/* Secondary Phone (if exists) */}
                                {order.secondary_phone && (
                                    <button
                                        onClick={() => handleSendWhatsApp(order.secondary_phone!)}
                                        className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-all"
                                        title="Send to secondary phone"
                                    >
                                        <Phone className="w-4 h-4" />
                                        <span className="text-xs">2nd</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

