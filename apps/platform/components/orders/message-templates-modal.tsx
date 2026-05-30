"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui/dialog";
import { MessageCircle, Copy, Check, Sparkles, X, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageTemplate, Order } from "@/lib/supabase";
import { generateWhatsAppLink } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface MessageTemplatesModalProps {
    open: boolean;
    onClose: () => void;
    templates: MessageTemplate[];
    order?: Order | null;
}

export function MessageTemplatesModal({
    open,
    onClose,
    templates,
    order,
}: MessageTemplatesModalProps) {
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
    const { t } = useLanguage();

    // Replace placeholders in template
    const processTemplate = (content: string, orderData?: Order | null): string => {
        if (!orderData) return content;

        return content
            .replace(/\{customer_name\}/g, orderData.customer_name || "")
            .replace(/\{order_id\}/g, orderData.order_id || "")
            .replace(/\{price\}/g, orderData.price?.toString() || "")
            .replace(/\{city\}/g, orderData.city || "")
            .replace(/\{status\}/g, orderData.status || "")
            .replace(/\{product\}/g, orderData.items?.[0]?.name || "your order");
    };

    const handleCopy = async (template: MessageTemplate) => {
        const processed = processTemplate(template.content, order);
        await navigator.clipboard.writeText(processed);
        setCopiedId(template.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleSendWhatsApp = (template: MessageTemplate) => {
        if (!order) return;
        const processed = processTemplate(template.content, order);
        const link = generateWhatsAppLink(order.phone, processed);
        window.open(link, "_blank");
        onClose();
    };

    // Group templates by category
    const groupedTemplates = templates.reduce((acc, template) => {
        const category = template.category || "general";
        if (!acc[category]) acc[category] = [];
        acc[category].push(template);
        return acc;
    }, {} as Record<string, MessageTemplate[]>);

    const categoryLabels: Record<string, { label: string; color: string }> = {
        confirmation: { label: t("orders.msgTemplate.confirmation"), color: "bg-green-100 text-green-700" },
        followup: { label: t("orders.msgTemplate.followup"), color: "bg-blue-100 text-blue-700" },
        delivery: { label: t("orders.msgTemplate.delivery"), color: "bg-teal-100 text-teal-700" },
        rejection: { label: t("orders.msgTemplate.rejection"), color: "bg-rose-100 text-rose-700" },
        general: { label: t("orders.msgTemplate.general"), color: "bg-gray-100 text-gray-700" },
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                            <MessageCircle className="w-4 h-4 text-green-900" />
                        </div>
                        Message Templates
                    </DialogTitle>
                    <DialogDescription>
                        {order ? (
                            <span>Select a template to send to <strong>{order.customer_name}</strong></span>
                        ) : (
                            <span>Quick message templates for WhatsApp</span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                        <div key={category}>
                            <h3 className={cn(
                                "inline-block px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-wider mb-3",
                                categoryLabels[category]?.color || categoryLabels.general.color
                            )}>
                                {categoryLabels[category]?.label || category}
                            </h3>
                            <div className="space-y-2">
                                {categoryTemplates.map((template) => {
                                    const processed = processTemplate(template.content, order);
                                    const isCopied = copiedId === template.id;
                                    const isPreviewing = previewTemplate === template.id;

                                    return (
                                        <div
                                            key={template.id}
                                            className={cn(
                                                "border rounded-xl p-4 transition-all",
                                                isPreviewing ? "border-green-300 bg-green-50" : "border-[var(--card-border)] hover:border-[var(--foreground-muted)]"
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-foreground mb-1">{template.name}</h4>
                                                    <p className="text-sm text-muted whitespace-pre-wrap" dir="rtl">
                                                        {isPreviewing ? processed : template.content}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {order && (
                                                        <button
                                                            onClick={() => setPreviewTemplate(isPreviewing ? null : template.id)}
                                                            className={cn(
                                                                "p-2 rounded-lg transition-all",
                                                                isPreviewing ? "bg-green-200 text-green-700" : "hover:bg-gray-100 text-muted"
                                                            )}
                                                            title="Preview with order data"
                                                        >
                                                            <Sparkles className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleCopy(template)}
                                                        className={cn(
                                                            "p-2 rounded-lg transition-all",
                                                            isCopied ? "bg-green-100 text-green-600" : "hover:bg-gray-100 text-muted"
                                                        )}
                                                        title="Copy to clipboard"
                                                    >
                                                        {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                    {order && (
                                                        <button
                                                            onClick={() => handleSendWhatsApp(template)}
                                                            className="p-2 rounded-lg bg-green-100 text-green-600 hover:bg-green-200 transition-all"
                                                            title="Send via WhatsApp"
                                                        >
                                                            <MessageCircle className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {templates.length === 0 && (
                        <div className="text-center py-8">
                            <MessageCircle className="w-12 h-12 text-muted mx-auto mb-3" />
                            <p className="text-foreground font-medium">No templates available</p>
                            <p className="text-sm text-muted">Message templates will appear here</p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)] transition-all"
                    >
                        Close
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
