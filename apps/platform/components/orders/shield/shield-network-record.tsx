"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { SHIELD_BAD_CATEGORIES, type ShieldNetwork } from "@/lib/shield/types";
import { SEQ_TONE } from "./shield-tone";
import { ShieldReportForm } from "./shield-report-form";

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

/**
 * What other stores saw with this number: counts per outcome with "in N
 * stores", the last orders as dots, and the way to report a wrong record.
 * Used in the Shield review and on the customer profile.
 */
export function ShieldNetworkRecord({ network, failed, phone, detail = false }: {
    network: ShieldNetwork | null;
    failed: boolean;
    phone: string;
    /** In the Shield report the totals sit in their own panel: show only the reasons, the history and the report link. */
    detail?: boolean;
}) {
    const { t } = useLanguage();
    const hasNetwork = network !== null && network.band !== "none";
    const badRows = hasNetwork && network.bad
        ? SHIELD_BAD_CATEGORIES.flatMap((cat) => {
            const row = network.bad?.[cat];
            return row ? [{ cat, ...row }] : [];
        })
        : [];
    const maxBad = Math.max(1, ...badRows.map((r) => r.count));

    return (
        <>
            <section>
                <div className={LABEL}>{t("shield.section.network")}</div>
                {failed ? (
                    <p className="mt-2 text-sm text-muted-foreground">{t("shield.loadFailed")}</p>
                ) : !hasNetwork ? (
                    <p className="mt-2 text-sm text-muted-foreground">{t("shield.network.none")}</p>
                ) : (
                    <div className="mt-2 grid gap-3">
                        <p className="text-xs text-muted-foreground">
                            {t("shield.network.basis", { outcomes: network.outcomes ?? 0, stores: network.stores ?? 0 })}
                            {network.confidence && <> · {t(`shield.network.confidence.${network.confidence}`)}</>}
                        </p>
                        {!detail && (
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
                        )}
                        {badRows.length > 0 && (
                            <div className="grid gap-1.5">
                                {badRows.map((r) => (
                                    <div key={r.cat} className={cn("grid items-center gap-3 text-xs", detail ? "grid-cols-[10rem_1fr_5rem_1.5rem]" : "grid-cols-[10rem_1fr_1.5rem]")}>
                                        <span className="truncate">{t(`shield.cat.${r.cat}`)}</span>
                                        <div className="h-2 overflow-hidden rounded bg-(--card-border)">
                                            <div className="h-full rounded bg-rose-500" style={{ width: `${(r.count / maxBad) * 100}%` }} />
                                        </div>
                                        {detail && (
                                            <span className="whitespace-nowrap text-muted-foreground">
                                                {r.stores === 1 ? t("shield.network.inOneStore") : t("shield.network.inStores", { stores: r.stores })}
                                            </span>
                                        )}
                                        <span className="text-right font-mono tabular-nums">{r.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <ShieldReportForm phone={phone} />
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
        </>
    );
}
