"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@scheniders/shared";
import { forwardRef, ComponentPropsWithoutRef, ElementRef, useState, useRef, useEffect } from "react";
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from "framer-motion";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef<
    ElementRef<typeof DialogPrimitive.Overlay>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-in",
            className
        )}
        {...props}
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Standard dialog content (existing behavior)
interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
    hideCloseButton?: boolean;
}

const DialogContent = forwardRef<
    ElementRef<typeof DialogPrimitive.Content>,
    DialogContentProps
>(({ className, children, hideCloseButton = false, ...props }, ref) => (
    <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
            ref={ref}
            aria-describedby={props["aria-describedby"] ?? undefined}
            // Prevent dialog from closing when clicking on portal-rendered components (like DateTimePicker)
            onPointerDownOutside={(e) => {
                // Check if the click target is inside a portal element that should be ignored
                const target = e.target as HTMLElement;
                const portalElement = target.closest('[data-portal-ignore="true"]');
                if (portalElement) {
                    e.preventDefault();
                }
            }}
            onInteractOutside={(e) => {
                // Also prevent interaction-based closing for portals
                const target = e.target as HTMLElement;
                const portalElement = target.closest('[data-portal-ignore="true"]');
                if (portalElement) {
                    e.preventDefault();
                }
            }}
            className={cn(
                // Mobile: Full screen with safe areas
                "fixed inset-0 z-50 md:inset-auto",
                "md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%]",
                // Styling
                "bg-[var(--card-bg)] shadow-xl duration-200",
                "md:rounded-[24px] md:border md:border-[var(--card-border)]",
                // Size constraints
                "w-full md:max-w-3xl md:max-h-[90vh]",
                // CRITICAL: overflow-hidden clips scrollbar to rounded corners
                "overflow-hidden flex flex-col",
                // Animation
                "data-[state=open]:animate-slide-in-up",
                className
            )}
            {...props}
        >
            {/* Inner scrollable area — stays inside the rounded clip */}
            <div
                className="flex-1 overflow-y-auto p-4 md:p-6"
                style={{
                    paddingTop: "max(1rem, env(safe-area-inset-top))",
                    paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                }}
            >
                {children}
            </div>
            {!hideCloseButton && (
                <DialogPrimitive.Close className="absolute right-3 top-3 md:right-4 md:top-4 rounded-xl p-2.5 md:p-2 text-[var(--foreground-muted)] transition-all hover:text-foreground hover:bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] disabled:pointer-events-none touch-target">
                    <X className="h-5 w-5 md:h-5 md:w-5" />
                    <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
            )}
        </DialogPrimitive.Content>
    </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

// Bottom Sheet Content - Mobile-First with Swipe Gestures
interface BottomSheetContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
    onClose?: () => void;
    hideCloseButton?: boolean;
}

const BottomSheetContent = forwardRef<
    ElementRef<typeof DialogPrimitive.Content>,
    BottomSheetContentProps
>(({ className, children, onClose, hideCloseButton = false, ...props }, ref) => {
    const y = useMotionValue(0);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Calculate backdrop opacity based on drag position
    const backdropOpacity = useTransform(y, [0, 400], [0.4, 0]);

    // Threshold for dismissal (in pixels)
    const DISMISS_THRESHOLD = 150;

    const handleDragEnd = (_: any, info: PanInfo) => {
        setIsDragging(false);

        // If dragged down past threshold or with high velocity, dismiss
        if (info.offset.y > DISMISS_THRESHOLD || info.velocity.y > 500) {
            onClose?.();
        }
    };

    const handleDragStart = () => {
        setIsDragging(true);
    };

    return (
        <DialogPortal>
            {/* Custom Overlay with animated opacity */}
            <motion.div
                className="fixed inset-0 z-50 bg-black backdrop-blur-sm"
                style={{ opacity: backdropOpacity }}
                onClick={onClose}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
            />

            <DialogPrimitive.Content
                ref={ref}
                aria-describedby={props["aria-describedby"] ?? undefined}
                asChild
                // Prevent dialog from closing when clicking on portal-rendered components (like DateTimePicker)
                onPointerDownOutside={(e) => {
                    const target = e.target as HTMLElement;
                    const portalElement = target.closest('[data-portal-ignore="true"]');
                    if (portalElement) {
                        e.preventDefault();
                    }
                }}
                onInteractOutside={(e) => {
                    const target = e.target as HTMLElement;
                    const portalElement = target.closest('[data-portal-ignore="true"]');
                    if (portalElement) {
                        e.preventDefault();
                    }
                }}
                {...props}
            >
                <motion.div
                    ref={containerRef}
                    className={cn(
                        // Bottom sheet positioning
                        "fixed bottom-0 left-0 right-0 z-50",
                        // Rounded top corners
                        "rounded-t-[28px]",
                        // Background and shadow
                        "bg-[var(--card-bg)] shadow-[0_-10px_60px_rgba(0,0,0,0.2)]",
                        // Max height
                        "max-h-[92vh]",
                        // Overflow
                        "overflow-hidden flex flex-col",
                        className
                    )}
                    style={{
                        y,
                        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                    }}
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{
                        type: "spring",
                        damping: 30,
                        stiffness: 300,
                    }}
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={{ top: 0, bottom: 0.5 }}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    {/* Drag Handle */}
                    <div className="flex-shrink-0 pt-3 pb-2 cursor-grab active:cursor-grabbing">
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto" />
                    </div>

                    {/* Close button - positioned absolutely */}
                    {!hideCloseButton && (
                        <DialogPrimitive.Close className="absolute right-3 top-3 rounded-xl p-2.5 text-[var(--foreground-muted)] transition-all hover:text-foreground hover:bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] disabled:pointer-events-none z-10">
                            <X className="h-5 w-5" />
                            <span className="sr-only">Close</span>
                        </DialogPrimitive.Close>
                    )}

                    {/* Scrollable content */}
                    <div
                        className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
                        onTouchStart={(e) => {
                            // Prevent drag from interfering with scroll
                            const target = e.currentTarget;
                            if (target.scrollTop > 0) {
                                e.stopPropagation();
                            }
                        }}
                    >
                        {children}
                    </div>
                </motion.div>
            </DialogPrimitive.Content>
        </DialogPortal>
    );
});
BottomSheetContent.displayName = "BottomSheetContent";

/**
 * Side sheet: a full-height panel anchored to the right edge (the app is LTR in
 * every locale), with the same dialog semantics as DialogContent: role="dialog",
 * aria-modal, a focus trap, Escape and outside-click to close, and focus handed
 * back on close. It is force-mounted so the caller drives the enter and exit
 * animation: render it inside <AnimatePresence> while the dialog is open.
 */
interface SheetContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
    overlayClassName?: string;
}

const SheetContent = forwardRef<
    ElementRef<typeof DialogPrimitive.Content>,
    SheetContentProps
>(({ className, children, overlayClassName, ...props }, ref) => (
    <DialogPortal forceMount>
        <DialogPrimitive.Overlay forceMount asChild>
            <motion.div
                // Light and unblurred: the page behind a side sheet stays readable.
                className={cn("fixed inset-0 z-50 bg-black/25", overlayClassName)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
            />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content ref={ref} forceMount asChild aria-modal="true" {...props}>
            <motion.div
                className={cn(
                    "fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-[600px] overflow-hidden",
                    "bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-[0_0_60px_-10px_rgba(0,0,0,0.35)]",
                    "focus:outline-none",
                    className
                )}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 40 }}
            >
                {children}
            </motion.div>
        </DialogPrimitive.Content>
    </DialogPortal>
));
SheetContent.displayName = "SheetContent";

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col space-y-1.5 text-center sm:text-left mb-6",
            className
        )}
        {...props}
    />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6 gap-2 pt-6 border-t border-[var(--card-border)]",
            className
        )}
        {...props}
    />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = forwardRef<
    ElementRef<typeof DialogPrimitive.Title>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn(
            "text-2xl font-bold leading-none tracking-tight text-foreground",
            className
        )}
        {...props}
    />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = forwardRef<
    ElementRef<typeof DialogPrimitive.Description>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn("text-sm text-muted", className)}
        {...props}
    />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogClose,
    DialogTrigger,
    DialogContent,
    BottomSheetContent,
    SheetContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
};
