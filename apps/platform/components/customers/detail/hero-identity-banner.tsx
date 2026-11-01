"use client";

import { motion } from "framer-motion";
import { Ban, ChevronRight, MessageCircle, Phone, Plus, Star } from "lucide-react";
import { formatBaghdadMonthYear, formatPhoneDisplay, monogram, toIraqE164 } from "@/lib/customer-format";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { TRUST_TIER_CONFIG, type TrustTier } from "@/types/customer";
import { CustomerTagChip } from "@/components/customers/customer-tag-chip";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { PeerComparisonBadge } from "@/components/customers/detail/peer-comparison-badge";
import { codRiskKey, customerAccent, displayScore, isBlockedCustomer, showsTrustScore, VALUE_META, type RiskLevel, type ValueTier } from "@/lib/customer-reliability";
import { RiskChip, ValuePill, WHATSAPP_TONE } from "@/components/customers/reliability-pill";
import { CustomerBlockAction } from "@/components/customers/customer-block-action";
import { CustomerRatingHelp } from "@/components/customers/customer-rating-help";
import { CustomerPlace } from "@/components/customers/customer-place";

interface HeroIdentityBannerProps {
    name: string;
    phone: string;
    city?: string | null;
    /** Governorate code: the place leads with it, as in the drawer and the list. */
    governorate?: string | null;
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
    /** False when the value/risk banner right below already shows both pills. */
    showAxes?: boolean;
    /** Starts a new order for this customer. Omitted for a blocked customer: the block means do not ship. */
    onNewOrder?: () => void;
}

export function HeroIdentityBanner({
    name,
    phone,
    city,
    governorate,
    tier,
    valueTier,
    riskLevel,
    trustScore,
    totalOrders,
    isBlacklisted,
    tags,
    firstOrderDate,
    showAxes = true,
    onNewOrder,
}: HeroIdentityBannerProps) {
    const { t, language } = useLanguage();
    const store = useCustomerStore();
    const { can } = usePermission();
    const canEdit = can(PERMISSIONS.EDIT_CUSTOMERS);
    const config = TRUST_TIER_CONFIG[tier];

    const block = { is_blacklisted: isBlacklisted, risk_level: riskLevel, trust_tier: tier };
    const blocked = isBlockedCustomer(block);
    // The avatar is tinted like the drawer band: the risk colour when COD is unsafe, never a green value tier.
    const avatarTone = valueTier
        ? customerAccent(valueTier, blocked ? "blocked" : riskLevel ?? "clean")
        : { surfaceBg: config.bgClass, surfaceText: config.textClass };
    // A failing customer never leads with a value tier.
    const unsafe = blocked || riskLevel === "high" || tier === "risky" || tier === "critical";
    // A tag that only repeats the value tier ("VIP" under the VIP pill) adds nothing.
    const valueLabel = valueTier ? t(`customers.value.${valueTier}`, VALUE_META[valueTier].label).trim().toLowerCase() : null;
    const shownTags = (tags ?? []).filter((tag) => tag.name.trim().toLowerCase() !== valueLabel);

    // Shown out of 100 the same way the drawer shows it, under the same rule:
    // no score for an unrated customer, nor for a blocked one.
    const shownScore = trustScore === null || !showsTrustScore(block) ? null : displayScore(trustScore);

    const memberSince = firstOrderDate ? formatBaghdadMonthYear(firstOrderDate, language) : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={cn(
                "w-full bg-(--card-bg) rounded-2xl p-6 border border-(--card-border)",
                "shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                "flex flex-col sm:flex-row sm:items-center justify-between gap-5 sm:gap-6"
            )}
        >
            {/* LEFT — avatar + info */}
            <div className="flex items-start gap-4 min-w-0">
                {/* Avatar */}
                <div className="relative shrink-0">
                    <div
                        className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center",
                            "text-xl font-bold select-none",
                            avatarTone.surfaceBg,
                            avatarTone.surfaceText
                        )}
                    >
                        {monogram(name)}
                    </div>

                    {totalOrders >= 10 && (
                        <span
                            title={t("customers.profile.verifiedHint")}
                            className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-teal-100 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200 text-[11px] font-bold px-1.5 rounded-full border-2 border-(--card-bg) leading-tight whitespace-nowrap cursor-help"
                        >
                            <span className="sr-only">{t("customers.profile.verifiedHint")}: </span>
                            {t("customers.profile.verified")}
                        </span>
                    )}
                </div>

                {/* Info block */}
                <div className="min-w-0">
                    {/* Name + the value / COD-risk pills the list and drawer use */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <h1 dir="auto" className="text-2xl font-headline font-extrabold tracking-tight text-foreground leading-tight">
                            {name}
                        </h1>
                        {/* An unsafe customer is never shown with a (green) value tier. */}
                        {showAxes && valueTier && !unsafe && <ValuePill tier={valueTier} variant="compact" />}
                        {showAxes && (blocked ? <RiskChip risk="blocked" /> : riskLevel && <RiskChip risk={riskLevel} showClean />)}
                        {/* Without the value/risk banner below, the pills are explained here. */}
                        {showAxes && <CustomerRatingHelp />}
                    </div>

                    {/* Phone, then place and tenure */}
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground font-medium text-sm mt-1.5">
                        <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-foreground text-[15px]">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            {formatPhoneDisplay(phone)}
                        </span>
                        {(governorate || city) && <><span aria-hidden>•</span><CustomerPlace governorate={governorate} city={city} locale={language} /></>}
                        {memberSince && <><span aria-hidden>•</span><span>{t("customers.profile.memberSince")} {memberSince}</span></>}
                    </p>

                    {/* Tags */}
                    {/* Tags (in their colour) and the peer badge on one line */}
                    {(shownTags.length > 0 || shownScore !== null) && (
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            {shownTags.map((tag) => <CustomerTagChip key={tag.id} name={tag.name} color={tag.color} />)}
                            {shownScore !== null && <PeerComparisonBadge phone={phone} />}
                        </div>
                    )}

                    {/* Actions: the same WhatsApp, Call and Block as the drawer, and New order as the one filled button */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <a
                            href={`https://wa.me/${toIraqE164(phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn("h-10 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors", WHATSAPP_TONE)}
                        >
                            <MessageCircle className="w-4 h-4" />
                            {t("customers.actions.whatsapp")}
                        </a>
                        <a
                            href={`tel:+${toIraqE164(phone)}`}
                            className="h-10 px-4 rounded-xl border border-(--card-border) text-sm font-semibold text-foreground inline-flex items-center gap-2 hover:bg-muted/40 transition-colors"
                        >
                            <Phone className="w-4 h-4" />
                            {t("customers.actions.call")}
                        </a>
                        {/* Rating a blocked customer changes nothing you would act on. */}
                        {canEdit && !blocked && (
                            <button
                                onClick={() => {
                                    store.setCommunityRatingContext({ phone });
                                    store.setCommunityRatingModalOpen(true);
                                }}
                                className="h-10 px-4 rounded-xl border border-(--card-border) text-sm font-semibold text-foreground inline-flex items-center gap-2 hover:bg-muted/40 transition-colors"
                            >
                                <Star className="w-4 h-4 text-amber-500" />
                                {t("customers.actions.rate")}
                            </button>
                        )}
                        {/* Block or unblock, the drawer's flow: an outline, never the filled primary. */}
                        <CustomerBlockAction phone={phone} name={name} isBlacklisted={!!isBlacklisted} className="h-10 px-4 text-sm" />
                        {onNewOrder && !blocked && (
                            <button
                                onClick={onNewOrder}
                                className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-bold inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                            >
                                <Plus className="w-4 h-4" />
                                {t("customers.drawer.newOrder", "New order")}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT — trust score (clickable → opens score breakdown). A blocked customer has
                no score: the value/risk banner below says "Do not ship" once, so the hero adds
                nothing; without that banner (no orders yet) the hero carries the one stamp, beside the Blocked chip. */}
            {blocked ? (
                showAxes && (
                    <p className="inline-flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold bg-rose-700 text-white">
                        <Ban className="w-4 h-4 shrink-0" />
                        {t(codRiskKey("blocked"))}
                    </p>
                )
            ) : shownScore === null ? (
                // Not scored yet: said in words, as the drawer says it, with no breakdown to open.
                // The trust card below says when the score appears.
                <div className="flex flex-col items-end shrink-0 gap-1">
                    <span className="text-muted-foreground font-semibold text-xs">{t("customers.profile.trustScore")}</span>
                    <span className="text-sm font-semibold text-muted-foreground">{t("customers.trust.notScored")}</span>
                </div>
            ) : (
                <button
                    onClick={() => {
                        store.setScoreBreakdownPhone(phone);
                        store.setScoreBreakdownModalOpen(true);
                    }}
                    className="flex flex-col items-end shrink-0 gap-1 cursor-pointer group"
                >
                    <span className="text-muted-foreground font-semibold text-xs">
                        {t("customers.profile.trustScore")}
                    </span>

                    <div className="flex items-end gap-1.5">
                        <span className="text-4xl font-headline font-black tabular-nums text-foreground leading-none group-hover:opacity-80 transition-opacity">
                            {shownScore.toLocaleString("en-US")}
                        </span>
                        <span className="text-lg text-muted-foreground mb-0.5">/100</span>
                    </div>

                    {/* The way in to how the number is built, visible rather than a hidden click on the number. */}
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground underline-offset-2 group-hover:text-foreground group-hover:underline">
                        {t("customers.trust.seeBreakdown")}
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    </span>
                </button>
            )}
        </motion.div>
    );
}
