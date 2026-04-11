"use client";

import { useState } from "react";
import { Rocket, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PublishControlsProps {
    isDirty: boolean;
    onPublish: () => Promise<void>;
    onRevert: () => void;
    hasPublished: boolean; // Whether store_config has been published at least once
}

export function PublishControls({ isDirty, onPublish, onRevert, hasPublished }: PublishControlsProps) {
    const [publishing, setPublishing] = useState(false);
    const [confirmRevert, setConfirmRevert] = useState(false);

    const status = !hasPublished
        ? { label: "Draft", color: "bg-gray-400" }
        : isDirty
        ? { label: "Unpublished Changes", color: "bg-amber-400" }
        : { label: "Published", color: "bg-green-500" };

    const handlePublish = async () => {
        setPublishing(true);
        try {
            await onPublish();
        } finally {
            setPublishing(false);
        }
    };

    const handleRevert = () => {
        if (!confirmRevert) {
            setConfirmRevert(true);
            // Auto-dismiss after 3 seconds
            setTimeout(() => setConfirmRevert(false), 3000);
            return;
        }
        onRevert();
        setConfirmRevert(false);
    };

    return (
        <div className="flex items-center gap-2">
            {/* Status badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-(--background) border border-(--card-border)" aria-live="polite" aria-atomic="true">
                <div className={cn("w-2 h-2 rounded-full", status.color)} />
                <span className="text-[10px] font-medium text-muted-foreground">
                    {status.label}
                </span>
            </div>

            {/* Revert button (only when dirty and has published before) */}
            {isDirty && hasPublished && (
                <button
                    type="button"
                    onClick={handleRevert}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                        confirmRevert
                            ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
                            : "border-(--card-border) text-muted-foreground hover:text-foreground hover:bg-(--background)"
                    )}
                >
                    <RotateCcw className="w-3 h-3" />
                    {confirmRevert ? "Confirm Revert?" : "Revert"}
                </button>
            )}

            {/* Publish button */}
            <button
                type="button"
                onClick={handlePublish}
                disabled={!isDirty || publishing}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {publishing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                    <Rocket className="w-3.5 h-3.5" />
                )}
                Publish
            </button>
        </div>
    );
}
