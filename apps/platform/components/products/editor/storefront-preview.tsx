"use client";

import { useState, useMemo } from "react";
import {
    Eye,
    ImageIcon,
    ShoppingCart,
    Star,
    ChevronDown,
    ChevronRight,
    Lock,
    Globe,
    Quote,
    User,
    Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { renderIcon } from "./icon-picker";

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
    features: { icon: string; title: string; description: string }[];
    faqs: { question: string; answer: string }[];
    testimonials: {
        customer_name: string;
        customer_photo_url: string;
        rating: number;
        quote: string;
    }[];
    reviews: {
        reviewer_name: string;
        rating: number;
        title: string;
        body: string;
        created_at?: string;
    }[];
    slug: string;
    variantOptions: { name: string; values: string[] }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatIQD(value: number): string {
    return new Intl.NumberFormat("en-IQ").format(value) + " IQD";
}

function InlineStars({
    rating,
    size = "sm",
}: {
    rating: number;
    size?: "sm" | "md";
}) {
    const cls = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
    return (
        <span className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
                <Star
                    key={i}
                    className={`${cls} ${
                        i <= rating
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-gray-300"
                    }`}
                />
            ))}
        </span>
    );
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
    features,
    faqs,
    testimonials,
    reviews,
    slug,
    variantOptions,
}: StorefrontPreviewProps) {
    /* FAQ accordion state */
    const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

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

    /* Discount */
    const discountPercentage =
        compareAtPrice > price && compareAtPrice > 0
            ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
            : null;

    /* Reviews summary */
    const reviewSummary = useMemo(() => {
        if (reviews.length === 0) return null;
        const avg =
            reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        return { average: avg, count: reviews.length };
    }, [reviews]);

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
            {/* ---- Card header ---- */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Storefront Preview
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--pastel-green)] text-green-800 text-xs font-medium rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
                    Live Preview
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
                                    <span className="text-xs">No image</span>
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

                        {/* Review summary inline */}
                        {reviewSummary && (
                            <div className="flex items-center gap-2">
                                <InlineStars
                                    rating={Math.round(reviewSummary.average)}
                                    size="sm"
                                />
                                <span className="text-sm text-muted">
                                    {reviewSummary.average.toFixed(1)} (
                                    {reviewSummary.count} review
                                    {reviewSummary.count !== 1 ? "s" : ""})
                                </span>
                            </div>
                        )}

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
                            Add to Cart
                        </button>
                    </div>
                </div>

                {/* ============================================================ */}
                {/*  2. DESCRIPTION                                              */}
                {/* ============================================================ */}
                {description && (
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
                            Description
                        </h2>
                        <div
                            className="prose prose-sm max-w-none text-[var(--foreground)]"
                            dangerouslySetInnerHTML={{ __html: description }}
                        />
                    </div>
                )}

                {/* ============================================================ */}
                {/*  3. FEATURES                                                 */}
                {/* ============================================================ */}
                {features.length > 0 && (
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                            <Sparkles className="w-5 h-5" />
                            Features
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {features.map((feat, idx) => (
                                <div
                                    key={idx}
                                    className="flex gap-4 p-4 bg-[var(--background)] border border-[var(--card-border)] rounded-xl"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-[var(--pastel-blue)] flex items-center justify-center shrink-0">
                                        {renderIcon(
                                            feat.icon,
                                            "w-5 h-5 text-blue-700"
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-[var(--foreground)]">
                                            {feat.title || "Feature"}
                                        </p>
                                        {feat.description && (
                                            <p className="text-xs text-muted mt-1 leading-relaxed">
                                                {feat.description}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ============================================================ */}
                {/*  4. FAQ ACCORDION                                            */}
                {/* ============================================================ */}
                {faqs.length > 0 && (
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
                            Frequently Asked Questions
                        </h2>
                        <div className="border border-[var(--card-border)] rounded-xl overflow-hidden divide-y divide-[var(--card-border)]">
                            {faqs.map((faq, idx) => {
                                const isOpen = expandedFaq === idx;
                                return (
                                    <div key={idx} className="bg-[var(--background)]">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setExpandedFaq(
                                                    isOpen ? null : idx
                                                )
                                            }
                                            className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors cursor-pointer text-left"
                                        >
                                            <span>
                                                {faq.question ||
                                                    "Untitled question"}
                                            </span>
                                            <ChevronDown
                                                className={`w-4 h-4 text-muted transition-transform shrink-0 ml-3 ${
                                                    isOpen ? "rotate-180" : ""
                                                }`}
                                            />
                                        </button>

                                        <AnimatePresence initial={false}>
                                            {isOpen && (
                                                <motion.div
                                                    key="faq-answer"
                                                    initial={{
                                                        height: 0,
                                                        opacity: 0,
                                                    }}
                                                    animate={{
                                                        height: "auto",
                                                        opacity: 1,
                                                    }}
                                                    exit={{
                                                        height: 0,
                                                        opacity: 0,
                                                    }}
                                                    transition={{
                                                        duration: 0.2,
                                                        ease: "easeInOut",
                                                    }}
                                                    className="overflow-hidden"
                                                >
                                                    <p className="px-5 pb-4 text-sm text-muted leading-relaxed">
                                                        {faq.answer}
                                                    </p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ============================================================ */}
                {/*  5. TESTIMONIALS                                             */}
                {/* ============================================================ */}
                {testimonials.length > 0 && (
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                            <Quote className="w-5 h-5" />
                            What Our Customers Say
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {testimonials.map((t, idx) => (
                                <div
                                    key={idx}
                                    className="p-5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl space-y-3"
                                >
                                    {/* Quote text */}
                                    <p className="text-sm text-[var(--foreground)] italic leading-relaxed">
                                        &ldquo;{t.quote}&rdquo;
                                    </p>

                                    {/* Customer info */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full overflow-hidden bg-[var(--card-border)] flex items-center justify-center shrink-0">
                                            {t.customer_photo_url ? (
                                                <img
                                                    src={t.customer_photo_url}
                                                    alt={t.customer_name}
                                                    className="w-9 h-9 rounded-full object-cover"
                                                />
                                            ) : (
                                                <User className="w-4 h-4 text-muted" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-[var(--foreground)] truncate">
                                                {t.customer_name || "Customer"}
                                            </p>
                                            <InlineStars
                                                rating={t.rating}
                                                size="sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ============================================================ */}
                {/*  6. REVIEWS                                                  */}
                {/* ============================================================ */}
                {reviews.length > 0 && reviewSummary && (
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
                            Customer Reviews
                        </h2>

                        {/* Average summary bar */}
                        <div className="flex items-center gap-4 p-4 bg-[var(--background)] border border-[var(--card-border)] rounded-xl mb-5">
                            <span className="text-3xl font-bold text-[var(--foreground)]">
                                {reviewSummary.average.toFixed(1)}
                            </span>
                            <div className="space-y-1">
                                <InlineStars
                                    rating={Math.round(reviewSummary.average)}
                                    size="md"
                                />
                                <p className="text-xs text-muted">
                                    Based on {reviewSummary.count} review
                                    {reviewSummary.count !== 1 ? "s" : ""}
                                </p>
                            </div>

                            {/* Mini distribution */}
                            <div className="flex-1 space-y-1 ml-4">
                                {[5, 4, 3, 2, 1].map((star) => {
                                    const count = reviews.filter(
                                        (r) => r.rating === star
                                    ).length;
                                    const pct =
                                        reviews.length > 0
                                            ? (count / reviews.length) * 100
                                            : 0;
                                    return (
                                        <div
                                            key={star}
                                            className="flex items-center gap-2 text-xs"
                                        >
                                            <span className="w-3 text-muted text-right">
                                                {star}
                                            </span>
                                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                            <div className="flex-1 h-1.5 rounded-full bg-[var(--card-border)] overflow-hidden">
                                                <div
                                                    className="h-1.5 rounded-full bg-yellow-400 transition-all"
                                                    style={{
                                                        width: `${pct}%`,
                                                    }}
                                                />
                                            </div>
                                            <span className="w-5 text-muted text-right">
                                                {count}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Review cards */}
                        <div className="space-y-3">
                            {reviews.map((review, idx) => (
                                <div
                                    key={idx}
                                    className="p-4 bg-[var(--background)] border border-[var(--card-border)] rounded-xl space-y-2"
                                >
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <span className="text-sm font-medium text-[var(--foreground)]">
                                            {review.reviewer_name ||
                                                "Anonymous"}
                                        </span>
                                        {review.created_at && (
                                            <span className="text-xs text-muted">
                                                {new Date(
                                                    review.created_at
                                                ).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>

                                    <InlineStars
                                        rating={review.rating}
                                        size="sm"
                                    />

                                    {review.title && (
                                        <p className="text-sm font-semibold text-[var(--foreground)]">
                                            {review.title}
                                        </p>
                                    )}

                                    {review.body && (
                                        <p className="text-sm text-muted leading-relaxed">
                                            {review.body}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
