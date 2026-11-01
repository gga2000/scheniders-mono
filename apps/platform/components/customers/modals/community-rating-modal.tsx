"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { useSubmitCommunityRating } from "@/hooks/use-community-ratings";
import { toast } from "@/hooks/use-toast";
import { ModalShell } from "./modal-shell";
import { cn } from "@/lib/utils";

const QUICK_TAGS = ["reliable", "communicative", "punctual", "difficult", "unresponsive", "friendly"];

function StarSelector({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
    return (
        <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <motion.button
                        key={star}
                        whileTap={{ scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                        onClick={() => onChange(star)}
                        className="p-1"
                    >
                        <Star
                            className={cn(
                                "w-7 h-7 transition-colors",
                                star <= value ? "star-filled fill-amber-400 text-amber-400" : "star-empty text-muted/30"
                            )}
                        />
                    </motion.button>
                ))}
            </div>
        </div>
    );
}

export function CommunityRatingModal() {
    const { t } = useLanguage();
    const { isCommunityRatingModalOpen, setCommunityRatingModalOpen, communityRatingContext } = useCustomerStore();
    const submitRating = useSubmitCommunityRating();

    const [trustStars, setTrustStars] = useState(0);
    const [commStars, setCommStars] = useState(0);
    const [behaviorStars, setBehaviorStars] = useState(0);
    const [comment, setComment] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [overallType, setOverallType] = useState<"positive" | "neutral" | "warning">("neutral");

    const handleClose = () => {
        setCommunityRatingModalOpen(false);
        setTrustStars(0);
        setCommStars(0);
        setBehaviorStars(0);
        setComment("");
        setSelectedTags([]);
        setOverallType("neutral");
    };

    const handleSubmit = () => {
        if (!communityRatingContext || trustStars === 0 || commStars === 0 || behaviorStars === 0) return;
        submitRating.mutate({
            customer_phone: communityRatingContext.phone,
            order_id: communityRatingContext.orderId,
            trust_stars: trustStars,
            communication_stars: commStars,
            behavior_stars: behaviorStars,
            overall_type: overallType,
            comment: comment || undefined,
            quick_tags: selectedTags,
        }, {
            onSuccess: () => {
                toast({ variant: "success", title: t("customers.rating.saved") });
                handleClose();
            },
            onError: () => toast({ variant: "error", title: t("customers.rating.failed") }),
        });
    };

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    return (
        <ModalShell isOpen={isCommunityRatingModalOpen} onClose={handleClose} title={t("customers.rating.title")}>
            <div className="space-y-6">
                <StarSelector value={trustStars} onChange={setTrustStars} label={t("customers.rating.trust")} />
                <StarSelector value={commStars} onChange={setCommStars} label={t("customers.rating.communication")} />
                <StarSelector value={behaviorStars} onChange={setBehaviorStars} label={t("customers.rating.behavior")} />

                {/* Overall type */}
                <div className="grid grid-cols-3 gap-2">
                    {(["positive", "neutral", "warning"] as const).map((type) => (
                        <button
                            key={type}
                            onClick={() => setOverallType(type)}
                            className={cn(
                                "py-2 px-3 rounded-xl text-sm font-medium border transition-all",
                                overallType === type
                                    ? type === "positive" ? "bg-green-50 border-green-300 text-green-700"
                                    : type === "warning" ? "bg-red-50 border-red-300 text-red-700"
                                    : "bg-blue-50 border-blue-300 text-blue-700"
                                    : "border-(--card-border) text-muted-foreground"
                            )}
                        >
                            {t(`customers.rating.${type}`)}
                        </button>
                    ))}
                </div>

                {/* Comment */}
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value.slice(0, 280))}
                    placeholder={t("customers.rating.comment")}
                    dir="auto"
                    className="w-full bg-muted/20 border border-(--card-border) rounded-xl p-3 text-sm resize-none h-20 focus:ring-2 focus:ring-foreground/10"
                />
                <p className="text-xs text-muted-foreground text-right tabular-nums">{comment.length}/280</p>

                {/* Quick tags */}
                <div className="flex flex-wrap gap-2">
                    {QUICK_TAGS.map((tag) => (
                        <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={cn(
                                "quick-tag-pill px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                                selectedTags.includes(tag)
                                    ? "quick-tag-active bg-foreground text-background border-foreground"
                                    : "border-(--card-border) text-muted-foreground hover:bg-muted/30"
                            )}
                        >
                            {t(`customers.rating.tag.${tag}`)}
                        </button>
                    ))}
                </div>

                {/* Submit */}
                <button
                    onClick={handleSubmit}
                    disabled={trustStars === 0 || commStars === 0 || behaviorStars === 0 || submitRating.isPending}
                    className="w-full min-h-11 bg-foreground text-background py-3 rounded-xl font-bold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                    {t("customers.rating.publish")}
                </button>
            </div>
        </ModalShell>
    );
}
