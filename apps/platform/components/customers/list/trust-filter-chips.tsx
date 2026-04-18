"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { TrustTier, TRUST_TIER_CONFIG } from "@/types/customer";

interface TrustFilterChipsProps {
    activeTier: TrustTier | "all" | undefined;
    onTierChange: (tier: TrustTier | "all" | undefined) => void;
    tierCounts?: Record<string, number>;
}

const POSITIVE_TIERS: (TrustTier | "all")[] = ["all", "platinum", "gold", "silver", "bronze", "new"];
const NEGATIVE_TIERS: TrustTier[] = ["watch", "risky", "blocked"];

const INACTIVE_BADGE_COLORS: Record<string, string> = {
    platinum: "bg-[#E4C1F9]/40",
    gold: "bg-[#FBE38E]/40",
    silver: "bg-gray-200",
    bronze: "bg-orange-100",
    new: "bg-[#B8E8E0]/40",
    watch: "bg-[#F4C7CF]/40",
    risky: "bg-red-100",
    blocked: "bg-black text-white",
    network: "bg-pastel-purple",
};

export function TrustFilterChips({ activeTier, onTierChange, tierCounts }: TrustFilterChipsProps) {
    const { t } = useLanguage();
    const current = activeTier || "all";

    function renderChip(tier: TrustTier | "all") {
        const isActive = current === tier;
        const config = tier === "all" ? null : TRUST_TIER_CONFIG[tier];
        const label = tier === "all" ? t("customers.all") : t(config!.labelKey);
        const count = tier === "all" ? undefined : tierCounts?.[tier];

        return (
            <motion.button
                key={tier}
                onClick={() => onTierChange(tier === "all" ? undefined : tier)}
                whileTap={{ scale: 0.95 }}
                className={
                    isActive
                        ? "bg-foreground text-background px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"
                        : "bg-(--card-bg) border border-(--card-border) text-muted-foreground px-5 py-2.5 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-muted/50 transition-all"
                }
            >
                {label}
                {count !== undefined && (
                    <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
                            isActive
                                ? "bg-white/20"
                                : `${INACTIVE_BADGE_COLORS[tier] || "bg-gray-200"} ${tier !== "blocked" ? "text-foreground" : ""}`
                        }`}
                    >
                        {count.toLocaleString("en-US")}
                    </span>
                )}
            </motion.button>
        );
    }

    return (
        <div className="flex flex-wrap gap-3 mb-6">
            {POSITIVE_TIERS.map((tier) => renderChip(tier))}

            {/* Divider between positive and negative tiers */}
            <div className="h-8 w-px bg-gray-300 mx-1 self-center" />

            {NEGATIVE_TIERS.map((tier) => renderChip(tier))}

            {/* Network chip */}
            <motion.button
                onClick={() => onTierChange("blocked" as TrustTier)}
                whileTap={{ scale: 0.95 }}
                className="bg-(--card-bg) border border-(--card-border) text-muted-foreground px-5 py-2.5 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-muted/50 transition-all"
            >
                {t("customers.filter.network")}
                {tierCounts?.blocked !== undefined && (
                    <span className="bg-pastel-purple text-foreground px-1.5 py-0.5 rounded-full text-[10px] tabular-nums">
                        {tierCounts.blocked.toLocaleString("en-US")}
                    </span>
                )}
            </motion.button>
        </div>
    );
}
