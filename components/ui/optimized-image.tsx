"use client";

import { useState, useCallback, ImgHTMLAttributes, memo } from "react";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

interface OptimizedImageProps extends ImgHTMLAttributes<HTMLImageElement> {
    fallback?: "avatar" | "product" | "none";
    containerClassName?: string;
}

/**
 * OptimizedImage component with:
 * - Lazy loading by default
 * - Graceful error handling with fallback
 * - Loading state with skeleton
 * - Prevents layout shift with aspect ratio
 */
export const OptimizedImage = memo(function OptimizedImage({
    src,
    alt,
    className,
    containerClassName,
    fallback = "none",
    ...props
}: OptimizedImageProps) {
    const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

    const handleLoad = useCallback(() => {
        setStatus("loaded");
    }, []);

    const handleError = useCallback(() => {
        setStatus("error");
    }, []);

    // If no src or error, show fallback
    if (!src || status === "error") {
        if (fallback === "avatar") {
            return (
                <div className={cn(
                    "flex items-center justify-center bg-[var(--background)] text-muted",
                    containerClassName,
                    className
                )}>
                    <User className="w-1/2 h-1/2" />
                </div>
            );
        }

        if (fallback === "product") {
            return (
                <div className={cn(
                    "flex items-center justify-center bg-[var(--background)]",
                    containerClassName,
                    className
                )}>
                    <svg className="w-1/2 h-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
            );
        }

        return null;
    }

    return (
        <div className={cn("relative overflow-hidden", containerClassName)}>
            {/* Skeleton while loading */}
            {status === "loading" && (
                <div className={cn(
                    "absolute inset-0 animate-pulse bg-[var(--card-border)]",
                    className
                )} />
            )}

            <img
                src={src}
                alt={alt || ""}
                loading="lazy"
                decoding="async"
                onLoad={handleLoad}
                onError={handleError}
                className={cn(
                    "transition-opacity duration-200",
                    status === "loading" ? "opacity-0" : "opacity-100",
                    className
                )}
                {...props}
            />
        </div>
    );
});

OptimizedImage.displayName = "OptimizedImage";

/**
 * Avatar component with optimized loading
 */
export const Avatar = memo(function Avatar({
    src,
    alt,
    size = "md",
    className,
}: {
    src?: string | null;
    alt?: string;
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
}) {
    const sizeClasses = {
        sm: "w-8 h-8",
        md: "w-10 h-10",
        lg: "w-12 h-12",
        xl: "w-16 h-16",
    };

    return (
        <OptimizedImage
            src={src || undefined}
            alt={alt || "Avatar"}
            fallback="avatar"
            containerClassName={cn(
                "rounded-full overflow-hidden flex-shrink-0",
                sizeClasses[size],
                className
            )}
            className="w-full h-full object-cover"
        />
    );
});

Avatar.displayName = "Avatar";
