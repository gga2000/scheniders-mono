"use client";

import { motion } from "framer-motion";
import { MessageCircle, Phone, Edit2, Share2, ShieldCheck, Star } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { TRUST_TIER_CONFIG, type TrustTier } from "@/types/customer";
import { cn } from "@/lib/utils";
import { PeerComparisonBadge } from "@/components/customers/detail/peer-comparison-badge";
import { ConfidenceIndicator } from "@/components/customers/shared/confidence-indicator";

interface HeroIdentityBannerProps {
    name: string;
    phone: string;
    city?: string | null;
    tier: TrustTier;
    trustScore: number;
    totalOrders: number;
    isBlacklisted?: boolean;
    tags?: { id: string; name: string; color: string }[];
    firstOrderDate?: string | null;
}

const TRUST_SCORE_SUBTITLE_KEY: Record<TrustTier, string> = {
    platinum: "customers.trust.subtitle.platinum",
    gold: "customers.trust.subtitle.gold",
    silver: "customers.trust.subtitle.silver",
    bronze: "customers.trust.subtitle.bronze",
    new: "customers.trust.subtitle.new",
    watch: "customers.trust.subtitle.watch",
    risky: "customers.trust.subtitle.risky",
    critical: "customers.trust.subtitle.critical",
    blocked: "customers.trust.subtitle.blocked",
};

export function HeroIdentityBanner({
    name,
    phone,
    city,
    tier,
    trustScore,
    totalOrders,
    isBlacklisted,
    tags,
    firstOrderDate,
}: HeroIdentityBannerProps) {
    const { t } = useLanguage();
    const store = useCustomerStore();
    const config = TRUST_TIER_CONFIG[tier];

    const initials = name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    // Score is uncapped — can go above 100 or below 0
    const displayScore = trustScore;

    const memberSince = firstOrderDate
        ? new Date(firstOrderDate).toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
          })
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={cn(
                "w-full bg-(--card-bg) rounded-[3rem] p-8 border border-(--card-border)",
                "shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]",
                "flex flex-row items-center justify-between gap-6"
            )}
        >
            {/* LEFT — avatar + info */}
            <div className="flex items-start gap-5 min-w-0">
                {/* Avatar */}
                <div className="relative shrink-0">
                    <div
                        className={cn(
                            "w-24 h-24 rounded-full border-4 border-[#FBE38E] flex items-center justify-center",
                            "text-2xl font-bold select-none",
                            config.bgClass,
                            config.textClass
                        )}
                    >
                        {initials}
                    </div>

                    {totalOrders >= 10 && (
                        <span
                            className="absolute -bottom-1 -right-1 bg-[#c7f8ef] text-[#1f4e48] text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-white leading-tight"
                        >
                            VERIFIED
                        </span>
                    )}
                </div>

                {/* Info block */}
                <div className="min-w-0">
                    {/* Name + tier badge */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="text-3xl font-headline font-extrabold tracking-tight text-foreground leading-tight">
                            {name}
                        </h1>
                        <span
                            className={cn(
                                "px-3 py-1 rounded-full text-xs font-bold border",
                                config.bgClass,
                                config.textClass,
                                config.borderClass
                            )}
                        >
                            {t(config.labelKey)}
                        </span>
                        {isBlacklisted && (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300">
                                {t("customers.tier.blocked")}
                            </span>
                        )}
                    </div>

                    {/* Subtitle */}
                    <p className="text-muted-foreground font-medium text-sm mt-1">
                        {city ? `${city}, Iraq` : "Iraq"}
                        {memberSince && (
                            <>
                                {" • "}
                                {t("customers.profile.memberSince")} {memberSince}
                            </>
                        )}
                    </p>

                    {/* Tags */}
                    {tags && tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {tags.map((tag) => (
                                <span
                                    key={tag.id}
                                    className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/40 text-muted-foreground"
                                >
                                    {tag.name}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Peer badges — integrated into hero, not floating below */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <PeerComparisonBadge phone={phone} city={city || null} />
                        <ConfidenceIndicator orderCount={totalOrders} />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-4">
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() =>
                                window.open(`https://wa.me/964${phone}`, "_blank")
                            }
                            className="p-2.5 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                            aria-label={t("customers.actions.whatsapp") || "WhatsApp"}
                        >
                            <MessageCircle className="w-4 h-4" />
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.96 }}
                            className="p-2.5 rounded-full border border-(--card-border) text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={t("customers.actions.call") || "Call"}
                        >
                            <Phone className="w-4 h-4" />
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.96 }}
                            className="p-2.5 rounded-full border border-(--card-border) text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={t("customers.actions.edit") || "Edit"}
                        >
                            <Edit2 className="w-4 h-4" />
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.96 }}
                            className="p-2.5 rounded-full border border-(--card-border) text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={t("customers.actions.share") || "Share"}
                        >
                            <Share2 className="w-4 h-4" />
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => {
                                store.setCommunityRatingContext({ phone });
                                store.setCommunityRatingModalOpen(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-colors text-xs font-bold"
                            aria-label={t("customers.actions.rate") || "Rate Customer"}
                        >
                            <Star className="w-3.5 h-3.5" />
                            {t("customers.actions.rate") || "Rate"}
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* RIGHT — trust score (clickable → opens score breakdown) */}
            <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                    store.setScoreBreakdownPhone(phone);
                    store.setScoreBreakdownModalOpen(true);
                }}
                className="flex flex-col items-end shrink-0 gap-1 cursor-pointer group"
            >
                <span className="text-muted-foreground font-bold text-[10px] tracking-[0.2em] uppercase">
                    {t("customers.profile.trustScore")}
                </span>

                <div className="flex items-end gap-1.5">
                    <span className="text-5xl font-headline font-black tabular-nums text-foreground leading-none group-hover:opacity-80 transition-opacity">
                        {displayScore.toLocaleString("en-US")}
                    </span>
                    <span className="text-lg text-muted-foreground mb-0.5">/100</span>
                </div>

                {/* Shield icon */}
                <ShieldCheck
                    className="w-6 h-6 mt-1"
                    style={{ color: config.ringColor }}
                />

                <p className="text-muted-foreground text-[10px] font-medium italic text-right">
                    {t(TRUST_SCORE_SUBTITLE_KEY[tier])}
                </p>
            </motion.button>
        </motion.div>
    );
}
