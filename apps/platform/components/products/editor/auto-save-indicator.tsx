"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, AlertCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface AutoSaveIndicatorProps {
    isDirty: boolean;
    saving: boolean;
    /** Retry after a failed save. Saving itself is always an explicit click. */
    onSave: () => Promise<void> | void;
    lastSaveError?: string | null;
}

type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function AutoSaveIndicator({
    isDirty,
    saving,
    onSave,
    lastSaveError,
}: AutoSaveIndicatorProps) {
    const { t } = useLanguage();
    const [status, setStatus] = useState<SaveStatus>("saved");

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
