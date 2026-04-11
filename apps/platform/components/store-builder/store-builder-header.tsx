"use client";

import { useState, useRef, useEffect } from "react";
import {
    Undo2,
    Redo2,
    Monitor,
    Tablet,
    Smartphone,
    ExternalLink,
    Loader2,
    Check,
    AlertCircle,
    Store,
    Share2,
    Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PublishControls } from "./publish-controls";
import type { SaveStatus } from "@/hooks/use-store-builder";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

interface StoreBuilderHeaderProps {
    saveStatus: SaveStatus;
    isDirty: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void;
    onPublish: () => Promise<void>;
    onRevert: () => void;
    hasPublished: boolean;
    previewDevice: PreviewDevice;
    setPreviewDevice: (d: PreviewDevice) => void;
    storefrontUrl: string;
    businessName: string;
    onShareClick: () => void;
}

const DEVICE_OPTIONS: { id: PreviewDevice; icon: typeof Monitor; label: string }[] = [
    { id: "desktop", icon: Monitor, label: "Desktop" },
    { id: "tablet", icon: Tablet, label: "Tablet" },
    { id: "mobile", icon: Smartphone, label: "Mobile" },
];

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
    switch (status) {
        case "saving":
            return (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                </div>
            );
        case "saved":
            return (
                <div className="flex items-center gap-1.5 text-xs text-green-600" aria-live="polite">
                    <Check className="w-3.5 h-3.5" />
                    <span>All changes saved</span>
                </div>
            );
        case "error":
            return (
                <div className="flex items-center gap-1.5 text-xs text-red-500" aria-live="polite">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Save failed</span>
                </div>
            );
        default:
            return null;
    }
}

export function StoreBuilderHeader({
    saveStatus,
    isDirty,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onSave,
    onPublish,
    onRevert,
    hasPublished,
    previewDevice,
    setPreviewDevice,
    storefrontUrl,
    businessName,
    onShareClick,
}: StoreBuilderHeaderProps) {
    return (
        <div className="flex items-center justify-between gap-4 px-6 py-3 shrink-0 border-b border-(--card-border) bg-(--card-bg)">
            {/* Left: Title + Save Status */}
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-(--pastel-mint) flex items-center justify-center shadow-sm">
                    <Store className="w-5 h-5 text-teal-700" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-foreground leading-tight">
                        Store Builder
                    </h1>
                    <div className="h-4">
                        <SaveStatusIndicator status={saveStatus} />
                    </div>
                </div>
            </div>

            {/* Center: Device Toggle */}
            <div className="hidden lg:flex items-center gap-1 bg-(--background) rounded-xl p-1 border border-(--card-border)">
                {DEVICE_OPTIONS.map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setPreviewDevice(id)}
                        aria-label={`Switch to ${label} view`}
                        aria-pressed={previewDevice === id}
                        className={cn(
                            "p-2 rounded-lg transition-all",
                            previewDevice === id
                                ? "bg-(--card-bg) shadow-sm text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Icon className="w-4 h-4" />
                    </button>
                ))}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
                {/* Undo/Redo */}
                <div className="hidden sm:flex items-center gap-1 mr-1">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        aria-label="Undo (Ctrl+Z)"
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-(--background) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        aria-label="Redo (Ctrl+Shift+Z)"
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-(--background) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Redo2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Keyboard Shortcuts */}
                <KeyboardShortcutsPopover />

                {/* Share */}
                <button
                    onClick={onShareClick}
                    title="Share Store"
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                >
                    <Share2 className="w-4 h-4" />
                </button>

                {/* Preview Store */}
                <button
                    onClick={() => window.open(storefrontUrl, "_blank")}
                    className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border border-(--card-border) bg-background hover:bg-(--pastel-mint) hover:text-teal-700"
                >
                    <ExternalLink className="w-4 h-4" />
                    <span>Preview</span>
                </button>

                {/* Save */}
                <button
                    onClick={onSave}
                    disabled={!isDirty || saveStatus === "saving"}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                        "bg-primary text-primary-foreground hover:bg-primary/90",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                >
                    {saveStatus === "saving" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">
                        {saveStatus === "saving" ? "Saving..." : "Save"}
                    </span>
                </button>

                {/* Publish Controls */}
                <PublishControls
                    isDirty={isDirty}
                    onPublish={onPublish}
                    onRevert={onRevert}
                    hasPublished={hasPublished}
                />
            </div>
        </div>
    );
}

/* ---------- Keyboard Shortcuts Popover ---------- */

const SHORTCUTS = [
    { keys: ["Ctrl", "Z"], action: "Undo" },
    { keys: ["Ctrl", "Shift", "Z"], action: "Redo" },
    { keys: ["Ctrl", "S"], action: "Save" },
];

function KeyboardShortcutsPopover() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    return (
        <div className="relative hidden sm:block" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                title="Keyboard shortcuts"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
                <Keyboard className="w-4 h-4" />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-(--card-border) bg-(--card-bg) shadow-lg z-50 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">Keyboard Shortcuts</p>
                    <div className="space-y-2">
                        {SHORTCUTS.map((s) => (
                            <div key={s.action} className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{s.action}</span>
                                <div className="flex items-center gap-1">
                                    {s.keys.map((k) => (
                                        <kbd
                                            key={k}
                                            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-muted text-[10px] font-mono font-medium text-muted-foreground border border-(--card-border)"
                                        >
                                            {k}
                                        </kbd>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
