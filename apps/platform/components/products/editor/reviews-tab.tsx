"use client";

import { useState, useMemo } from "react";
import { MessageSquare, Plus, Trash2, Reply, Check, Shield, Star as StarIcon, Pencil } from "lucide-react";
import { StarRatingInput } from "./star-rating-input";

export interface ReviewFormData {
    id?: string;
    reviewer_name: string;
    reviewer_email: string;
    rating: number;
    title: string;
    body: string;
    status: "pending" | "approved" | "rejected" | "featured";
    is_verified_purchase: boolean;
    is_manual: boolean;
    admin_response: string;
    helpful_count: number;
    created_at?: string;
}

interface ReviewsTabProps {
    reviews: ReviewFormData[];
    onChange: (reviews: ReviewFormData[]) => void;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "featured";

const statusBadgeColors: Record<ReviewFormData["status"], string> = {
    pending: "bg-[var(--pastel-yellow)] text-yellow-800",
    approved: "bg-[var(--pastel-green)] text-green-800",
    rejected: "bg-[var(--pastel-pink)] text-pink-800",
    featured: "bg-[var(--pastel-blue)] text-blue-800",
};

export function ReviewsTab({ reviews, onChange }: ReviewsTabProps) {
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [replyOpenIndex, setReplyOpenIndex] = useState<number | null>(null);

    // Analytics
    const totalReviews = reviews.length;
    const averageRating =
        totalReviews > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
            : 0;

    const ratingDistribution = useMemo(() => {
        const dist = [0, 0, 0, 0, 0]; // index 0 = 1-star, index 4 = 5-star
        reviews.forEach((r) => {
            if (r.rating >= 1 && r.rating <= 5) {
                dist[r.rating - 1]++;
            }
        });
        return dist;
    }, [reviews]);

    const statusCounts = useMemo(() => {
        const counts = { all: reviews.length, pending: 0, approved: 0, rejected: 0, featured: 0 };
        reviews.forEach((r) => {
            counts[r.status]++;
        });
        return counts;
    }, [reviews]);

    // Filtered reviews
    const filteredReviews = useMemo(() => {
        if (statusFilter === "all") return reviews;
        return reviews.filter((r) => r.status === statusFilter);
    }, [reviews, statusFilter]);

    const addManualReview = () => {
        const newReview: ReviewFormData = {
            reviewer_name: "",
            reviewer_email: "",
            rating: 5,
            title: "",
            body: "",
            status: "approved",
            is_verified_purchase: false,
            is_manual: true,
            admin_response: "",
            helpful_count: 0,
        };
        const updated = [newReview, ...reviews];
        onChange(updated);
        setEditingIndex(0);
    };

    const updateReview = (index: number, updates: Partial<ReviewFormData>) => {
        const updated = reviews.map((r, i) => (i === index ? { ...r, ...updates } : r));
        onChange(updated);
    };

    const removeReview = (index: number) => {
        const updated = reviews.filter((_, i) => i !== index);
        onChange(updated);
        if (editingIndex === index) setEditingIndex(null);
        if (replyOpenIndex === index) setReplyOpenIndex(null);
    };

    // Map filtered index back to original reviews array index
    const getOriginalIndex = (filteredIdx: number): number => {
        const review = filteredReviews[filteredIdx];
        return reviews.indexOf(review);
    };

    const filterTabs: { key: StatusFilter; label: string }[] = [
        { key: "all", label: "All" },
        { key: "pending", label: "Pending" },
        { key: "approved", label: "Approved" },
        { key: "rejected", label: "Rejected" },
        { key: "featured", label: "Featured" },
    ];

    return (
        <div className="space-y-4">

            {/* Analytics Summary */}
            {totalReviews > 0 && (
                <div className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Average rating */}
                        <div className="flex items-center gap-3 shrink-0">
                            <span className="text-3xl font-bold text-foreground">
                                {averageRating.toFixed(1)}
                            </span>
                            <div className="space-y-1">
                                <StarRatingInput
                                    value={Math.round(averageRating)}
                                    onChange={() => {}}
                                    size="sm"
                                    readonly
                                />
                                <p className="text-xs text-muted">
                                    {totalReviews} review{totalReviews !== 1 ? "s" : ""}
                                </p>
                            </div>
                        </div>

                        {/* Rating distribution */}
                        <div className="flex-1 space-y-1">
                            {[5, 4, 3, 2, 1].map((star) => {
                                const count = ratingDistribution[star - 1];
                                const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                                return (
                                    <div key={star} className="flex items-center gap-2 text-xs">
                                        <span className="w-3 text-muted text-right">{star}</span>
                                        <StarIcon className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                        <div className="flex-1 h-2 rounded-full bg-[var(--card-border)] overflow-hidden">
                                            <div
                                                className="h-2 rounded-full bg-yellow-400 transition-all"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                        <span className="w-6 text-muted text-right">{count}</span>
                                        <span className="w-10 text-muted text-right">
                                            {percentage.toFixed(0)}%
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Counts */}
                        <div className="flex flex-col gap-1 text-xs text-muted shrink-0">
                            <span>
                                <strong className="text-foreground">{totalReviews}</strong> total
                            </span>
                            <span>
                                <strong className="text-foreground">{statusCounts.approved}</strong>{" "}
                                approved
                            </span>
                            <span>
                                <strong className="text-foreground">{statusCounts.pending}</strong>{" "}
                                pending
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Status filter tabs */}
            <div className="flex items-center gap-1 flex-wrap">
                {filterTabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setStatusFilter(tab.key)}
                        className={
                            statusFilter === tab.key
                                ? "px-3 py-1.5 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-medium"
                                : "px-3 py-1.5 text-muted hover:text-foreground rounded-lg text-sm transition-colors"
                        }
                    >
                        {tab.label}
                        <span className="ml-1.5 opacity-70">{statusCounts[tab.key]}</span>
                    </button>
                ))}
            </div>

            {/* Action bar */}
            <div className="flex items-center">
                <button
                    type="button"
                    onClick={addManualReview}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Manual Review
                </button>
            </div>

            {/* Empty state */}
            {reviews.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <MessageSquare className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        No reviews yet. Add manual reviews or wait for customer submissions.
                    </p>
                </div>
            ) : filteredReviews.length === 0 ? (
                <div className="p-6 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <p className="text-muted text-sm">
                        No reviews match the selected filter.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredReviews.map((review, filteredIdx) => {
                        const originalIndex = getOriginalIndex(filteredIdx);
                        const isEditing = editingIndex === originalIndex;
                        const isReplyOpen = replyOpenIndex === originalIndex;

                        return (
                            <div
                                key={originalIndex}
                                className="bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4 space-y-3"
                            >
                                {/* Top row */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    {isEditing ? (
                                        <>
                                            <input
                                                type="text"
                                                value={review.reviewer_name}
                                                onChange={(e) =>
                                                    updateReview(originalIndex, {
                                                        reviewer_name: e.target.value,
                                                    })
                                                }
                                                placeholder="Reviewer name"
                                                className="px-3 py-1.5 bg-transparent border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                            />
                                            <input
                                                type="email"
                                                value={review.reviewer_email}
                                                onChange={(e) =>
                                                    updateReview(originalIndex, {
                                                        reviewer_email: e.target.value,
                                                    })
                                                }
                                                placeholder="Email"
                                                className="px-3 py-1.5 bg-transparent border border-[var(--card-border)] rounded-lg text-xs text-muted placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <span className="font-medium text-sm text-foreground">
                                                {review.reviewer_name || "Anonymous"}
                                            </span>
                                            {review.reviewer_email && (
                                                <span className="text-xs text-muted">
                                                    {review.reviewer_email}
                                                </span>
                                            )}
                                        </>
                                    )}

                                    {review.created_at && (
                                        <span className="text-xs text-muted">
                                            {new Date(review.created_at).toLocaleDateString()}
                                        </span>
                                    )}

                                    {/* Status badge */}
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeColors[review.status]}`}
                                    >
                                        {review.status.charAt(0).toUpperCase() + review.status.slice(1)}
                                    </span>

                                    {/* Manual badge */}
                                    {review.is_manual && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--pastel-pink)] text-pink-800">
                                            Manual
                                        </span>
                                    )}

                                    {/* Verified badge */}
                                    {review.is_verified_purchase && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--pastel-green)] text-green-800">
                                            Verified
                                        </span>
                                    )}
                                </div>

                                {/* Star rating */}
                                {isEditing ? (
                                    <StarRatingInput
                                        value={review.rating}
                                        onChange={(rating) =>
                                            updateReview(originalIndex, { rating })
                                        }
                                        size="sm"
                                    />
                                ) : (
                                    <StarRatingInput
                                        value={review.rating}
                                        onChange={() => {}}
                                        size="sm"
                                        readonly
                                    />
                                )}

                                {/* Title + body */}
                                {isEditing ? (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={review.title}
                                            onChange={(e) =>
                                                updateReview(originalIndex, {
                                                    title: e.target.value,
                                                })
                                            }
                                            placeholder="Review title"
                                            className="w-full px-3 py-2 bg-transparent border border-[var(--card-border)] rounded-lg text-sm font-medium text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                        />
                                        <textarea
                                            value={review.body}
                                            onChange={(e) =>
                                                updateReview(originalIndex, {
                                                    body: e.target.value,
                                                })
                                            }
                                            placeholder="Review body..."
                                            rows={3}
                                            className="w-full px-3 py-2 bg-transparent border border-[var(--card-border)] rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        {review.title && (
                                            <p className="text-sm font-medium text-foreground">
                                                {review.title}
                                            </p>
                                        )}
                                        {review.body && (
                                            <p className="text-sm text-muted mt-1">{review.body}</p>
                                        )}
                                    </div>
                                )}

                                {/* Admin response display */}
                                {review.admin_response && !isReplyOpen && (
                                    <div className="bg-[var(--pastel-mint)] rounded-lg p-3">
                                        <p className="text-xs font-medium text-foreground mb-1">
                                            Admin response:
                                        </p>
                                        <p className="text-sm text-foreground">
                                            {review.admin_response}
                                        </p>
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div className="flex items-center gap-2 flex-wrap pt-1">
                                    {/* Status select */}
                                    <select
                                        value={review.status}
                                        onChange={(e) =>
                                            updateReview(originalIndex, {
                                                status: e.target.value as ReviewFormData["status"],
                                            })
                                        }
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium border-0 cursor-pointer appearance-none ${statusBadgeColors[review.status]}`}
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="approved">Approved</option>
                                        <option value="rejected">Rejected</option>
                                        <option value="featured">Featured</option>
                                    </select>

                                    {/* Reply button */}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setReplyOpenIndex(isReplyOpen ? null : originalIndex)
                                        }
                                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground rounded-lg hover:bg-[var(--card-border)] transition-colors"
                                    >
                                        <Reply className="w-3.5 h-3.5" />
                                        Reply
                                    </button>

                                    {/* Edit / Done toggle */}
                                    {isEditing ? (
                                        <button
                                            type="button"
                                            onClick={() => setEditingIndex(null)}
                                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-700 bg-[var(--pastel-mint)] rounded-lg hover:bg-[var(--pastel-green)] transition-colors"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            Done
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setEditingIndex(originalIndex)}
                                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-foreground rounded-lg hover:bg-[var(--card-border)] transition-colors"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Edit
                                        </button>
                                    )}

                                    {/* Delete */}
                                    <button
                                        type="button"
                                        onClick={() => removeReview(originalIndex)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0 ml-auto"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Reply textarea (expandable) */}
                                {isReplyOpen && (
                                    <div className="space-y-2">
                                        <textarea
                                            value={review.admin_response}
                                            onChange={(e) =>
                                                updateReview(originalIndex, {
                                                    admin_response: e.target.value,
                                                })
                                            }
                                            placeholder="Write an admin response..."
                                            rows={2}
                                            className="w-full px-3 py-2 bg-[var(--pastel-mint)] border border-[var(--card-border)] rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setReplyOpenIndex(null)}
                                            className="text-xs text-muted hover:text-foreground transition-colors"
                                        >
                                            Close
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
