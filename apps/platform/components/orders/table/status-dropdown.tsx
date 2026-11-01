"use client";

import { useRef, memo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { TABLE_STATUS_OPTIONS } from './status-options';
import type { OrderStatus } from '@/lib/supabase';
import { Check, ChevronDown } from 'lucide-react';
import { getStatusBadgeStyle } from '@/lib/order-format-utils';
import { useLanguage } from '@/components/providers/language-provider';
import { getOrderStatusLabel } from '@/lib/order-status-labels';

// Custom status dropdown component (inline, replaces native <select>)
export const StatusDropdown = memo(function StatusDropdown({
    status, orderId, isReturn, updateOrderStatus, onStatusChanged
}: {
    status: OrderStatus; orderId: string; isReturn: boolean;
    updateOrderStatus: (id: string, status: OrderStatus) => Promise<unknown>;
    onStatusChanged?: (orderId: string) => void;
}) {
    const { t, language } = useLanguage();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    if (isReturn) {
        return (
            <span className="w-full px-2 py-1 text-[11px] font-bold rounded-lg bg-purple-100 text-purple-700 text-center block">
                {t("refund.chip")}
            </span>
        );
    }

    const current = TABLE_STATUS_OPTIONS.find(s => s.value === status);

    return (
        <div ref={ref} className="relative w-full">
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                className={cn(
                    "w-full px-2 py-1 text-[11px] font-bold rounded-lg cursor-pointer text-center transition-all flex items-center justify-center gap-1.5",
                    getStatusBadgeStyle(status)
                )}
            >
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", current?.dot || "bg-gray-400")} />
                {getOrderStatusLabel(status, language)}
                <ChevronDown className={cn("w-3 h-3 transition-transform shrink-0", open && "rotate-180")} />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 w-36 py-1 bg-white rounded-xl shadow-xl border border-gray-100 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    {TABLE_STATUS_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (opt.value !== status) {
                                    await updateOrderStatus(orderId, opt.value);
                                    onStatusChanged?.(orderId);
                                }
                                setOpen(false);
                            }}
                            className={cn(
                                "w-full px-3 py-1.5 text-xs font-medium flex items-center gap-2 transition-colors text-right",
                                opt.value === status ? "bg-gray-50 font-bold" : "hover:bg-gray-50"
                            )}
                        >
                            <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dot)} />
                            <span className="flex-1">{getOrderStatusLabel(opt.value, language)}</span>
                            {opt.value === status && <Check className="w-3 h-3 text-primary shrink-0" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
});
