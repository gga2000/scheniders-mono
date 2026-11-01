"use client";

import { useState, useRef, useEffect, memo } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";
import { reportOrderError } from "@/lib/order-telemetry";

interface InlineEditCellProps {
    value: string;
    orderId: string;
    field: string;
    onSave: (orderId: string, update: Record<string, string>) => Promise<unknown>;
    onClose: () => void;
    className?: string;
    /**
     * Rejects a value before it is saved. Returning a string shows it and keeps
     * the field open, so a bad edit cannot be committed by tabbing away.
     */
    validate?: (value: string) => string | null;
}

export const InlineEditCell = memo(function InlineEditCell({
    value, orderId, field, onSave, onClose, className, validate
}: InlineEditCellProps) {
    const { t } = useLanguage();
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

        const problem = validate?.(trimmed);
        if (problem) {
            toast.error(problem);
            inputRef.current?.focus();
            return;
        }

        try {
            await onSave(orderId, { [field]: trimmed });
            toast.success(t("orders.toast.updated"));
            onClose();
        } catch (err) {
            // Was a bare `catch {}`: the edit failed, the operator saw a generic
            // toast, and nothing was reported. Keep the field open so the value
            // is not lost, and record why it failed.
            reportOrderError(err, { operation: "orders-inline-edit", orderId, extra: { field } });
            toast.error(
                t("orders.toast.saveFailed"),
                err instanceof Error ? err.message : undefined,
            );
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
