"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { formatIraqiPhoneDisplay } from "@scheniders/shared";
import type { DeliveryChance, OwnHistory } from "@/lib/shield/delivery-chance";
import { SHIELD_BAD_CATEGORIES, type ShieldNetwork } from "@/lib/shield/types";
import { SEQ_TONE, SHIELD_TONE } from "./shield-tone";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerName: string;
    phone: string;
    result: DeliveryChance;
    network: ShieldNetwork | null;
    networkFailed: boolean;
    own: OwnHistory | null;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

/** The Shield review: why this order's ring reads what it reads. */
export function ShieldReviewDialog({ open, onOpenChange, customerName, phone, result, network, networkFailed, own }: Props) {
    const { t } = useLanguage();
    const tone = SHIELD_TONE[result.band];
    const hasNetwork = network !== null && network.band !== "none";
    const badRows = hasNetwork && network.bad
        ? SHIELD_BAD_CATEGORIES.flatMap((cat) => {
            const row = network.bad?.[cat];
            return row ? [{ cat, ...row }] : [];
        })
        : [];
    const maxBad = Math.max(1, ...badRows.map((r) => r.count));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl p-0 gap-0" onClick={(e) => e.stopPropagation()}>
                <DialogHeader className="flex-row items-center gap-4 border-b border-(--card-border) px-6 py-5 text-left space-y-0">
                    <div className={cn("grid h-16 w-16 flex-none place-items-center rounded-full border-4 font-mono text-xl font-bold tabular-nums", tone.ring)}>
                        {result.risk}
                    </div>
                    <div className="min-w-0">
                        <DialogTitle className={cn("text-lg", tone.text)}>{t(`shield.band.${result.band}`)}</DialogTitle>
                        <DialogDescription className="text-xs">
                            {t("shield.reviewSubtitle", { name: customerName, phone: formatIraqiPhoneDisplay(phone) })}
                            {" · "}
                            <span className="font-semibold text-foreground">{t("shield.chance", { chance: result.chance })}</span>
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="grid gap-5 px-6 py-5 max-h-[70vh] overflow-y-auto">
                    <section>
                        <div className={LABEL}>{t("shield.section.network")}</div>
                        {networkFailed ? (
                            <p className="mt-2 text-sm text-muted-foreground">{t("shield.loadFailed")}</p>
                        ) : !hasNetwork ? (
                            <p className="mt-2 text-sm text-muted-foreground">{t("shield.network.none")}</p>
                        ) : (
                            <div className="mt-2 grid gap-3">
                                <p className="text-xs text-muted-foreground">
                                    {t("shield.network.basis", { outcomes: network.outcomes ?? 0, stores: network.stores ?? 0 })}
                                    {network.confidence && <> · {t(`shield.network.confidence.${network.confidence}`)}</>}
                                </p>
                                <ul className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-3 gap-y-1.5 text-sm">
                                    {badRows.map((r) => (
                                        <li key={r.cat} className="contents">
                                            <b className="text-right font-mono text-lg tabular-nums">{r.count}</b>
                                            <span>{t(`shield.cat.${r.cat}`)}</span>
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                {r.stores === 1 ? t("shield.network.inOneStore") : t("shield.network.inStores", { stores: r.stores })}
                                            </span>
                                        </li>
                                    ))}
                                    <li className="contents">
                                        <b className="text-right font-mono text-lg tabular-nums">{network.delivered ?? 0}</b>
                                        <span>{t("shield.network.delivered")}</span>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {(network.delivered_stores ?? 0) === 1 ? t("shield.network.inOneStore") : t("shield.network.inStores", { stores: network.delivered_stores ?? 0 })}
                                        </span>
                                    </li>
                                </ul>
                                {badRows.length > 0 && (
                                    <div className="grid gap-1.5">
                                        {badRows.map((r) => (
                                            <div key={r.cat} className="grid grid-cols-[10rem_1fr_1.5rem] items-center gap-3 text-xs">
                                                <span className="truncate">{t(`shield.cat.${r.cat}`)}</span>
                                                <div className="h-2 overflow-hidden rounded bg-(--card-border)">
                                                    <div className="h-full rounded bg-rose-500" style={{ width: `${(r.count / maxBad) * 100}%` }} />
                                                </div>
                                                <span className="text-right font-mono tabular-nums">{r.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    {hasNetwork && network.sequence && network.sequence.length > 0 && (
                        <section>
                            <div className={LABEL}>{t("shield.section.history")}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {network.sequence.map((s, i) => (
                                    <span key={i} title={t(`shield.seq.${s}`)} className={cn("grid h-6 w-6 place-items-center rounded-full font-mono text-[11px] font-bold", SEQ_TONE[s])}>
                                        {s}
                                    </span>
                                ))}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {network.trend && t(`shield.trend.${network.trend}`)}
                                {network.last_bad_orders_ago !== null && (
                                    <> · {network.last_bad_orders_ago === 0 ? t("shield.network.lastBadNow") : t("shield.network.lastBad", { n: network.last_bad_orders_ago })}</>
                                )}
                            </p>
                        </section>
                    )}

                    <section>
                        <div className={LABEL}>{t("shield.section.whyOrder")}</div>
                        <ul className="mt-2 grid gap-1 text-sm">
                            {result.reasons.map((r) => (
                                <li key={r.key} className="flex items-center gap-2">
                                    <span className={cn("h-2 w-2 flex-none rounded-full", r.effect === "risk" ? "bg-rose-500" : "bg-emerald-500")} />
                                    {t(`shield.reason.${r.key}`)}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="rounded-lg bg-(--background) px-4 py-3 text-sm">
                        <span className="font-semibold">{t("shield.section.own")}</span>
                        {" · "}
                        {own && own.delivered + own.refused + own.noAnswer > 0
                            ? t("shield.own.summary", { delivered: own.delivered, refused: own.refused, noAnswer: own.noAnswer })
                            : t("shield.own.none")}
                    </section>
                </div>

                <p className="border-t border-(--card-border) px-6 py-3 text-xs text-muted-foreground">{t("shield.footer")}</p>
            </DialogContent>
        </Dialog>
    );
}
