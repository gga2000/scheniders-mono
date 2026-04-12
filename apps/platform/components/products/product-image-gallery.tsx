"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { Package } from "lucide-react";

interface ProductImageGalleryProps {
    productId: string;
    primaryImage?: string | null;
    size?: "sm" | "md" | "lg";
    className?: string;
}

const sizeClasses = {
    sm: "h-40",
    md: "h-48",
    lg: "h-56",
} as const;

interface ProductImage {
    id: string;
    image_url: string;
    display_order: number;
}

export function ProductImageGallery({
    productId,
    primaryImage,
    size = "md",
    className,
}: ProductImageGalleryProps) {
    const { session } = useAuth();
    const containerRef = useRef<HTMLDivElement>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const { data: additionalImages } = useQuery<ProductImage[]>({
        queryKey: ["product-images", productId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("product_images")
                .select("id, image_url, display_order")
                .eq("product_id", productId)
                .order("display_order");

            if (error) throw error;
            return data || [];
        },
        staleTime: 60_000,
        enabled: !!session && !!productId,
    });

    // Build the full image list: primary first, then additional
    const allImages = useMemo(() => {
        const images: string[] = [];
        if (primaryImage) {
            images.push(primaryImage);
        }
        if (additionalImages) {
            for (const img of additionalImages) {
                if (img.image_url && img.image_url !== primaryImage) {
                    images.push(img.image_url);
                }
            }
        }
        return images;
    }, [primaryImage, additionalImages]);

    const imageCount = allImages.length;

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (imageCount <= 1 || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const segmentWidth = rect.width / imageCount;
            const index = Math.min(
                Math.floor(x / segmentWidth),
                imageCount - 1
            );
            setActiveIndex(index);
        },
        [imageCount]
    );

    const handleMouseEnter = useCallback(() => setIsHovering(true), []);
    const handleMouseLeave = useCallback(() => {
        setIsHovering(false);
        setActiveIndex(0);
    }, []);

    const hasImages = imageCount > 0;

    return (
        <div
            ref={containerRef}
            className={cn(
                "relative w-full overflow-hidden bg-gradient-to-br from-[var(--background)] to-[var(--card-border)]",
                sizeClasses[size],
                className
            )}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Images with crossfade */}
            {hasImages ? (
                allImages.map((url, i) => (
                    <img
                        key={url}
                        src={url}
                        alt=""
                        loading="lazy"
                        className={cn(
                            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
                            i === activeIndex ? "opacity-100" : "opacity-0"
                        )}
                    />
                ))
            ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Package className="w-10 h-10 text-muted" />
                </div>
            )}

            {/* Image count badge */}
            {imageCount > 1 && (
                <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-black/60 text-white text-xs font-medium rounded-lg backdrop-blur-sm">
                    {activeIndex + 1}/{imageCount}
                </div>
            )}

            {/* Navigation dots on hover */}
            {isHovering && imageCount > 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
                    {allImages.map((_, i) => (
                        <div
                            key={i}
                            className={cn(
                                "w-1.5 h-1.5 rounded-full transition-all duration-200",
                                i === activeIndex
                                    ? "bg-white w-3"
                                    : "bg-white/50"
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
