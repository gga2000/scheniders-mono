"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef, ComponentPropsWithoutRef, ElementRef } from "react";

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

const DialogContent = forwardRef<
    ElementRef<typeof DialogPrimitive.Content>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
            ref={ref}
            aria-describedby={props["aria-describedby"] ?? undefined}
            className={cn(
                // Mobile: Full screen with safe areas
                "fixed inset-0 z-50 md:inset-auto",
                "md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%]",
                // Styling
                "bg-[var(--card-bg)] p-4 md:p-6 shadow-xl duration-200",
                "md:rounded-[24px] md:border md:border-[var(--card-border)]",
                // Size constraints
                "w-full md:max-w-3xl md:max-h-[90vh]",
                "overflow-y-auto",
                // Animation
                "data-[state=open]:animate-slide-in-up",
                className
            )}
            style={{
                paddingTop: "max(1rem, env(safe-area-inset-top))",
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            }}
            {...props}
        >
            {children}
            <DialogPrimitive.Close className="absolute right-3 top-3 md:right-4 md:top-4 rounded-xl p-2.5 md:p-2 text-[var(--foreground-muted)] transition-all hover:text-foreground hover:bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] disabled:pointer-events-none touch-target">
                <X className="h-5 w-5 md:h-5 md:w-5" />
                <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
        </DialogPrimitive.Content>
    </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

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
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
};
