"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useUpdateProductMutation } from "@/hooks/use-products-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, AlertCircle } from "lucide-react";

// =============================================
// TYPES
// =============================================

interface InlineEditCellProps {
    value: string | number;
    field: string; // 'name' | 'price' | 'cost' | 'stock_quantity' | 'sku'
    productId: string;
    type?: "text" | "number" | "currency";
    className?: string;
    displayValue?: string; // formatted display (e.g. "IQD 36,750")
    onSaved?: () => void;
    onUndoCapture?: (undo: () => void) => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

// =============================================
// CONSTANTS
// =============================================

const DATA_ATTR = "data-inline-edit-cell";
const SAVED_FLASH_DURATION = 1500;

// =============================================
// HELPERS
// =============================================

function parseEditValue(raw: string, type: InlineEditCellProps["type"]): string | number {
    if (type === "number" || type === "currency") {
        // Strip all non-numeric characters except dots and minus
        const cleaned = raw.replace(/[^0-9.\-]/g, "");
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    }
    return raw.trim();
}

function formatForEdit(value: string | number, type: InlineEditCellProps["type"]): string {
    if (type === "currency") {
        // Strip formatting, show raw number for editing
        return String(typeof value === "string" ? parseFloat(value.replace(/[^0-9.\-]/g, "")) || 0 : value);
    }
    return String(value);
}

function getInputType(type: InlineEditCellProps["type"]): string {
    if (type === "number" || type === "currency") return "number";
    return "text";
}

// =============================================
// COMPONENT
// =============================================

export function InlineEditCell({
    value,
    field,
    productId,
    type = "text",
    className,
    displayValue,
    onSaved,
    onUndoCapture,
}: InlineEditCellProps) {
    const { t } = useLanguage();
    const updateMutation = useUpdateProductMutation();

    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(() => formatForEdit(value, type));
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [previousValue, setPreviousValue] = useState(value);

    const inputRef = useRef<HTMLInputElement>(null);
    const cellRef = useRef<HTMLDivElement>(null);
    const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync external value changes
    useEffect(() => {
        if (!isEditing) {
            setEditValue(formatForEdit(value, type));
            setPreviousValue(value);
        }
    }, [value, type, isEditing]);

    // Focus input when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        };
    }, []);

    const enterEditMode = useCallback(() => {
        setEditValue(formatForEdit(value, type));
        setIsEditing(true);
        setSaveStatus("idle");
        setErrorMessage(null);
    }, [value, type]);

    const cancelEdit = useCallback(() => {
        setEditValue(formatForEdit(value, type));
        setIsEditing(false);
        setSaveStatus("idle");
        setErrorMessage(null);
    }, [value, type]);

    const saveEdit = useCallback(async () => {
        const parsed = parseEditValue(editValue, type);

        // No change — just exit (use loose equality to handle string/number coercion)
        if (parsed == value) {
            setIsEditing(false);
            return;
        }

        // Validate
        if (type === "number" || type === "currency") {
            if (typeof parsed === "number" && parsed < 0 && field !== "cost") {
                setErrorMessage(t("products.inline.invalidValue") || "Invalid value");
                setSaveStatus("error");
                return;
            }
        }
        if (type === "text" && (parsed === "" || String(parsed).trim() === "")) {
            setErrorMessage(t("products.inline.required") || "This field is required");
            setSaveStatus("error");
            return;
        }

        const oldValue = value;
        setSaveStatus("saving");
        setIsEditing(false);

        try {
            await updateMutation.mutateAsync({
                id: productId,
                data: { [field]: parsed },
            });

            setSaveStatus("saved");

            // Expose undo function
            if (onUndoCapture) {
                onUndoCapture(() => {
                    updateMutation.mutate({
                        id: productId,
                        data: { [field]: oldValue },
                    });
                    toast.info(t("products.inline.undone") || "Change undone");
                });
            }

            onSaved?.();

            // Clear saved status after flash
            statusTimeoutRef.current = setTimeout(() => {
                setSaveStatus("idle");
            }, SAVED_FLASH_DURATION);
        } catch (err: any) {
            setSaveStatus("error");
            setErrorMessage(err?.message || t("products.inline.saveFailed") || "Failed to save");
            toast.error(t("products.inline.saveFailed") || "Failed to save", {
                description: err?.message,
            });

            // Revert displayed value
            setEditValue(formatForEdit(oldValue, type));

            statusTimeoutRef.current = setTimeout(() => {
                setSaveStatus("idle");
                setErrorMessage(null);
            }, 3000);
        }
    }, [editValue, type, value, field, productId, updateMutation, onSaved, onUndoCapture, t]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                saveEdit();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
            } else if (e.key === "Tab") {
                e.preventDefault();
                saveEdit();

                // Move to next inline-edit cell
                const allCells = document.querySelectorAll(`[${DATA_ATTR}]`);
                const cellsArray = Array.from(allCells);
                const currentIndex = cellsArray.indexOf(cellRef.current!);
                const nextIndex = e.shiftKey
                    ? (currentIndex - 1 + cellsArray.length) % cellsArray.length
                    : (currentIndex + 1) % cellsArray.length;
                const nextCell = cellsArray[nextIndex] as HTMLElement;
                if (nextCell) {
                    // Trigger double-click on the next cell to enter edit mode
                    nextCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
                }
            }
        },
        [saveEdit, cancelEdit]
    );

    const isEditingRef = useRef(isEditing);
    isEditingRef.current = isEditing;

    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleBlur = useCallback(() => {
        // Small delay to allow Tab handling to take precedence
        blurTimeoutRef.current = setTimeout(() => {
            if (isEditingRef.current) {
                saveEdit();
            }
        }, 100);
    }, [saveEdit]);

    // Clean up blur timeout on unmount
    useEffect(() => {
        return () => {
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        };
    }, []);

    // Determine display text
    const renderedDisplay = displayValue
        ? displayValue
        : type === "currency"
          ? formatIQD(typeof value === "string" ? parseFloat(value) || 0 : value)
          : String(value);

    return (
        <div
            ref={cellRef}
            {...{ [DATA_ATTR]: true }}
            data-product-id={productId}
            data-field={field}
            className={cn("relative group/inline-edit inline-flex items-center min-w-0", className)}
        >
            <AnimatePresence mode="wait">
                {isEditing ? (
                    <motion.div
                        key="input"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className="w-full"
                    >
                        <input
                            ref={inputRef}
                            type={getInputType(type)}
                            value={editValue}
                            onChange={(e) => {
                                setEditValue(e.target.value);
                                if (saveStatus === "error") {
                                    setSaveStatus("idle");
                                    setErrorMessage(null);
                                }
                            }}
                            onKeyDown={handleKeyDown}
                            onBlur={handleBlur}
                            step={type === "currency" ? "250" : type === "number" ? "1" : undefined}
                            min={type === "number" || type === "currency" ? "0" : undefined}
                            className={cn(
                                "w-full px-2 py-1 text-sm rounded-lg border-2 outline-none transition-all",
                                "bg-[var(--card-bg)] text-foreground",
                                saveStatus === "error"
                                    ? "border-red-500 ring-2 ring-red-500/20"
                                    : "border-blue-500 ring-2 ring-blue-500/20"
                            )}
                            aria-label={`${t("products.inline.editing") || "Editing"} ${field}`}
                        />
                    </motion.div>
                ) : (
                    <motion.span
                        key="display"
                        onDoubleClick={enterEditMode}
                        className={cn(
                            "cursor-text px-2 py-1 rounded-lg transition-all duration-200 truncate",
                            "hover:bg-[var(--card-border)]/50",
                            saveStatus === "saving" && "opacity-60",
                            saveStatus === "saved" && "animate-saved-flash",
                            saveStatus === "error" && "animate-error-flash"
                        )}
                        title={
                            saveStatus === "error"
                                ? errorMessage || ""
                                : t("products.inline.doubleClickToEdit") || "Double-click to edit"
                        }
                    >
                        {renderedDisplay}
                        {saveStatus === "saving" && (
                            <span className="inline-block ml-1.5 w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        )}
                    </motion.span>
                )}
            </AnimatePresence>

            {/* Saved indicator */}
            <AnimatePresence>
                {saveStatus === "saved" && (
                    <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -4 }}
                        className="ml-1 text-emerald-500"
                    >
                        <Check className="w-3.5 h-3.5" />
                    </motion.span>
                )}
                {saveStatus === "error" && (
                    <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -4 }}
                        className="ml-1 text-red-500 cursor-help"
                        title={errorMessage || ""}
                    >
                        <AlertCircle className="w-3.5 h-3.5" />
                    </motion.span>
                )}
            </AnimatePresence>
        </div>
    );
}

export default InlineEditCell;
