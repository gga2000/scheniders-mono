"use client";

import { useState } from "react";
import { Star, Check, X, Trash2 } from "lucide-react";
import { Button, Badge } from "@scheniders/ui";
import {
    useProductReviews,
    useReviewModeration,
} from "@/hooks/use-product-reviews";
import { countReviewsByStatus } from "@/lib/review-queue";
import type { ReviewStatus } from "@scheniders/shared";

type Filter = ReviewStatus | "all";

const STATUS_BADGE: Record<ReviewStatus, "new" | "confirmed" | "rejected"> = {
    pending: "new",
    approved: "confirmed",
    rejected: "rejected",
};

function Stars({ value }: { value: number }) {
    return (
        <span className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    className={
                        n <= Math.round(value)
                            ? "h-4 w-4 fill-amber-400 text-amber-400"
                            : "h-4 w-4 text-muted-foreground/30"
                    }
                />
            ))}
        </span>
    );
}

export default function ReviewsPage() {
    const { data: reviews = [], isLoading } = useProductReviews();
    const { setStatus, remove } = useReviewModeration();
    const [filter, setFilter] = useState<Filter>("pending");

    const counts = countReviewsByStatus(reviews);
    const shown =
        filter === "all" ? reviews : reviews.filter((r) => r.status === filter);

    const tabs: { key: Filter; label: string; count: number }[] = [
        { key: "pending", label: "Pending", count: counts.pending },
        { key: "approved", label: "Approved", count: counts.approved },
        { key: "rejected", label: "Rejected", count: counts.rejected },
        { key: "all", label: "All", count: counts.total },
    ];

    return (
        <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Product reviews</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Approve customer reviews before they appear on your storefront.
                </p>
            </header>

            <div className="mb-6 flex flex-wrap gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setFilter(tab.key)}
                        className={
                            "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors " +
                            (filter === tab.key
                                ? "bg-foreground text-background"
                                : "bg-muted text-muted-foreground hover:text-foreground")
                        }
                    >
                        {tab.label}
                        <span className="ml-1.5 tabular-nums opacity-70">{tab.count}</span>
                    </button>
                ))}
            </div>

            {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : shown.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                    No {filter === "all" ? "" : filter} reviews.
                </p>
            ) : (
                <ul className="space-y-4">
                    {shown.map((r) => (
                        <li
                            key={r.id}
                            className="rounded-2xl border border-border bg-card p-4"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Stars value={r.rating} />
                                    <span className="text-sm font-medium text-foreground">
                                        {r.author_name?.trim() || "Anonymous"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(r.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>

                            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {r.product_name ?? "Unknown product"}
                            </p>
                            {r.title && (
                                <p className="mt-1 font-semibold text-foreground">{r.title}</p>
                            )}
                            {r.body && (
                                <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                            )}

                            {r.photo_urls.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {r.photo_urls.map((url, i) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            key={i}
                                            src={url}
                                            alt=""
                                            loading="lazy"
                                            className="h-20 w-20 rounded-lg object-cover"
                                        />
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 flex flex-wrap gap-2">
                                {r.status !== "approved" && (
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        disabled={setStatus.isPending}
                                        onClick={() =>
                                            setStatus.mutate({ id: r.id, status: "approved" })
                                        }
                                    >
                                        <Check className="mr-1 h-4 w-4" />
                                        Approve
                                    </Button>
                                )}
                                {r.status !== "rejected" && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={setStatus.isPending}
                                        onClick={() =>
                                            setStatus.mutate({ id: r.id, status: "rejected" })
                                        }
                                    >
                                        <X className="mr-1 h-4 w-4" />
                                        Reject
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={remove.isPending}
                                    onClick={() => remove.mutate(r.id)}
                                >
                                    <Trash2 className="mr-1 h-4 w-4" />
                                    Delete
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
