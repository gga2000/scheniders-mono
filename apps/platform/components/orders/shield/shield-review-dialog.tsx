"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@scheniders/ui/dialog";
import { formatIraqiPhoneDisplay } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { ChanceStep, DeliveryChance, OwnHistory, ShieldBand } from "@/lib/shield/delivery-chance";
import type { ShieldNetwork } from "@/lib/shield/types";
import { ShieldNetworkRecord } from "./shield-network-record";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerName: string;
    phone: string;
    orderId?: string;
    orderedAt?: string;
    result: DeliveryChance;
    network: ShieldNetwork | null;
    networkFailed: boolean;
    own: OwnHistory | null;
}

/** Where the bands sit on the chance scale (risk 60 / 35 → chance 40 / 65). */
const ZONES: { band: ShieldBand; from: number; to: number }[] = [
    { band: "red", from: 0, to: 40 },
    { band: "yellow", from: 40, to: 65 },
    { band: "green", from: 65, to: 100 },
];

const INK: Record<ShieldBand, { text: string; bar: string; zone: string; wash: string; dot: string }> = {
    red: { text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-500", zone: "bg-rose-500/20", wash: "from-rose-500/[0.07]", dot: "bg-rose-500" },
    yellow: { text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500", zone: "bg-amber-500/20", wash: "from-amber-500/[0.08]", dot: "bg-amber-500" },
    green: { text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", zone: "bg-emerald-500/20", wash: "from-emerald-500/[0.07]", dot: "bg-emerald-500" },
};

const KICKER = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

function orderedAtLabel(iso: string, language: string): string {
    return new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : "en-GB", {
        timeZone: "Asia/Baghdad",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        numberingSystem: "latn",
    }).format(new Date(iso));
}

/**
 * The Shield review, laid out as a report: the verdict and the chance on one
 * scale, the path from a typical order to this one (one row per signal, with
 * how far it moved the chance), this store's own record next to what other
 * stores saw, and the privacy line. Opens from the ring or the warning.
 */
export function ShieldReviewDialog({ open, onOpenChange, customerName, phone, orderId, orderedAt, result, network, networkFailed, own }: Props) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const ink = INK[result.band];
    const hasNetwork = network !== null && network.band !== "none";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-[720px]" onClick={(e) => e.stopPropagation()} onOpenAutoFocus={(e) => e.preventDefault()}>
                {/* Edge to edge: the dialog's inner area pads 1rem top/bottom and 1-1.5rem at the sides. */}
                <div className="-mx-4 -my-4 md:-mx-6">
                    <header className={cn("bg-gradient-to-b to-transparent px-8 pb-7 pt-7", ink.wash)}>
                        <p className={cn(KICKER, "flex flex-wrap items-center gap-x-2")}>
                            <span dir={dir}>{t("shield.report.kicker")}</span>
                            {orderId && <span className="font-mono normal-case tracking-normal">#{orderId}</span>}
                            {orderedAt && <span className="normal-case tracking-normal">{orderedAtLabel(orderedAt, language)}</span>}
                        </p>

                        <div className="mt-5 grid grid-cols-[auto_1fr] items-end gap-x-8">
                            <div>
                                <div className={cn("font-headline text-[64px] font-black leading-[0.85] tracking-tight tabular-nums", ink.text)} dir="ltr">
                                    {result.chance}
                                    <span className="ml-0.5 align-top text-[28px] font-bold">%</span>
                                </div>
                                <p dir={dir} className="mt-2 text-left text-xs font-medium text-muted-foreground">
                                    {t("shield.report.chanceLabel")}
                                </p>
                            </div>
                            <div className="min-w-0 pb-1">
                                <DialogTitle dir={dir} className={cn("text-left text-xl font-extrabold leading-tight tracking-normal", ink.text)}>
                                    {t(`shield.band.${result.band}`)}
                                </DialogTitle>
                                <p dir={dir} className="mt-1 text-left text-sm leading-relaxed text-foreground">
                                    {t(`shield.report.action.${result.band}`)}
                                </p>
                                <DialogDescription className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                    <span dir="auto" className="font-semibold text-foreground">{customerName}</span>
                                    <span aria-hidden="true">·</span>
                                    <span dir="ltr" className="font-mono tabular-nums">{formatIraqiPhoneDisplay(phone)}</span>
                                </DialogDescription>
                            </div>
                        </div>

                        <ChanceScale chance={result.chance} base={result.base} />
                    </header>

                    <div className="grid gap-8 px-8 pb-8 pt-2">
                        <ChancePath result={result} />

                        <div className="grid grid-cols-2 gap-4">
                            <OwnPanel own={own} />
                            <NetworkPanel network={network} failed={networkFailed} />
                        </div>

                        {hasNetwork && (
                            <section className="grid gap-5 rounded-2xl border border-(--card-border) px-5 py-5">
                                <ShieldNetworkRecord network={network} failed={networkFailed} phone={phone} detail />
                            </section>
                        )}
                    </div>

                    <footer className="flex items-start gap-2.5 border-t border-(--card-border) bg-(--background)/60 px-8 py-4">
                        <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-none text-muted-foreground" />
                        <p dir={dir} className="text-left text-xs leading-relaxed text-muted-foreground">{t("shield.footer")}</p>
                    </footer>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** One line from 0 to 100 with the three bands, this order's mark and where a typical order sits. */
function ChanceScale({ chance, base }: { chance: number; base: number }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const reduce = useReducedMotion();
    return (
        <div className="mt-7" dir="ltr">
            <div className="relative h-9">
                <div className="absolute inset-x-0 top-3.5 flex h-2 gap-[3px]">
                    {ZONES.map((z) => (
                        <div key={z.band} className={cn("h-full rounded-full", INK[z.band].zone)} style={{ width: `${z.to - z.from}%` }} />
                    ))}
                </div>
                <div className="absolute top-2 h-5 w-px bg-foreground/25" style={{ left: `${base}%` }} title={t("shield.report.typicalAt", { chance: base })} />
                <motion.div
                    className="absolute top-0 -ml-[9px] flex flex-col items-center"
                    initial={reduce ? false : { left: `${base}%` }}
                    animate={{ left: `${chance}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.15 }}
                >
                    <span className="block h-[18px] w-[18px] rounded-full border-[3px] border-(--card-bg) bg-foreground shadow-[0_2px_6px_rgba(0,0,0,0.25)]" style={{ marginTop: 9 }} />
                </motion.div>
            </div>
            <div className="mt-1 flex text-[11px] font-medium text-muted-foreground">
                {ZONES.map((z) => (
                    <span key={z.band} dir={dir} className={cn("text-left", z.band === "green" && "text-right")} style={{ width: `${z.to - z.from}%` }}>
                        {t(`shield.band.${z.band}`)}
                    </span>
                ))}
            </div>
        </div>
    );
}

function stepDelta(s: ChanceStep): string {
    const d = s.to - s.from;
    if (d === 0) return "±0";
    return d > 0 ? `+${d}` : `−${-d}`;
}

/** The waterfall: a typical order, each signal's move, and where this order lands. */
function ChancePath({ result }: { result: DeliveryChance }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const reduce = useReducedMotion();
    const ink = INK[result.band];

    const row = (key: string, label: string, from: number, to: number, bar: string, value: string, strong = false, i = 0) => (
        <li key={key} className={cn("grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_3rem] items-center gap-4 py-2", strong && "border-t border-(--card-border) pt-3")}>
            <span dir={dir} className={cn("truncate text-left text-[13px]", strong ? "font-bold text-foreground" : "text-foreground/85")}>{label}</span>
            <span className="relative h-2.5 rounded-full bg-(--card-border)/50" dir="ltr">
                <motion.span
                    className={cn("absolute inset-y-0 rounded-full", bar)}
                    style={{ left: `${Math.min(from, to)}%` }}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${Math.max(Math.abs(to - from), 1.2)}%` }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.08 + i * 0.06 }}
                />
            </span>
            <span dir="ltr" className={cn("text-right font-mono text-[13px] tabular-nums", strong ? cn("font-bold", ink.text) : "text-muted-foreground")}>{value}</span>
        </li>
    );

    return (
        <section>
            <h3 dir={dir} className={cn(KICKER, "text-left")}>{t("shield.report.howTitle")}</h3>
            <ol className="mt-3">
                {row("base", t("shield.report.typical"), 0, result.base, "bg-foreground/20", `${result.base}%`)}
                {result.steps.map((s, i) =>
                    row(s.key, t(`shield.reason.${s.key}`), s.from, s.to, s.effect === "risk" ? "bg-rose-500" : "bg-emerald-500", stepDelta(s), false, i + 1),
                )}
                {row("result", t("shield.report.thisOrder"), 0, result.chance, ink.bar, `${result.chance}%`, true, result.steps.length + 1)}
            </ol>
        </section>
    );
}

function Stat({ value, label, dot }: { value: number; label: string; dot: string }) {
    const dir = useTextDir();
    // The dot leads the label in both languages, so the row stays left to right.
    return (
        <div>
            <div className="font-headline text-[26px] font-black leading-none tabular-nums text-foreground">{value}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span aria-hidden="true" className={cn("h-1.5 w-1.5 flex-none rounded-full", dot)} />
                <span dir={dir}>{label}</span>
            </div>
        </div>
    );
}

const PANEL = "flex flex-col gap-4 rounded-2xl border border-(--card-border) bg-(--background)/50 px-5 py-4";

function OwnPanel({ own }: { own: OwnHistory | null }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const any = own !== null && own.delivered + own.refused + own.noAnswer > 0;
    return (
        <section className={PANEL}>
            <h3 dir={dir} className={cn(KICKER, "text-left")}>{t("shield.report.yourStore")}</h3>
            {any ? (
                <div className="grid grid-cols-3 gap-3">
                    <Stat value={own.delivered} label={t("shield.report.delivered")} dot="bg-emerald-500" />
                    <Stat value={own.refused} label={t("shield.report.refused")} dot="bg-rose-500" />
                    <Stat value={own.noAnswer} label={t("shield.report.noAnswer")} dot="bg-amber-500" />
                </div>
            ) : (
                <div>
                    <p dir={dir} className="text-left text-sm font-semibold text-foreground">{t("shield.report.ownNoneTitle")}</p>
                    <p dir={dir} className="mt-1 text-left text-xs leading-relaxed text-muted-foreground">{t("shield.report.ownNone")}</p>
                </div>
            )}
        </section>
    );
}

function NetworkPanel({ network, failed }: { network: ShieldNetwork | null; failed: boolean }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const has = network !== null && network.band !== "none";
    const badTotal = has && network.bad ? Object.values(network.bad).reduce((sum, r) => sum + (r?.count ?? 0), 0) : 0;
    return (
        <section className={PANEL}>
            <h3 dir={dir} className={cn(KICKER, "text-left")}>{t("shield.report.otherStores")}</h3>
            {failed ? (
                <p dir={dir} className="text-left text-sm text-muted-foreground">{t("shield.loadFailed")}</p>
            ) : has ? (
                <div className="grid grid-cols-3 gap-3">
                    <Stat value={network.delivered ?? 0} label={t("shield.report.delivered")} dot="bg-emerald-500" />
                    <Stat value={badTotal} label={t("shield.report.badOutcomes")} dot="bg-rose-500" />
                    <Stat value={network.stores ?? 0} label={t("shield.report.stores")} dot="bg-foreground/40" />
                </div>
            ) : (
                <div>
                    <p dir={dir} className="text-left text-sm font-semibold text-foreground">{t("shield.report.networkNoneTitle")}</p>
                    <p dir={dir} className="mt-1 text-left text-xs leading-relaxed text-muted-foreground">{t("shield.report.networkNone")}</p>
                </div>
            )}
        </section>
    );
}
