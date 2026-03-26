"use client";

import { useState, useRef, useEffect, memo } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface InlineEditCellProps {
    value: string;
    orderId: string;
    field: string;
    onSave: (orderId: string, update: Record<string, string>) => Promise<any>;
    onClose: () => void;
    className?: string;
}

export const InlineEditCell = memo(function InlineEditCell({
    value, orderId, field, onSave, onClose, className
}: InlineEditCellProps) {
    const [editValue, setEditValue] = useState(value || "");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const handleSave = async () => {
        const trimmed = editValue.trim();
        if (trimmed === (value || "").trim()) {
            onClose();
            return;
        }
        try {
            await onSave(orderId, { [field]: trimmed });
            toast.success("Updated");
            onClose();
        } catch {
            toast.error("Failed to update");
        }
    };

    return (
        <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") onClose();
                e.stopPropagation();
            }}
            onBlur={handleSave}
            onClick={(e) => e.stopPropagation()}
            className={cn(
                "w-full px-1.5 py-0.5 text-xs border border-blue-300 rounded-md bg-white outline-none ring-2 ring-blue-100 transition-all",
                className
            )}
        />
    );
});
