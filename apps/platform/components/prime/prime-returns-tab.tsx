"use client";

import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeRepeatReturners } from "@/hooks/use-prime-repeat-returners";
import { usePrimeReturns } from "@/hooks/use-prime-returns";
import { getGovernorateByCode } from "@/lib/address-validator";
import { cn } from "@/lib/utils";

const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (n: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n)}%`;

/** The bars' colours, strongest reason first. */
const BAR_TONES = ["bg-[#B42318]", "bg-[#C2410C]", "bg-[#C2410C]", "bg-[#B45309]", "bg-[#8A6A3A]"] as const;

const panel = "flex min-w-0 flex-col gap-4 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-[22px]";

/** A share that comes back: high is red, low is green. */
function rateTone(rate: number) {
    if (rate >= 20) return "font-bold text-[#8F1D13] dark:text-rose-300";
    if (rate >= 15) return "font-bold text-[#8A4B00] dark:text-amber-300";
    if (rate <= 7) return "font-semibold text-[#165C39] dark:text-emerald-300";
    return "font-semibold text-foreground";
}

/**
 * «لماذا يُرجع الزبائن»: the share of Prime parcels that come back over the
 * last 30 days, the parcels a resend saved, the reasons the store's team
 * recorded (Prime's own words for parcels the team has not filed yet), and
 * the governorates where most come back.
 */
export function PrimeReturnsTab() {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const { summary, isPending, isError } = usePrimeReturns(true);
    const repeat = usePrimeRepeatReturners(true);

    if (isPending) return <div className="h-64 animate-pulse rounded-[22px] bg-[var(--card-bg)]" aria-busy="true" />;
    if (isError || !summary) return <p className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-sm text-muted">{t("prime.page.loadFailed")}</p>;
    if (summary.finished === 0) {
        return (
            <p dir={dir} className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-8 text-center text-sm text-muted">
                {t("prime.returns.empty")}
            </p>
        );
    }

    const delta = summary.rate !== null && summary.previousRate !== null ? Math.round((summary.rate - summary.previousRate) * 10) / 10 : null;
    const showDays = summary.areas.some((a) => a.days !== null);
    const top = Math.max(1, ...summary.reasons.map((r) => r.parcels));
    const areaName = (code: string | null) => {
        const g = code ? getGovernorateByCode(code) : undefined;
        if (!g) return code ?? t("prime.returns.unknownArea");
        return language === "ar" ? g.nameAr : g.nameEn;
    };

    return (
        <div className="flex flex-col gap-[18px]">
            <p dir={dir} className="text-left text-sm text-muted">
                <b className="text-base font-bold text-foreground">{t("prime.returns.title")}</b> · {t("prime.returns.window")}
            </p>

            <div data-prime-scorecard className="grid grid-cols-4 gap-3">
                <div className={cn(panel, "gap-1")}>
                    <span dir={dir} className="text-left text-xs text-muted">
                        {t("prime.returns.deliveredRate")}
                    </span>
                    <b className="text-[30px] leading-tight tabular-nums text-foreground">{summary.rate === null ? "—" : pct(Math.round((100 - summary.rate) * 10) / 10)}</b>
                    {summary.previousRate !== null && (
                        <span dir={dir} className="text-left text-xs text-muted">
                            {t("prime.returns.rateBefore", { n: pct(Math.round((100 - summary.previousRate) * 10) / 10) })}
                        </span>
                    )}
                </div>
                <div className={cn(panel, "gap-1")}>
                    <span dir={dir} className="text-left text-xs text-muted">
                        {t("prime.returns.hours")}
                    </span>
                    <b className="text-[30px] leading-tight tabular-nums text-foreground">{summary.hoursToDeliver === null ? "—" : count.format(Math.round(summary.hoursToDeliver))}</b>
                    <span dir={dir} className="text-left text-xs text-muted">
                        {summary.hoursToDeliver !== null && summary.previousHoursToDeliver !== null
                            ? t("prime.returns.hoursBefore", { n: count.format(Math.round(summary.previousHoursToDeliver)) })
                            : t("prime.returns.hoursHint")}
                    </span>
                </div>
                <div className={cn(panel, "gap-1")}>
                    <span dir={dir} className="text-left text-xs text-muted">
                        {t("prime.returns.rate")}
                    </span>
                    <b className="text-[30px] leading-tight tabular-nums text-foreground">{summary.rate === null ? "—" : pct(summary.rate)}</b>
                    {summary.previousRate !== null && delta !== null && (
                        <span
                            dir={dir}
                            className={cn(
                                "inline-flex items-center gap-1 self-start text-xs",
                                delta < 0 ? "text-[#165C39] dark:text-emerald-300" : delta > 0 ? "text-[#8F1D13] dark:text-rose-300" : "text-muted",
                            )}
                        >
                            {delta < 0 && <TrendingDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                            {delta > 0 && <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                            {t("prime.returns.rateBefore", { n: pct(summary.previousRate) })}
                        </span>
                    )}
                    <span dir={dir} className="text-left text-xs text-muted">
                        {t("prime.returns.returned")}: {count.format(summary.returned)} · {t("prime.returns.ofFinished", { count: count.format(summary.finished) })}
                    </span>
                </div>
                <div className={cn(panel, "gap-1")}>
                    <span dir={dir} className="text-left text-xs text-muted">
                        {t("prime.returns.saved")}
                    </span>
                    <b className="text-[30px] leading-tight tabular-nums text-[#165C39] dark:text-emerald-300">{count.format(summary.savedByResend)}</b>
                    <span dir={dir} className="text-left text-xs text-muted">
                        {t("prime.returns.savedHint")}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-[18px]">
                <section className={panel} aria-labelledby="prime-returns-reasons">
                    <h2 id="prime-returns-reasons" dir={dir} className="text-left text-lg font-bold text-foreground">
                        {t("prime.returns.reasons")}
                    </h2>
                    <ul className="flex flex-col gap-3.5">
                        {summary.reasons.map((r, i) => (
                            <li key={r.reason ?? "none"} className="grid grid-cols-[190px_minmax(0,1fr)_56px] items-center gap-3 text-sm">
                                <span dir="auto" className={cn("truncate text-left", r.reason === null ? "text-muted" : "text-foreground")}>
                                    {r.reason ?? t("prime.returns.noReason")}
                                </span>
                                <span className="h-3 overflow-hidden rounded-full bg-[#F1EFEA] dark:bg-white/10" aria-hidden="true">
                                    <span
                                        className={cn("block h-full rounded-full", r.reason === null ? "bg-[#C9C4BC] dark:bg-white/25" : BAR_TONES[Math.min(i, BAR_TONES.length - 1)])}
                                        style={{ width: `${(r.parcels / top) * 100}%` }}
                                    />
                                </span>
                                <span className="text-right tabular-nums text-foreground">{count.format(r.parcels)}</span>
                            </li>
                        ))}
                    </ul>
                    <p dir={dir} className="rounded-[14px] bg-[#F5F3EF] px-4 py-3 text-left text-[13px] leading-relaxed text-muted dark:bg-white/5">
                        {t("prime.returns.reasonsNote")}
                    </p>
                </section>

                <section className={panel} aria-labelledby="prime-returns-areas">
                    <h2 id="prime-returns-areas" dir={dir} className="text-left text-lg font-bold text-foreground">
                        {t("prime.returns.areas")}
                    </h2>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted">
                                <th className="pb-2 font-medium">{t("prime.returns.colArea")}</th>
                                <th className="pb-2 font-medium">{t("prime.returns.colParcels")}</th>
                                <th className="pb-2 font-medium">{t("prime.returns.colReturned")}</th>
                                {showDays && <th className="pb-2 font-medium">{t("prime.returns.colDays")}</th>}
                                <th className="pb-2 text-right font-medium">{t("prime.returns.colRate")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.areas.map((a) => (
                                <tr key={a.governorate ?? "none"} className="h-11 border-t border-[#EFECE6] dark:border-white/10">
                                    <td className="text-foreground">{areaName(a.governorate)}</td>
                                    <td className="tabular-nums">{count.format(a.parcels)}</td>
                                    <td className="tabular-nums">{count.format(a.returned)}</td>
                                    {showDays && <td className="tabular-nums text-muted">{a.days === null ? "—" : a.days}</td>}
                                    <td className={cn("text-right tabular-nums", rateTone(a.rate))}>{pct(a.rate)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p dir={dir} className="text-left text-xs leading-relaxed text-muted">
                        {t("prime.returns.areasNote")}
                    </p>
                </section>
            </div>

            {repeat.returners.length > 0 && (
                <section data-prime-repeat className={panel} aria-labelledby="prime-returns-repeat">
                    <h2 id="prime-returns-repeat" dir={dir} className="text-left text-lg font-bold text-foreground">
                        {t("prime.returns.repeat")}
                    </h2>
                    <ul className="flex flex-col">
                        {repeat.returners.map((r) => (
                            <li key={r.phone} className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-t border-[#EFECE6] text-sm first:border-t-0 dark:border-white/10">
                                <span dir="auto" className="truncate text-left text-foreground">
                                    <b className="font-semibold">{r.name ?? r.phone}</b>
                                    {r.name && <span className="text-muted"> · {r.phone}</span>}
                                </span>
                                <span className="tabular-nums text-[#8F1D13] dark:text-rose-300">{t("prime.returns.repeatCount", { count: r.returned })}</span>
                                <Link href={`/customers/${encodeURIComponent(r.phone)}`} className="inline-flex h-8 items-center rounded-full border border-[var(--card-border)] px-3 text-xs font-semibold text-foreground hover:bg-black/[0.04] dark:hover:bg-white/10">
                                    {t("prime.returns.repeatShield")}
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <p dir={dir} className="text-left text-xs leading-relaxed text-muted">
                        {t("prime.returns.repeatNote")}
                    </p>
                </section>
            )}
        </div>
    );
}
