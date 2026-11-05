"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { FinancialValue } from "@/components/ui/financial-value";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import { SHIELD_TONE } from "@/components/orders/shield/shield-tone";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useShieldHome } from "@/hooks/use-shield-home";
import { ownDeliveryRate, riskyOrderBand, shippedRefusedRate, type RiskyOpenOrder, type ShieldImpact, type StoreScore } from "@/lib/shield/home";
import { cn } from "@/lib/utils";

const SHOWN = 6;
const CARD = "flex h-full flex-col gap-3 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5";

/**
 * Shield on the home page: the open orders to call before confirming (their
 * customer refused or went silent here or in other stores), and what Shield
 * changed in the last 30 days.
 */
export function ShieldHomeRow() {
    const { risky, impact, score, impactDays } = useShieldHome();

    if (risky.isError || impact.isError || score.isError) {
        const retry = () => {
            void risky.refetch();
            void impact.refetch();
            void score.refetch();
        };
        return <WidgetLoadError onRetry={retry} className="min-h-[200px]" />;
    }
    if (!risky.data || !impact.data || !score.data) return <WidgetPending className="min-h-[200px]" />;

    return (
        <div data-shield-home className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-7">
                <ShieldCallFirstCard rows={risky.data} asOf={risky.dataUpdatedAt} />
            </div>
            <div className="xl:col-span-5">
                <ShieldImpactCard impact={impact.data} score={score.data} days={impactDays} />
            </div>
        </div>
    );
}

function ageOf(createdAt: string, now: number): { key: string; n: number } {
    const hours = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 3_600_000));
    return hours < 24 ? { key: "shield.home.ageHours", n: hours } : { key: "shield.home.ageDays", n: Math.floor(hours / 24) };
}

/** Ages are read against when the list was loaded (it refreshes every 5 minutes). */
function ShieldCallFirstCard({ rows, asOf }: { rows: RiskyOpenOrder[]; asOf: number }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const red = rows.filter((r) => riskyOrderBand(r) === "red").length;

    return (
        <section data-shield-call-first className={CARD}>
            <header className="flex items-center gap-3">
                <span aria-hidden="true" className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", !rows.length ? SHIELD_TONE.green.pill : red ? SHIELD_TONE.red.pill : SHIELD_TONE.yellow.pill)}>
                    <ShieldAlert className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <p dir={dir} className="text-left text-[15px] font-bold text-foreground">
                        {rows.length ? t("shield.home.callTitle", { count: rows.length }) : t("shield.home.callNoneTitle")}
                    </p>
                    <p dir={dir} className="text-left text-xs text-muted">
                        {!rows.length ? t("shield.home.callNoneSub") : red ? t("shield.home.callSub", { red }) : t("shield.home.callSubNoRed")}
                    </p>
                </div>
            </header>
            {rows.length > 0 && (
                <ul className="grid gap-1">
                    {rows.slice(0, SHOWN).map((r) => {
                        const tone = SHIELD_TONE[riskyOrderBand(r)];
                        const age = ageOf(r.created_at, asOf);
                        return (
                            <li key={r.id}>
                                <Link
                                    href={`/orders?order=${r.id}`}
                                    className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--background)]"
                                >
                                    <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full border-2", tone.ring)} />
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{r.customer_name || "—"}</span>
                                    {r.worst_kind && (
                                        <span className={cn("hidden shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold sm:inline", tone.pill)}>
                                            {t(`shield.kind.${r.worst_kind}`)}
                                            {r.worst_src && <span className="font-medium opacity-90"> · {t(`shield.src.${r.worst_src}`)}</span>}
                                        </span>
                                    )}
                                    <span className={cn("w-7 shrink-0 text-right font-mono text-xs font-bold tabular-nums", tone.text)}>{r.trust}</span>
                                    <span className="shrink-0 text-right font-mono text-xs text-muted tabular-nums">#{r.order_id}</span>
                                    <span className="w-11 shrink-0 whitespace-nowrap text-right text-xs text-muted tabular-nums">{t(age.key, { n: age.n })}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
            {rows.length > SHOWN && (
                <p dir={dir} className="text-left text-xs text-muted">
                    {t("shield.home.callMore", { count: rows.length - SHOWN })}
                </p>
            )}
        </section>
    );
}

function ShieldImpactCard({ impact, score, days }: { impact: ShieldImpact; score: StoreScore; days: number }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const refusedRate = shippedRefusedRate(impact);
    const ownRate = ownDeliveryRate(score);

    return (
        <section data-shield-impact className={CARD}>
            <span dir={dir} className="text-left text-xs text-muted">
                {t("shield.home.impactTitle", { days })}
            </span>
            {impact.flagged_decided === 0 ? (
                <p dir={dir} className="text-left text-sm text-muted">
                    {t("shield.home.impactNone")}
                </p>
            ) : (
                <>
                    <div className="flex items-baseline gap-3">
                        <span className="text-[40px] font-bold leading-none tracking-tight text-foreground tabular-nums">{impact.stopped}</span>
                        <span dir={dir} className="text-left text-sm text-muted">
                            {t("shield.home.stopped")}
                        </span>
                    </div>
                    {impact.stopped_value > 0 && (
                        <p dir={dir} className="text-left text-sm text-foreground">
                            {t("shield.home.stoppedValue")} <FinancialValue amount={impact.stopped_value} hideToggle className="font-semibold" />
                        </p>
                    )}
                    <p dir={dir} className="text-left text-xs text-muted">
                        {t("shield.home.shipped", { shipped: impact.shipped, delivered: impact.shipped_delivered, refused: impact.shipped_refused })}
                        {refusedRate !== null && <> · <span className={cn("font-semibold", refusedRate >= 30 && SHIELD_TONE.red.text)}>{t("shield.home.refusedRate", { rate: refusedRate })}</span></>}
                    </p>
                </>
            )}
            {ownRate !== null && (
                <p dir={dir} className="border-t border-[var(--card-border)] pt-3 text-left text-xs text-muted">
                    <span className="font-semibold text-foreground">{t("shield.home.ownRate", { rate: ownRate })}</span>
                    {" · "}
                    {score.network_rate !== null
                        ? t("shield.home.networkRate", { rate: score.network_rate, stores: score.network_stores ?? 0 })
                        : t("shield.home.networkRateSoon")}
                </p>
            )}
        </section>
    );
}
