"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Hosts allowed in next.config `images.remotePatterns`. Only these go through
 * the image optimizer; any other URL a merchant pasted is shown as-is rather
 * than failing next/image's host check.
 */
function isOptimizable(src: string): boolean {
    try {
        const url = new URL(src);
        if (url.protocol !== "https:") return false;
        if (url.hostname === "images.unsplash.com") return true;
        return url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/");
    } catch {
        // A relative or malformed URL is not something the optimizer can fetch.
        return false;
    }
}

interface ProductThumbProps {
    src: string;
    alt: string;
    /** CSS width the image renders at, e.g. "56px" or "(min-width: 1024px) 25vw, 50vw". */
    sizes: string;
    className?: string;
    priority?: boolean;
}

/**
 * A product image sized for where it is shown. Uploads are stored at their
 * original size (avg ~480 KB, up to 2.5 MB); rendered through next/image they
 * arrive as a resized AVIF/WebP for the slot instead. Fills its parent, which
 * must be `relative` with a fixed size or aspect ratio.
 */
export function ProductThumb({ src, alt, sizes, className, priority }: ProductThumbProps) {
    return (
        <Image
            src={src}
            alt={alt}
            fill
            sizes={sizes}
            quality={70}
            priority={priority}
            unoptimized={!isOptimizable(src)}
            className={cn("object-cover", className)}
        />
    );
}
