"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X, Check, AlertTriangle, XCircle, Info, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToastVariant } from "@/hooks/use-toast";

/* ============================================
   Toast Viewport
   ============================================ */
export const ToastViewport = React.forwardRef<
    React.ComponentRef<typeof ToastPrimitive.Viewport>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
    <ToastPrimitive.Viewport
        ref={ref}
        className={cn(
            "toast-viewport",
            "fixed z-[100] flex max-h-screen flex-col gap-2.5 p-4",
            "top-0 right-0 w-full sm:max-w-[380px] sm:right-5 sm:top-5",
            className
        )}
        {...props}
    />
));
ToastViewport.displayName = "ToastViewport";

/* ============================================
   Variant Configuration — Warm Palette
   Uses the app's pastel status colors
   ============================================ */
const variantConfig: Record<ToastVariant, {
    icon: React.ReactNode;
    accentColor: string;
    iconBg: string;
    progressColor: string;
}> = {
    default: {
        icon: <Info className="h-[14px] w-[14px]" />,
        accentColor: "text-[#5B8DEF]",
        iconBg: "bg-[#EFF6FF]",
        progressColor: "bg-[#A6C8FF]",
    },
    success: {
        icon: <Check className="h-[14px] w-[14px] stroke-[2.5]" />,
        accentColor: "text-[#2D8A56]",
        iconBg: "bg-[#ECFCCB]/80",
        progressColor: "bg-[#C0EBA6]",
    },
    error: {
        icon: <XCircle className="h-[14px] w-[14px]" />,
        accentColor: "text-[#C94058]",
        iconBg: "bg-[#FFF1F2]",
        progressColor: "bg-[#F4C7CF]",
    },
    warning: {
        icon: <AlertTriangle className="h-[14px] w-[14px]" />,
        accentColor: "text-[#B8860B]",
        iconBg: "bg-[#FFFBEB]",
        progressColor: "bg-[#FBE38E]",
    },
};

/* ============================================
   Toast Root
   ============================================ */
interface ToastProps
    extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
    variant?: ToastVariant;
}

export const Toast = React.forwardRef<
    React.ComponentRef<typeof ToastPrimitive.Root>,
    ToastProps
>(({ className, variant = "default", children, ...props }, ref) => {
    const config = variantConfig[variant];

    return (
        <ToastPrimitive.Root
            ref={ref}
            className={cn(
                "toast-card group pointer-events-auto relative",
                "flex w-full overflow-hidden rounded-2xl",
                "p-3.5 pl-4 items-center gap-3",
                // White card with warm undertone
                "bg-white border border-[#E7E5E4]",
                "shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.04)]",
                // Animations
                "data-[state=open]:animate-toast-in",
                "data-[state=closed]:animate-toast-out",
                "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
                "data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform",
                "data-[swipe=end]:animate-toast-swipe-out",
                className
            )}
            {...props}
        >
            {/* Left Accent Bar */}
            <div className={cn(
                "absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl",
                config.progressColor
            )} />

            {/* Icon */}
            <div className={cn(
                "shrink-0 flex items-center justify-center w-8 h-8 rounded-xl",
                config.iconBg,
                config.accentColor
            )}>
                {config.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-5">
                {children}
            </div>

            {/* Slim Progress Bar at bottom */}
            <div
                className={cn(
                    "absolute bottom-0 left-0 h-[2px] animate-toast-progress opacity-40",
                    config.progressColor
                )}
                style={{ animationDuration: `${props.duration || 5000}ms` }}
            />

            {/* Close */}
            <ToastPrimitive.Close
                className={cn(
                    "absolute right-2.5 top-1/2 -translate-y-1/2",
                    "rounded-lg p-1.5 opacity-0 transition-all duration-200",
                    "hover:bg-[#F5F0E8] group-hover:opacity-100",
                    "text-[#9A9A9A] hover:text-[#1E1E1E]",
                    "focus-visible:opacity-100 focus-visible:outline-none"
                )}
            >
                <X className="h-3.5 w-3.5" />
            </ToastPrimitive.Close>
        </ToastPrimitive.Root>
    );
});
Toast.displayName = "Toast";

/* ============================================
   Toast Title
   ============================================ */
export const ToastTitle = React.forwardRef<
    React.ComponentRef<typeof ToastPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
    <ToastPrimitive.Title
        ref={ref}
        className={cn(
            "text-[13px] font-semibold text-[#1E1E1E] leading-tight tracking-[-0.01em]",
            className
        )}
        {...props}
    />
));
ToastTitle.displayName = "ToastTitle";

/* ============================================
   Toast Description
   ============================================ */
export const ToastDescription = React.forwardRef<
    React.ComponentRef<typeof ToastPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
    <ToastPrimitive.Description
        ref={ref}
        className={cn(
            "text-[12px] text-[#6B6B6B] mt-0.5 leading-relaxed line-clamp-1",
            className
        )}
        {...props}
    />
));
ToastDescription.displayName = "ToastDescription";

/* ============================================
   Toast Action Button (Undo, etc.)
   ============================================ */
export const ToastAction = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { altText?: string; isUndo?: boolean }
>(({ className, altText, isUndo, ...props }, ref) => (
    <button
        ref={ref}
        className={cn(
            "shrink-0 mt-1.5 inline-flex h-7 items-center justify-center rounded-lg px-3",
            "text-[12px] font-medium transition-all duration-200",
            "bg-[#F5F0E8] hover:bg-[#E8E2D8] text-[#1E1E1E]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBE38E]",
            "active:scale-[0.97]",
            className
        )}
        {...props}
    >
        {isUndo && <RotateCcw className="mr-1.5 h-3 w-3" />}
        {props.children}
    </button>
));
ToastAction.displayName = "ToastAction";

export const ToastProvider = ToastPrimitive.Provider;
