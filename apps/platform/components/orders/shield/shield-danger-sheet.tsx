"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { ShieldAlert, X } from "lucide-react";
import { z } from "zod";
import { Dialog, DialogClose, DialogTitle, SheetContent } from "@scheniders/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import { riskyOpenOrderSchema, riskyOrderBand, type RiskyOpenOrder } from "@/lib/shield/home";
import { cn } from "@/lib/utils";
import { SHIELD_TONE } from "./shield-tone";

/** The database caps shield_risky_open_orders at 100 rows. */
const QUEUE_LIMIT = 100;

/**
 * Tools-bar button on the orders page (Ali, 2026-11-05): opens a side panel
 * with the open orders whose customer's Trust score is under 80, most
 * dangerous first, so staff call them before confirming. The badge counts
 * them; it turns red when any is under 50.
 */
export function ShieldDangerButton() {
    const { t } = useLanguage();
    const { session, clientReady, tenantId } = useAuth();
    const [open, setOpen] = useState(false);

    const queue = useQuery({
        queryKey: ["shield", "queue", tenantId],
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 60_000,
        refetchInterval: 5 * 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("shield_risky_open_orders", { p_limit: QUEUE_LIMIT });
            if (error) throw error;
            return z.array(riskyOpenOrderSchema).parse(data ?? []);
        },
    });

    const rows = queue.data ?? [];
    const red = rows.filter((r) => riskyOrderBand(r) === "red").length;
    const label = t("shield.queue.button");

    return (
        <>
            <button
                type="button"
                data-shield-queue-button
                onClick={() => setOpen(true)}
                className={cn(
                    "relative p-2.5 rounded-xl transition-all duration-300",
                    open
                        ? "bg-rose-100 text-rose-700 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5",
                )}
                title={label}
                aria-label={rows.length ? `${label} (${rows.length})` : label}
            >
                <ShieldAlert className="w-4 h-4" />
                {rows.length > 0 && (
                    <span
                        aria-hidden="true"
                        className={cn(
                            "absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold tabular-nums text-white",
                            red ? "bg-rose-600" : "bg-amber-500",
                        )}
                    >
                        {rows.length >= QUEUE_LIMIT ? "99+" : rows.length}
                    </span>
                )}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <AnimatePresence>
                    {open && (
                        <SheetContent key="shield-queue" aria-describedby={undefined}>
                            <DangerQueue
                                rows={rows}
                                asOf={queue.dataUpdatedAt}
                                loading={queue.isPending}
                                failed={queue.isError}
                                onRetry={() => void queue.refetch()}
                                onPick={() => setOpen(false)}
                            />
                        </SheetContent>
                    )}
                </AnimatePresence>
            </Dialog>
        </>
    );
}

function ageOf(createdAt: string, now: number): { key: string; n: number } {
    const hours = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 3_600_000));
    return hours < 24 ? { key: "shield.home.ageHours", n: hours } : { key: "shield.home.ageDays", n: Math.floor(hours / 24) };
}

interface QueueProps {
    rows: RiskyOpenOrder[];
    asOf: number;
    loading: boolean;
    failed: boolean;
    onRetry: () => void;
    onPick: () => void;
}

/** The panel body: a header with the red/yellow split, then each band's orders, lowest score first. */
export function DangerQueue({ rows, asOf, loading, failed, onRetry, onPick }: QueueProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const red = rows.filter((r) => riskyOrderBand(r) === "red");
    const yellow = rows.filter((r) => riskyOrderBand(r) === "yellow");

    return (
        <>
            <div className="flex items-center gap-3.5 px-5 py-4 border-b border-(--card-border) shrink-0">
                <span
                    aria-hidden="true"
                    className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", red.length ? SHIELD_TONE.red.pill : rows.length ? SHIELD_TONE.yellow.pill : SHIELD_TONE.green.pill)}
                >
                    <ShieldAlert className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <DialogTitle dir={dir} className="text-xl font-extrabold tracking-tight leading-tight text-left">
                        {t("shield.queue.title")}
                    </DialogTitle>
                    <p dir={dir} className="mt-1 text-left text-[13px] text-muted-foreground">
                        {t("shield.queue.sub")}
                    </p>
                </div>
                <DialogClose asChild>
                    <button className="w-10 h-10 rounded-xl border border-(--card-border) flex items-center justify-center text-muted-foreground hover:bg-muted/40 shrink-0" aria-label={t("common.close")}>
                        <X className="w-4 h-4" />
                    </button>
                </DialogClose>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {failed ? (
                    <div className="rounded-2xl border border-(--card-border) p-5 text-center">
                        <p className="text-sm text-muted-foreground">{t("shield.queue.failed")}</p>
                        <button type="button" onClick={onRetry} className="mt-3 h-9 rounded-xl border border-(--card-border) px-4 text-sm font-semibold hover:bg-muted/40">
                            {t("shield.queue.retry")}
                        </button>
                    </div>
                ) : loading ? (
                    <div className="space-y-2" aria-hidden="true">
                        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-(--card-border)/50" />)}
                    </div>
                ) : !rows.length ? (
                    <div className="rounded-2xl border border-(--card-border) p-6 text-center">
                        <span className={cn("mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl", SHIELD_TONE.green.pill)}>
                            <ShieldAlert className="h-5 w-5" />
                        </span>
                        <p dir={dir} className="text-sm font-bold text-foreground">{t("shield.home.callNoneTitle")}</p>
                        <p dir={dir} className="mt-1 text-xs text-muted-foreground">{t("shield.home.callNoneSub")}</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            <Count band="red" n={red.length} label={t("shield.band.red")} />
                            <Count band="yellow" n={yellow.length} label={t("shield.band.yellow")} />
                        </div>
                        {red.length > 0 && <Band band="red" title={t("shield.queue.redTitle")} rows={red} asOf={asOf} onPick={onPick} />}
                        {yellow.length > 0 && <Band band="yellow" title={t("shield.queue.yellowTitle")} rows={yellow} asOf={asOf} onPick={onPick} />}
                        <p dir={dir} className="text-left text-xs text-muted-foreground">{t("shield.queue.foot")}</p>
                    </>
                )}
            </div>
        </>
    );
}

function Count({ band, n, label }: { band: "red" | "yellow"; n: number; label: string }) {
    return (
        <div className={cn("flex items-baseline justify-between gap-2 rounded-2xl px-4 py-3", SHIELD_TONE[band].pill)}>
            <span className="text-[13px] font-bold">{label}</span>
            <span className="font-mono text-2xl font-bold leading-none tabular-nums">{n}</span>
        </div>
    );
}

function Band({ band, title, rows, asOf, onPick }: { band: "red" | "yellow"; title: string; rows: RiskyOpenOrder[]; asOf: number; onPick: () => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const tone = SHIELD_TONE[band];
    return (
        <section data-shield-queue-band={band}>
            <h3 dir={dir} className={cn("mb-2 text-left text-[11px] font-bold uppercase tracking-widest", tone.text)}>
                {title} · {rows.length}
            </h3>
            <ul className="grid gap-1.5">
                {rows.map((r) => {
                    const age = ageOf(r.created_at, asOf);
                    return (
                        <li key={r.id}>
                            <Link
                                href={`/orders?order=${r.id}`}
                                onClick={onPick}
                                className="flex items-center gap-3 rounded-2xl border border-(--card-border) bg-(--card-bg) px-3 py-2.5 transition-colors hover:bg-(--background)"
                            >
                                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border-[2.5px] font-mono text-[11px] font-bold tabular-nums", tone.ring)}>
                                    {r.trust}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span dir="auto" className="block truncate text-left text-sm font-semibold text-foreground">{r.customer_name || "—"}</span>
                                    {r.worst_kind && (
                                        <span dir={dir} className={cn("block truncate text-left text-xs font-medium", tone.text)}>
                                            {t(`shield.kind.${r.worst_kind}`)}
                                            {r.worst_src && <span className="opacity-80"> · {t(`shield.src.${r.worst_src}`)}</span>}
                                        </span>
                                    )}
                                </span>
                                <span className="shrink-0 text-right">
                                    <span className="block font-mono text-xs text-muted-foreground tabular-nums">#{r.order_id}</span>
                                    <span className="block text-xs text-muted-foreground tabular-nums">
                                        {t(`shield.queue.status.${r.status}`)} · {t(age.key, { n: age.n })}
                                    </span>
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
