"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CheckCircle, Loader2, AlertCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface AutoSaveIndicatorProps {
    isDirty: boolean;
    saving: boolean;
    onSave: () => Promise<void> | void;
    debounceMs?: number;
    lastSaveError?: string | null;
}

type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function AutoSaveIndicator({
    isDirty,
    saving,
    onSave,
    debounceMs = 2000,
    lastSaveError,
}: AutoSaveIndicatorProps) {
    const { t } = useLanguage();
    const [status, setStatus] = useState<SaveStatus>("saved");
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const isFirstRender = useRef(true);

    // Determine status from props
    useEffect(() => {
        if (saving) {
            setStatus("saving");
        } else if (lastSaveError) {
            setStatus("error");
        } else if (isDirty) {
            setStatus("unsaved");
        } else {
            setStatus("saved");
        }
    }, [isDirty, saving, lastSaveError]);

    // Auto-save with debounce
    useEffect(() => {
        // Skip auto-save on initial mount
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        if (!isDirty || saving) return;

        timerRef.current = setTimeout(() => {
            onSave();
        }, debounceMs);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [isDirty, saving, onSave, debounceMs]);

    // beforeunload warning
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isDirty]);

    const statusConfig: Record<
        SaveStatus,
        { icon: React.ElementType; text: string; color: string }
    > = {
        saved: {
            icon: CheckCircle,
            text: t("products.editor.allSaved"),
            color: "text-green-600",
        },
        unsaved: {
            icon: Circle,
            text: t("products.editor.unsavedChanges"),
            color: "text-amber-500",
        },
        saving: {
            icon: Loader2,
            text: t("products.editor.saving"),
            color: "text-blue-500",
        },
        error: {
            icon: AlertCircle,
            text: t("products.editor.saveFailed"),
            color: "text-rose-500",
        },
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
        <div className={cn("flex items-center gap-1.5 text-xs font-medium", config.color)}>
            <Icon
                className={cn(
                    "w-3.5 h-3.5",
                    status === "saving" && "animate-spin"
                )}
            />
            <span>{config.text}</span>
            {status === "error" && (
                <button
                    onClick={() => onSave()}
                    className="ml-1 underline hover:no-underline"
                >
                    {t("products.editor.retry")}
                </button>
            )}
        </div>
    );
}
