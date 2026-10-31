"use client";

import { useLanguage } from "@/hooks/use-language";
import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import {
    Eye,
    ImageIcon,
    ShoppingCart,
    Lock,
    Globe,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StorefrontPreviewProps {
    name: string;
    description: string;
    shortDescription: string;
    price: number;
    compareAtPrice: number;
    imageUrl: string;
    slug: string;
    variantOptions: { name: string; values: string[] }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatIQD(value: number): string {
    return new Intl.NumberFormat("en-IQ").format(value) + " IQD";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StorefrontPreview({
    name,
    description,
    shortDescription,
    price,
    compareAtPrice,
    imageUrl,
    slug,
    variantOptions,
}: StorefrontPreviewProps) {
    const { t } = useLanguage();
    /* Variant selector visual state */
    const [selectedVariants, setSelectedVariants] = useState<
        Record<string, string>
    >(() => {
        const initial: Record<string, string> = {};
        variantOptions.forEach((opt) => {
            if (opt.values.length > 0) initial[opt.name] = opt.values[0];
        });
        return initial;
    });

    // Descriptions are rich text anyone with products.edit (or an import) can write:
    // strip scripts and event handlers before this admin session renders them.
    const safeDescription = useMemo(
        () => (DOMPurify.isSupported ? DOMPurify.sanitize(description, {
                  // Rich text only: no styles, forms or embeds that could cover the admin UI.
                  FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
                  FORBID_ATTR: ["style"],
              }) : ""),
        [description],
    );

    /* Discount */
    const discountPercentage =
        compareAtPrice > price && compareAtPrice > 0
            ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
            : null;

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
            {/* ---- Card header ---- */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    {t("products.ed.preview.title")}
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
                    {t("products.ed.preview.live")}
                </span>
            </div>

            {/* ---- Browser chrome mockup ---- */}
            <div className="bg-[var(--background)] border-b border-[var(--card-border)] px-4 py-2 flex items-center gap-3">
                {/* Traffic lights */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>

                {/* URL bar */}
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-xs text-muted overflow-hidden">
                    <Lock className="w-3 h-3 text-green-600 shrink-0" />
                    <span className="truncate">
                        yourstore.com/products/{slug || "product-slug"}
                    </span>
                </div>

                <Globe className="w-3.5 h-3.5 text-muted shrink-0" />
            </div>

            {/* ---- Store page content ---- */}
            <div className="bg-white p-6 space-y-10">
                {/* ============================================================ */}
                {/*  1. PRODUCT HERO                                             */}
                {/* ============================================================ */}
                <div className="flex flex-col md:flex-row gap-8">
                    {/* Left — image */}
                    <div className="md:w-1/2 shrink-0">
                        <div className="aspect-square rounded-2xl overflow-hidden bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt={name || "Product image"}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-muted">
                                    <ImageIcon className="w-12 h-12" />
                                    <span className="text-xs">{t("products.ed.preview.noImage")}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right — details */}
                    <div className="flex-1 space-y-5">
                        {/* Product name */}
                        <h1 className="text-2xl font-bold text-[var(--foreground)]">
                            {name || "Product Name"}
                        </h1>

                        {/* Short description */}
                        {shortDescription && (
                            <p className="text-sm text-muted leading-relaxed">
                                {shortDescription}
                            </p>
                        )}

                        {/* Price */}
                        <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="text-2xl font-bold text-[var(--foreground)]">
                                {formatIQD(price)}
                            </span>

                            {discountPercentage !== null && (
                                <>
                                    <span className="text-base text-muted line-through">
                                        {formatIQD(compareAtPrice)}
                                    </span>
                                    <span className="px-2 py-0.5 bg-[var(--pastel-pink)] text-rose-700 text-xs font-semibold rounded-lg">
                                        -{discountPercentage}%
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Variant selectors */}
                        {variantOptions.length > 0 && (
                            <div className="space-y-4">
                                {variantOptions.map((option) => (
                                    <div key={option.name}>
                                        <p className="text-sm font-medium text-[var(--foreground)] mb-2">
                                            {option.name}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {option.values.map((val) => {
                                                const isSelected =
                                                    selectedVariants[
                                                        option.name
                                                    ] === val;
                                                return (
                                                    <button
                                                        key={val}
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedVariants(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [option.name]:
                                                                        val,
                                                                })
                                                            )
                                                        }
                                                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
                                                            isSelected
                                                                ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                                                                : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] hover:border-[var(--ink)]"
                                                        }`}
                                                    >
                                                        {val}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add to Cart button */}
                        <button
                            type="button"
                            disabled
                            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[var(--ink)] text-white rounded-xl text-sm font-semibold cursor-not-allowed opacity-90 transition-colors"
                        >
                            <ShoppingCart className="w-4 h-4" />
                            {t("products.ed.preview.addToCart")}
                        </button>
                    </div>
                </div>

                {/* ============================================================ */}
                {/*  2. DESCRIPTION                                              */}
                {/* ============================================================ */}
                {description && (
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
                            {t("products.ed.preview.description")}
                        </h2>
                        <div
                            className="prose prose-sm max-w-none text-[var(--foreground)]"
                            dangerouslySetInnerHTML={{ __html: safeDescription }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
