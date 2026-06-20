import type { ReviewStatus } from "@scheniders/shared";

export interface ReviewQueueCounts {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
}

/** Tally a review list by moderation status (drives the queue filter badges). */
export function countReviewsByStatus(
    reviews: ReadonlyArray<{ status: ReviewStatus }>,
): ReviewQueueCounts {
    const counts: ReviewQueueCounts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        total: reviews.length,
    };
    for (const r of reviews) {
        if (r.status === "pending") counts.pending += 1;
        else if (r.status === "approved") counts.approved += 1;
        else if (r.status === "rejected") counts.rejected += 1;
    }
    return counts;
}
