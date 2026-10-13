"use client";

import { cn } from "@/lib/utils";
import { generateWhatsAppLink } from "@/lib/utils";
import { validatePhoneDetailed, formatPhoneForDisplay, formatPhoneGrouped } from "@/lib/order-utils";
import { MessageCircle, AlertCircle } from "lucide-react";

interface PhoneDisplayProps {
    phone: string | undefined | null;
    label?: string;
    showWhatsApp?: boolean;
    whatsAppMessage?: string;
    className?: string;
    size?: "sm" | "md";
}

/**
 * Displays a phone number with validation indicator
 * Shows a red pulsing dot if the phone number is invalid or incomplete
 */
export function PhoneDisplay({
    phone,
    label,
    showWhatsApp = false,
    whatsAppMessage,
    className,
    size = "md",
}: PhoneDisplayProps) {
    const validation = validatePhoneDetailed(phone);
    // Raw digits for the WhatsApp link; 4-3-4 grouping is on-screen only.
    const rawPhone = formatPhoneForDisplay(phone);
    const displayPhone = formatPhoneGrouped(phone);

    // Don't render if no phone provided and we're not showing an error
    if (!phone && !label) return null;

    const handleWhatsApp = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (validation.isValid) {
            const link = generateWhatsAppLink(rawPhone, whatsAppMessage);
            window.open(link, "_blank");
        }
    };

    const sizeClasses = {
        sm: "text-xs",
        md: "text-sm",
    };

    return (
        <div className={cn("flex items-center gap-2", className)}>
            {/* Phone number with validation indicator */}
            <div className="flex items-center gap-1.5 min-w-0">
                {/* Validation indicator */}
                {!validation.isValid && phone && (
                    <div className="relative flex-shrink-0 group">
                        <span className="flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                        </span>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            {validation.errorMessageAr || validation.errorMessage}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                        </div>
                    </div>
                )}

                {/* Phone number text */}
                <span
                    className={cn(
                        "font-mono tracking-wide",
                        sizeClasses[size],
                        !validation.isValid && phone && "text-red-600",
                        validation.isValid && "text-foreground"
                    )}
                    dir="ltr"
                >
                    {displayPhone || "—"}
                </span>
            </div>

            {/* WhatsApp button */}
            {showWhatsApp && validation.isValid && (
                <button
                    onClick={handleWhatsApp}
                    className={cn(
                        "flex-shrink-0 rounded-lg bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)] transition-all flex items-center justify-center",
                        size === "sm" ? "w-6 h-6" : "w-7 h-7"
                    )}
                    title="واتساب"
                >
                    <MessageCircle className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
                </button>
            )}
        </div>
    );
}

interface DualPhoneDisplayProps {
    primaryPhone: string | undefined | null;
    secondaryPhone?: string | undefined | null;
    customerName?: string;
    orderId?: string;
    showWhatsApp?: boolean;
    className?: string;
    layout?: "horizontal" | "vertical";
    size?: "sm" | "md";
}

/**
 * Displays both primary and secondary phone numbers
 * With validation indicators and WhatsApp buttons for each
 */
export function DualPhoneDisplay({
    primaryPhone,
    secondaryPhone,
    customerName,
    orderId,
    showWhatsApp = true,
    className,
    layout = "horizontal",
    size = "sm",
}: DualPhoneDisplayProps) {
    const primaryValidation = validatePhoneDetailed(primaryPhone);
    const secondaryValidation = validatePhoneDetailed(secondaryPhone);
    const hasSecondary = secondaryPhone && secondaryPhone.trim() !== "";

    const getMessage = (isSecondary = false) => {
        if (customerName && orderId) {
            return `مرحباً ${customerName}، بخصوص طلبك رقم ${orderId}`;
        }
        return undefined;
    };

    return (
        <div
            className={cn(
                "flex gap-3",
                layout === "vertical" ? "flex-col" : "flex-wrap items-center",
                className
            )}
        >
            {/* Primary phone */}
            <PhoneDisplay
                phone={primaryPhone}
                showWhatsApp={showWhatsApp}
                whatsAppMessage={getMessage()}
                size={size}
            />

            {/* Secondary phone */}
            {hasSecondary && (
                <PhoneDisplay
                    phone={secondaryPhone}
                    showWhatsApp={showWhatsApp}
                    whatsAppMessage={getMessage(true)}
                    size={size}
                />
            )}
        </div>
    );
}
