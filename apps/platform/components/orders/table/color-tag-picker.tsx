"use client";

import { useRef, memo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/supabase';

// Color tag picker (inline mini-popover)
export const TAG_COLORS = [
    { value: null, bg: "bg-gray-200", border: "border-gray-300", label: "None" },
    { value: "yellow", bg: "bg-yellow-300", border: "border-yellow-400", label: "Yellow" },
    { value: "green", bg: "bg-green-300", border: "border-green-400", label: "Green" },
    { value: "blue", bg: "bg-blue-300", border: "border-blue-400", label: "Blue" },
    { value: "pink", bg: "bg-pink-300", border: "border-pink-400", label: "Pink" },
    { value: "purple", bg: "bg-purple-300", border: "border-purple-400", label: "Purple" },
] as const;

export const ColorTagPicker = memo(function ColorTagPicker({ currentColor, orderId, updateOrder }: {
    currentColor: string | null | undefined;
    orderId: string;
    updateOrder?: (id: string, data: Partial<Order>) => Promise<unknown>;
}) {
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

    const current = TAG_COLORS.find(c => c.value === currentColor) || TAG_COLORS[0];

    return (
        <div ref={ref} className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                className={cn("w-5 h-5 rounded-full border-2 transition-all hover:scale-110 cursor-pointer", current.bg, current.border)}
                title={current.label}
            />
            {open && (
                <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 flex items-center gap-1 p-1.5 bg-white rounded-lg shadow-xl border border-gray-100 z-50 animate-in fade-in zoom-in-95 duration-100">
                    {TAG_COLORS.map((color) => (
                        <button
                            key={color.value ?? "none"}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (updateOrder) {
                                    updateOrder(orderId, { tag_color: color.value });
                                }
                                setOpen(false);
                            }}
                            className={cn(
                                "w-5 h-5 rounded-full border-2 transition-all hover:scale-125",
                                color.bg, color.border,
                                currentColor === color.value && "ring-2 ring-offset-1 ring-primary/40"
                            )}
                            title={color.label}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});
