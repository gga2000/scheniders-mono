"use client";

import { useProductReviews, useReviewModeration } from "@/hooks/use-product-reviews";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { ReviewsBoard } from "@/components/store-engagement/reviews-board";

export default function ReviewsPage() {
    const { t } = useLanguage();
    const { data: reviews = [], isLoading, isError } = useProductReviews();
    const { setStatus, remove } = useReviewModeration();
    const failed = () => toast.error(t("reviews.actionFailed"));

    return (
        <ReviewsBoard
            reviews={reviews}
            isLoading={isLoading}
            isError={isError}
            busyId={
                setStatus.isPending ? (setStatus.variables?.id ?? null) : remove.isPending ? (remove.variables ?? null) : null
            }
            onSetStatus={(id, status) => setStatus.mutate({ id, status }, { onError: failed })}
            onRemove={(id) => remove.mutate(id, { onError: failed })}
        />
    );
}
