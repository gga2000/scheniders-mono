"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@scheniders/ui/dialog";
import { formatIraqiPhoneDisplay } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { OrderCheck, ShieldBand, Trust } from "@/lib/shield/trust";
import type { ShieldNetwork, TrustStep } from "@/lib/shield/types";
import { ShieldNetworkRecord } from "./shield-network-record";
import { CHECK_TONE, SHIELD_TONE } from "./shield-tone";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerName: string;
    phone: string;
    orderId?: string;
    orderedAt?: string;
    trust: Trust;
    checks: OrderCheck[];
    network: ShieldNetwork | null;
    networkFailed: boolean;
}

/** Where the bands sit on the 0-100 Trust scale. */
const ZONES: { band: ShieldBand; from: number; to: number }[] = [
    { band: "red", from: 0, to: 50 },
    { band: "yellow", from: 50, to: 80 },
    { band: "green", from: 80, to: 100 },
];

const INK: Record<ShieldBand | "new", { text: string; bar: string; zone: string; wash: string; dot: string }> = {
    red: { text: "text-rose-700 dark:text-rose-300", bar: "bg-rose-500", zone: "bg-rose-500/20", wash: "from-rose-500/[0.07]", dot: "bg-rose-500" },
    yellow: { text: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500", zone: "bg-amber-500/20", wash: "from-amber-500/[0.08]", dot: "bg-amber-500" },
    green: { text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", zone: "bg-emerald-500/20", wash: "from-emerald-500/[0.07]", dot: "bg-emerald-500" },
    new: { text: "text-foreground", bar: "bg-foreground/30", zone: "bg-foreground/10", wash: "from-foreground/[0.03]", dot: "bg-foreground/40" },
};

const KICKER = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

/** Older orders fold into one row so the path stays readable. */
const PATH_ROWS = 10;

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
 * The Shield report: the customer's Trust score on one scale, the order's own
 * checks, the path from 100 to today's score (one row per finished order, here
 * or in another store, with the points it moved), this store's record next to
 * what other stores saw, and the privacy line. Opens from the ring or the warning.
 */
export function ShieldReviewDialog({ open, onOpenChange, customerName, phone, orderId, orderedAt, trust, checks, network, networkFailed }: Props) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const look = trust.isNew ? "new" : trust.band;
    const ink = INK[look];
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
                                    {trust.score}
                                    <span className="ml-1 text-[22px] font-bold text-muted-foreground">/100</span>
                                </div>
                                <p dir={dir} className="mt-2 flex items-center gap-1.5 text-left text-xs font-medium text-muted-foreground">
                                    {t("shield.trust.label")}
                                    {trust.isNew && (
                                        <span className="rounded-md border border-(--card-border) px-1.5 py-px text-[10px] font-semibold">{t("shield.trust.newLabel")}</span>
                                    )}
                                </p>
                            </div>
                            <div className="min-w-0 pb-1">
                                <DialogTitle dir={dir} className={cn("text-left text-xl font-extrabold leading-tight tracking-normal", ink.text)}>
                                    {trust.isNew ? t("shield.band.new") : t(`shield.band.${trust.band}`)}
                                </DialogTitle>
                                <p dir={dir} className="mt-1 text-left text-sm leading-relaxed text-foreground">
                                    {t(`shield.report.action.${look}`)}
                                </p>
                                <DialogDescription className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                    <span dir="auto" className="font-semibold text-foreground">{customerName}</span>
                                    <span aria-hidden="true">·</span>
                                    <span dir="ltr" className="font-mono tabular-nums">{formatIraqiPhoneDisplay(phone)}</span>
                                </DialogDescription>
                            </div>
                        </div>

                        <TrustScale score={trust.score} isNew={trust.isNew} />
                    </header>

                    <div className="grid gap-8 px-8 pb-8 pt-2">
                        {checks.length > 0 && <Checks checks={checks} />}

                        <ScorePath trust={trust} />

                        <div className="grid grid-cols-2 gap-4">
                            <OwnPanel steps={trust.steps} />
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

/** One line from 0 to 100 with the three bands; the mark slides down from 100, where every customer starts. */
function TrustScale({ score, isNew }: { score: number; isNew: boolean }) {
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
                <motion.div
                    className="absolute top-0 -ml-[9px] flex flex-col items-center"
                    initial={reduce ? false : { left: "100%" }}
                    animate={{ left: `${score}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.15 }}
                >
                    <span
                        className={cn("block h-[18px] w-[18px] rounded-full border-[3px] border-(--card-bg) shadow-[0_2px_6px_rgba(0,0,0,0.25)]", isNew ? "bg-foreground/40" : "bg-foreground")}
                        style={{ marginTop: 9 }}
                    />
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

function Checks({ checks }: { checks: OrderCheck[] }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    return (
        <section>
            <h3 dir={dir} className={cn(KICKER, "text-left")}>{t("shield.report.checksTitle")}</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
                {checks.map((c) => (
                    <li key={c} dir={dir} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-semibold", SHIELD_TONE[CHECK_TONE[c]].pill)}>
                        {t(`shield.check.${c}`)}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function signed(pts: number): string {
    if (pts === 0) return "±0";
    return pts > 0 ? `+${pts}` : `−${-pts}`;
}

interface PathRow {
    key: string;
    label: string;
    note?: string;
    from: number;
    to: number;
    pts: number;
}

/** Each counted order with the score before and after it, oldest first; the oldest fold into one row. */
function pathRows(steps: TrustStep[], t: (key: string, vars?: Record<string, number>) => string): PathRow[] {
    const rows: PathRow[] = [];
    let at = 100;
    const fold = Math.max(0, steps.length - PATH_ROWS);
    if (fold > 0) {
        const from = at;
        for (const s of steps.slice(0, fold)) at += s.pts;
        rows.push({ key: "earlier", label: t("shield.report.earlier", { n: fold }), from, to: at, pts: at - from });
    }
    steps.slice(fold).forEach((s, i) => {
        const from = at;
        at += s.pts;
        rows.push({
            key: `${fold + i}`,
            label: t(`shield.kind.${s.kind}`),
            note: s.kind === "pattern" ? undefined : t(`shield.src.${s.src}`),
            from,
            to: at,
            pts: s.pts,
        });
    });
    return rows;
}

/** The path: 100 at the start, each finished order's points, and where the customer stands now. */
function ScorePath({ trust }: { trust: Trust }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const reduce = useReducedMotion();
    const ink = INK[trust.isNew ? "new" : trust.band];
    const rows = pathRows(trust.steps, t);

    const line = (key: string, label: string, note: string | undefined, from: number, to: number, bar: string, value: string, opts: { strong?: boolean; muted?: boolean; i?: number } = {}) => (
        <li key={key} className={cn("grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_4.5rem] items-center gap-4 py-2", opts.strong && "border-t border-(--card-border) pt-3")}>
            <span dir={dir} className={cn("truncate text-left text-[13px]", opts.strong ? "font-bold text-foreground" : "text-foreground/85")}>
                {label}
                {note && <span className="text-muted-foreground"> · {note}</span>}
            </span>
            <span className="relative h-2.5 rounded-full bg-(--card-border)/50" dir="ltr">
                <motion.span
                    className={cn("absolute inset-y-0 rounded-full", bar)}
                    style={{ left: `${Math.min(from, to)}%` }}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${Math.max(Math.abs(to - from), 1.2)}%` }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.08 + (opts.i ?? 0) * 0.06 }}
                />
            </span>
            <span dir="ltr" className={cn("text-right font-mono text-[13px] tabular-nums", opts.strong ? cn("font-bold", ink.text) : opts.muted ? "text-muted-foreground/70" : "text-muted-foreground")}>{value}</span>
        </li>
    );

    return (
        <section>
            <h3 dir={dir} className={cn(KICKER, "text-left")}>{t("shield.report.howTitle")}</h3>
            <ol className="mt-3">
                {line("start", t("shield.report.start"), undefined, 0, 100, "bg-foreground/20", "100")}
                {rows.map((r, i) =>
                    line(
                        r.key,
                        r.label,
                        r.pts === 0 && r.key !== "earlier" ? t("shield.report.atTop") : r.note,
                        r.from,
                        r.to,
                        r.pts < 0 ? "bg-rose-500" : "bg-emerald-500",
                        signed(r.pts),
                        { muted: r.pts === 0, i: i + 1 },
                    ),
                )}
                {rows.length === 0 && (
                    <li dir={dir} className="py-2 text-left text-[13px] text-muted-foreground">{t("shield.report.newPath")}</li>
                )}
                {line("now", t("shield.report.now"), undefined, 0, trust.score, ink.bar, String(trust.score), { strong: true, i: rows.length + 1 })}
            </ol>
        </section>
    );
}

function Stat({ value, label, dot }: { value: string; label: string; dot: string }) {
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

function OwnPanel({ steps }: { steps: TrustStep[] }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const own = steps.filter((s) => s.src === "own");
    const delivered = own.filter((s) => s.kind === "delivered").length;
    const bad = own.length - delivered;
    const pts = own.reduce((sum, s) => sum + s.pts, 0);
    return (
        <section className={PANEL}>
            <h3 dir={dir} className={cn(KICKER, "text-left")}>{t("shield.report.yourStore")}</h3>
            {own.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                    <Stat value={String(delivered)} label={t("shield.report.delivered")} dot="bg-emerald-500" />
                    <Stat value={String(bad)} label={t("shield.report.bad")} dot="bg-rose-500" />
                    <Stat value={signed(pts)} label={t("shield.report.points")} dot="bg-foreground/40" />
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
                    <Stat value={String(network.delivered ?? 0)} label={t("shield.report.delivered")} dot="bg-emerald-500" />
                    <Stat value={String(badTotal)} label={t("shield.report.badOutcomes")} dot="bg-rose-500" />
                    <Stat value={String(network.stores ?? 0)} label={t("shield.report.stores")} dot="bg-foreground/40" />
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
