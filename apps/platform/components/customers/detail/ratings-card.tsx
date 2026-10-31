"use client";

import { useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";
import { RatingNotDeletedError, useDeleteCommunityRating } from "@/hooks/use-community-ratings";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CommunityRating } from "@/types/customer";

const TYPE_TONE: Record<CommunityRating["overall_type"], string> = {
    positive: "bg-emerald-50 text-emerald-700",
    neutral: "bg-muted text-muted-foreground",
    warning: "bg-rose-50 text-rose-700",
};

/** The day the rating was given, in Baghdad time (a UTC slice is a day early after 21:00). */
function ratingDay(iso: string): string {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
}

/** Ratings your store gave this customer. Only a rating's author can remove it (database rule). */
export function RatingsCard({ ratings }: { ratings: CommunityRating[] }) {
    const { t } = useLanguage();
    const { user } = useAuth();
    const deleteRating = useDeleteCommunityRating();
    // Removing a rating rescores trust and cannot be undone, so it takes a second tap.
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const onDelete = (id: string) =>
        deleteRating.mutate(id, {
            onSettled: () => setConfirmingId(null),
            onError: (error) =>
                toast({
                    variant: "error",
                    title: t(error instanceof RatingNotDeletedError
                        ? "customers.profile.ratingDeleteFailed"
                        : "customers.profile.ratingDeleteError"),
                }),
        });

    return (
        <div className="bg-(--card-bg) rounded-[3rem] p-8 border border-(--card-border) shadow-[0_4px_24px_rgba(30,30,30,0.07),0_1px_4px_rgba(30,30,30,0.04)]">
            <div className="flex items-center gap-2.5 mb-6">
                <Star className="w-5 h-5 text-amber-400" />
                <span className="font-headline font-extrabold text-lg text-foreground">
                    {t("customers.profile.ratings")}
                </span>
            </div>
            {ratings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("customers.profile.noRatings")}</p>
            ) : (
                <ul className="space-y-3">
                    {ratings.map((rating) => {
                        const average = (rating.trust_stars + rating.communication_stars + rating.behavior_stars) / 3;
                        return (
                            <li key={rating.id} className="bg-muted/30 p-5 rounded-2xl flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", TYPE_TONE[rating.overall_type])}>
                                            {t(`customers.rating.${rating.overall_type}`)}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
                                            {average.toFixed(1)}<Star className="w-3.5 h-3.5 text-amber-400" />
                                        </span>
                                        <span className="text-xs text-muted-foreground tabular-nums">{ratingDay(rating.created_at)}</span>
                                    </div>
                                    {rating.comment && (
                                        <p className="text-sm text-foreground leading-relaxed">{rating.comment}</p>
                                    )}
                                </div>
                                {rating.rater_id && rating.rater_id === user?.id && (
                                    confirmingId === rating.id ? (
                                        <button
                                            onClick={() => onDelete(rating.id)}
                                            disabled={deleteRating.isPending}
                                            className="min-h-11 shrink-0 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white disabled:opacity-50"
                                        >
                                            {t("customers.profile.ratingRemoveConfirm")}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmingId(rating.id)}
                                            className="-m-2 w-11 h-11 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                                            aria-label={t("common.delete")}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
