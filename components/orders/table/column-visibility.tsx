"use client";

import { memo, useState, useRef, useEffect } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_COLUMNS: ReadonlyArray<{ key: string; label: string; locked?: boolean }> = [
    { key: "orderId", label: "Order ID", locked: true },
    { key: "customer", label: "Customer" },
    { key: "phone", label: "Phone" },
    { key: "phone2", label: "Phone 2" },
    { key: "city", label: "City" },
    { key: "address", label: "Address" },
    { key: "products", label: "Products" },
    { key: "amount", label: "Amount" },
    { key: "status", label: "Status" },
    { key: "source", label: "Source" },
    { key: "date", label: "Date" },
    { key: "colorTag", label: "Color Tag" },
];

interface ColumnVisibilityProps {
    hiddenColumns: Set<string>;
    onChange: (hidden: Set<string>) => void;
}

export const ColumnVisibilityToggle = memo(function ColumnVisibilityToggle({
    hiddenColumns,
    onChange,
}: ColumnVisibilityProps) {
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

    const toggle = (key: string) => {
        const next = new Set(hiddenColumns);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onChange(next);
    };

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={cn(
                    "p-1.5 rounded-md transition-all text-xs border border-gray-200 bg-gray-50/50",
                    hiddenColumns.size > 0 ? "text-blue-500" : "text-muted hover:text-foreground"
                )}
                title="Toggle columns"
            >
                <Eye className="w-3.5 h-3.5" />
            </button>
            {open && (
                <div className="absolute top-full right-0 mt-1 w-44 py-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 pb-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Columns</div>
                    {ALL_COLUMNS.map((col) => (
                        <label
                            key={col.key}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 transition-colors",
                                col.locked && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <input
                                type="checkbox"
                                checked={!hiddenColumns.has(col.key)}
                                onChange={() => !col.locked && toggle(col.key)}
                                disabled={col.locked}
                                className="w-3.5 h-3.5 rounded border-gray-300"
                            />
                            <span>{col.label}</span>
                        </label>
                    ))}
                    {hiddenColumns.size > 0 && (
                        <button
                            onClick={() => onChange(new Set())}
                            className="w-full px-3 py-1.5 mt-1 text-[10px] text-blue-500 hover:text-blue-600 font-medium text-center hover:bg-blue-50 transition-colors"
                        >
                            Show All
                        </button>
                    )}
                </div>
            )}
        </div>
    );
});
