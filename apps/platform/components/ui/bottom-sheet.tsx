"use client";

// =====================================================================
// BottomSheet — touch-first slide-up drawer primitive
// =====================================================================
// Used by the mobile Builder v2 editor shell to host the Inspector, the
// section picker, the page tree, and the "More" toolbar overflow.
//
// Built on Radix's Dialog primitives (already a dep) plus a small
// drag-to-resize affordance: the user can drag the top handle to snap
// between the default (60vh) and expanded (95vh) heights.
//
// Intentionally minimal — no keyboard-shortcut handling beyond Esc
// (Radix default) since the broader product is touch-first.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface BottomSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Sheet title — rendered in the chrome and used for aria-label. */
    title?: string;
    /** Optional subtitle below the title. */
    subtitle?: string;
    /** When `true`, the merchant can drag the top handle to expand /
     * collapse the sheet between 60vh and 95vh. Defaults to true. */
    draggable?: boolean;
    /** Initial height fraction (0..1). Defaults to 0.6 (60vh). */
    initialHeight?: number;
    /** Optional override for the `data-testid` (default: bottom-sheet). */
    testId?: string;
    /** Sheet body. */
    children: React.ReactNode;
    /** Optional sticky footer (e.g. action buttons). */
    footer?: React.ReactNode;
    /** Optional className applied to the sheet container. */
    className?: string;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function BottomSheet({
    open,
    onOpenChange,
    title,
    subtitle,
    draggable = true,
    initialHeight = 0.6,
    testId = "bottom-sheet",
    children,
    footer,
    className,
}: BottomSheetProps): React.ReactElement {
    const clampedInitial = Math.min(0.95, Math.max(0.3, initialHeight));
    const [heightFraction, setHeightFraction] = useState<number>(clampedInitial);
    const dragStartY = useRef<number | null>(null);
    const dragStartFraction = useRef<number>(clampedInitial);

    // Reset to initial each time the sheet opens.
    useEffect(() => {
        if (open) setHeightFraction(clampedInitial);
    }, [open, clampedInitial]);

    const handleDragStart = useCallback(
        (clientY: number): void => {
            dragStartY.current = clientY;
            dragStartFraction.current = heightFraction;
        },
        [heightFraction],
    );

    const handleDragMove = useCallback((clientY: number): void => {
        if (dragStartY.current === null) return;
        if (typeof window === "undefined") return;
        const vh = window.innerHeight || 1;
        // Drag UP (smaller clientY) → grow the sheet.
        const deltaPx = dragStartY.current - clientY;
        const deltaFraction = deltaPx / vh;
        const next = Math.min(
            0.95,
            Math.max(0.3, dragStartFraction.current + deltaFraction),
        );
        setHeightFraction(next);
    }, []);

    const handleDragEnd = useCallback((): void => {
        dragStartY.current = null;
        // Snap to nearest of [0.6, 0.95]. If the user collapsed below
        // 0.4, close the sheet instead.
        setHeightFraction((curr) => {
            if (curr < 0.4) {
                // Defer closing to the next tick so the snap doesn't fight
                // with state updates.
                onOpenChange(false);
                return clampedInitial;
            }
            if (curr < 0.78) return 0.6;
            return 0.95;
        });
    }, [clampedInitial, onOpenChange]);

    // Pointer events — covers mouse + touch with one path.
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
        if (!draggable) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        handleDragStart(e.clientY);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
        if (!draggable) return;
        handleDragMove(e.clientY);
    };
    const onPointerUp = (): void => {
        if (!draggable) return;
        handleDragEnd();
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay
                    data-testid={`${testId}-backdrop`}
                    className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in"
                />
                <Dialog.Content
                    data-testid={testId}
                    aria-label={title ?? "Drawer"}
                    style={{ height: `${heightFraction * 100}vh` }}
                    className={cn(
                        "fixed inset-x-0 bottom-0 z-[61] flex flex-col rounded-t-2xl border-t border-(--card-border) bg-(--card-bg) shadow-2xl transition-[height] duration-150 ease-out",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                        className,
                    )}
                >
                    {/* Drag handle */}
                    <div
                        data-testid={`${testId}-handle`}
                        role={draggable ? "separator" : undefined}
                        aria-label={draggable ? "Drag to resize" : undefined}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        className={cn(
                            "flex h-6 shrink-0 items-center justify-center",
                            draggable ? "cursor-grab touch-none active:cursor-grabbing" : "",
                        )}
                    >
                        <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
                    </div>

                    {/* Header */}
                    {(title || subtitle) && (
                        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3">
                            <div className="min-w-0">
                                {title && (
                                    <Dialog.Title className="truncate text-base font-semibold text-foreground">
                                        {title}
                                    </Dialog.Title>
                                )}
                                {subtitle && (
                                    <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {subtitle}
                                    </Dialog.Description>
                                )}
                            </div>
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    data-testid={`${testId}-close`}
                                    aria-label="Close"
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                                >
                                    <X className="h-5 w-5" aria-hidden="true" />
                                </button>
                            </Dialog.Close>
                        </div>
                    )}

                    {/* Body */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-1">
                        {children}
                    </div>

                    {/* Footer */}
                    {footer && (
                        <div className="shrink-0 border-t border-(--card-border) bg-(--card-bg) px-4 py-3">
                            {footer}
                        </div>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
