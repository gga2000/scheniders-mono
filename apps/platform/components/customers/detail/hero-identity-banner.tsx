"use client";

import { motion } from "framer-motion";
import { MessageCircle, Phone, ShieldAlert, ShieldCheck, Star } from "lucide-react";
import { formatBaghdadMonthYear, formatPhoneDisplay, monogram, toIraqE164 } from "@/lib/customer-format";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { TRUST_TIER_CONFIG, type TrustTier } from "@/types/customer";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { PeerComparisonBadge } from "@/components/customers/detail/peer-comparison-badge";
import { ConfidenceIndicator } from "@/components/customers/shared/confidence-indicator";
import { displayScore, hasRatedScore, VALUE_META, type RiskLevel, type ValueTier } from "@/lib/customer-reliability";
import { RiskChip, ValuePill } from "@/components/customers/reliability-pill";

interface HeroIdentityBannerProps {
    name: string;
    phone: string;
    city?: string | null;
    tier: TrustTier;
    /** Value and COD-risk axes, the same labels the list and drawer show. Null until the reliability read is in. */
    valueTier: ValueTier | null;
    riskLevel: RiskLevel | null;
    /** Null until the customer has been scored. */
    trustScore: number | null;
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
    valueTier,
    riskLevel,
    trustScore,
    totalOrders,
    isBlacklisted,
    tags,
    firstOrderDate,
}: HeroIdentityBannerProps) {
    const { t, language } = useLanguage();
    const store = useCustomerStore();
    const { can } = usePermission();
    const canEdit = can(PERMISSIONS.EDIT_CUSTOMERS);
    const config = TRUST_TIER_CONFIG[tier];

    const valueMeta = valueTier ? VALUE_META[valueTier] : null;
    const blocked = isBlacklisted || riskLevel === "blocked" || tier === "blocked";
    // A shield with a tick next to a failing score contradicts it.
    const unsafe = blocked || riskLevel === "high" || tier === "risky" || tier === "critical";
    const ShieldIcon = unsafe ? ShieldAlert : ShieldCheck;

    // Shown out of 100 the same way the drawer shows it.
    // Unrated ("new") customers have no proven score, same as the drawer.
    // Blocked customers get no score either: "100/100" next to Blocked misleads.
    const shownScore = trustScore === null || !hasRatedScore(tier) ? null : displayScore(trustScore);

    const memberSince = firstOrderDate ? formatBaghdadMonthYear(firstOrderDate, language) : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={cn(
                "w-full bg-(--card-bg) rounded-[2rem] sm:rounded-[3rem] p-5 sm:p-8 border border-(--card-border)",
                "shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]",
                "flex flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-6"
            )}
        >
            {/* LEFT — avatar + info */}
            <div className="flex items-start gap-5 min-w-0">
                {/* Avatar */}
                <div className="relative shrink-0">
                    <div
                        className={cn(
                            "w-16 h-16 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center",
                            "text-2xl sm:text-3xl font-bold select-none",
                            valueMeta ? valueMeta.pillBg : config.bgClass,
                            valueMeta ? valueMeta.pillText : config.textClass
                        )}
                    >
                        {monogram(name)}
                    </div>

                    {totalOrders >= 10 && (
                        <span
                            className="absolute -bottom-1 -right-1 bg-[#c7f8ef] text-[#1f4e48] text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-white leading-tight"
                        >
                            {t("customers.profile.verified")}
                        </span>
                    )}
                </div>

                {/* Info block */}
                <div className="min-w-0">
                    {/* Name + the value / COD-risk pills the list and drawer use */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1 dir="auto" className="text-3xl font-headline font-extrabold tracking-tight text-foreground leading-tight">
                            {name}
                        </h1>
                        {valueTier && <ValuePill tier={valueTier} variant="compact" />}
                        {blocked ? <RiskChip risk="blocked" /> : riskLevel && <RiskChip risk={riskLevel} showClean />}
                    </div>

                    {/* Phone, then place and tenure */}
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground font-medium text-sm mt-1.5">
                        <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-foreground text-[15px]">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            {formatPhoneDisplay(phone)}
                        </span>
                        {city && <><span aria-hidden>•</span><bdi>{city}</bdi></>}
                        {memberSince && <><span aria-hidden>•</span><span>{t("customers.profile.memberSince")} {memberSince}</span></>}
                    </p>

                    {/* Tags */}
                    {tags && tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {tags.map((tag) => (
                                <span
                                    key={tag.id}
                                    className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/40 text-muted-foreground"
                                >
                                    <bdi>{tag.name}</bdi>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Peer badges — integrated into hero, not floating below */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        {shownScore !== null && <PeerComparisonBadge phone={phone} />}
                        <ConfidenceIndicator orderCount={totalOrders} />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-4">
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() =>
                                window.open(`https://wa.me/${toIraqE164(phone)}`, "_blank")
                            }
                            className="w-11 h-11 flex items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                            aria-label={t("customers.actions.whatsapp")}
                        >
                            <MessageCircle className="w-4 h-4" />
                        </motion.button>

                        <motion.a
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.96 }}
                            href={`tel:+${toIraqE164(phone)}`}
                            className="w-11 h-11 flex items-center justify-center rounded-full border border-(--card-border) text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={t("customers.actions.call")}
                        >
                            <Phone className="w-4 h-4" />
                        </motion.a>


                        {canEdit && (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => {
                                    store.setCommunityRatingContext({ phone });
                                    store.setCommunityRatingModalOpen(true);
                                }}
                                className="flex items-center gap-1.5 min-h-11 px-4 rounded-full border border-(--card-border) text-foreground hover:bg-muted/40 transition-colors text-sm font-semibold"
                            >
                                <Star className="w-3.5 h-3.5 text-amber-500" />
                                {t("customers.actions.rate")}
                            </motion.button>
                        )}
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
                    {shownScore === null ? (
                        <span className="text-2xl font-semibold text-muted-foreground leading-none">—</span>
                    ) : (
                        <>
                            <span className="text-5xl font-headline font-black tabular-nums text-foreground leading-none group-hover:opacity-80 transition-opacity">
                                {shownScore.toLocaleString("en-US")}
                            </span>
                            <span className="text-lg text-muted-foreground mb-0.5">/100</span>
                        </>
                    )}
                </div>

                {/* Shield icon */}
                <ShieldIcon
                    className={cn("w-6 h-6 mt-1", unsafe && "text-rose-600 dark:text-rose-400")}
                    style={unsafe ? undefined : { color: config.ringColor }}
                />

                <p className="text-muted-foreground text-[10px] font-medium italic text-right">
                    {t(TRUST_SCORE_SUBTITLE_KEY[tier])}
                </p>
            </motion.button>
        </motion.div>
    );
}
