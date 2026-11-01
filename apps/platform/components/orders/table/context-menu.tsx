"use client";

import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Copy, MessageCircle, ExternalLink, ChevronRight, Archive, Trash2, Phone } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";
import { getOrderStatusLabel } from "@/lib/order-status-labels";
import { TABLE_STATUS_OPTIONS } from "./status-options";


interface ContextMenuProps {
    x: number;
    y: number;
    order: Order;
    onClose: () => void;
    onStatusChange: (orderId: string, status: OrderStatus) => Promise<unknown>;
    onOpenDetails: (order: Order) => void;
    onArchive?: (orderId: string) => void;
    onDelete?: (orderId: string) => void;
}

export const OrderContextMenu = memo(function OrderContextMenu({
    x, y, order, onClose, onStatusChange, onOpenDetails, onArchive, onDelete
}: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);
    const { t, language } = useLanguage();
    // A delivered or completed order carries sales, profit and payroll, so its
    // delete takes a second click; the first one only arms it.
    const deleteNeedsConfirm = order.status === "delivered" || order.status === "completed";
    const [deleteArmed, setDeleteArmed] = useState(false);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", handler);
        document.addEventListener("keydown", escHandler);
        return () => {
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("keydown", escHandler);
        };
    }, [onClose]);

    // Adjust position to stay in viewport
    useEffect(() => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            ref.current.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            ref.current.style.top = `${y - rect.height}px`;
        }
    }, [x, y]);

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success(t("orders.toast.copied", { label }));
            onClose();
        }).catch(() => toast.error(t("orders.toast.copyFailed")));
    };

    const phone = order.phone?.replace(/^\+964/, "0").replace(/^964/, "0") || "";
    const orderId = (() => {
        const lfMatch = order.order_id?.match(/LF-(\d+)-\d+$/);
        if (lfMatch) return lfMatch[1];
        return order.order_id?.slice(-6) || "";
    })();

    return (
        <div
            ref={ref}
            style={{ position: "fixed", left: x, top: y, zIndex: 9999 }}
            className="w-52 py-1.5 bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-100"
        >
            {/* Copy actions */}
            <button
                onClick={() => copyToClipboard(phone, t("orders.ctx.phone"))}
                className="w-full px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-gray-50 transition-colors text-gray-700"
            >
                <Phone className="w-3.5 h-3.5 text-gray-400" />
                {t("orders.ctx.copyPhone")}
                <span className="ml-auto text-[11px] text-gray-400 font-mono">⌘C</span>
            </button>
            <button
                onClick={() => copyToClipboard(`#${orderId}`, t("orders.ctx.orderId"))}
                className="w-full px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-gray-50 transition-colors text-gray-700"
            >
                <Copy className="w-3.5 h-3.5 text-gray-400" />
                {t("orders.ctx.copyOrderId")}
            </button>
            {order.address_details && (
                <button
                    onClick={() => copyToClipboard(
                        [order.city, order.address_details].filter(Boolean).join(" - "),
                        t("orders.ctx.address")
                    )}
                    className="w-full px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-gray-50 transition-colors text-gray-700"
                >
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                    {t("orders.ctx.copyAddress")}
                </button>
            )}
            <button
                onClick={() => {
                    window.open(`https://wa.me/964${order.phone?.replace(/^0/, "")}?text=${encodeURIComponent(`مرحباً ${order.customer_name}`)}`, "_blank");
                    onClose();
                }}
                className="w-full px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-gray-50 transition-colors text-green-600"
            >
                <MessageCircle className="w-3.5 h-3.5" />
                {t("orders.ctx.openWhatsapp")}
            </button>

            <div className="h-px bg-gray-100 my-1" />

            {/* Status submenu */}
            <div className="relative group/status">
                <button className="w-full px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-gray-50 transition-colors text-gray-700">
                    <div className={cn("w-2 h-2 rounded-full",
                        TABLE_STATUS_OPTIONS.find(s => s.value === order.status)?.dot || "bg-gray-400"
                    )} />
                    {t("orders.ctx.changeStatus")}
                    <ChevronRight className="w-3 h-3 ml-auto text-gray-400" />
                </button>
                <div className="absolute left-full top-0 ml-1 w-40 py-1 bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-200 hidden group-hover/status:block">
                    {TABLE_STATUS_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={async () => {
                                if (opt.value !== order.status) {
                                    await onStatusChange(order.id, opt.value);
                                }
                                onClose();
                            }}
                            className={cn(
                                "w-full px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors",
                                opt.value === order.status ? "font-bold text-primary" : "text-gray-700"
                            )}
                        >
                            <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dot)} />
                            {getOrderStatusLabel(opt.value, language)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-px bg-gray-100 my-1" />

            {/* Open details */}
            <button
                onClick={() => { onOpenDetails(order); onClose(); }}
                className="w-full px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-gray-50 transition-colors text-gray-700"
            >
                <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                {t("orders.ctx.openDetails")}
                <span className="ml-auto text-[11px] text-gray-400 font-mono">Enter</span>
            </button>

            {onArchive && (
                <button
                    onClick={() => { onArchive(order.id); onClose(); }}
                    className="w-full px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-gray-50 transition-colors text-gray-500"
                >
                    <Archive className="w-3.5 h-3.5" />
                    {t("orders.ctx.archive")}
                </button>
            )}

            {onDelete && (
                <>
                    <div className="h-px bg-gray-100 my-1" />
                    <button
                        onClick={() => {
                            if (deleteNeedsConfirm && !deleteArmed) {
                                setDeleteArmed(true);
                                return;
                            }
                            onDelete(order.id);
                            onClose();
                        }}
                        className={cn(
                            "w-full px-3 py-2 text-xs flex items-center gap-2.5 transition-colors",
                            deleteArmed ? "bg-red-600 text-white hover:bg-red-700" : "text-red-500 hover:bg-red-50",
                        )}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deleteArmed ? t("orders.ctx.deleteConfirm") : t("orders.ctx.delete")}
                    </button>
                </>
            )}
        </div>
    );
});
