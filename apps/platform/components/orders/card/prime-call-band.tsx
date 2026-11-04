"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, X } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { PRIME_CALL_ORDER_STATUSES, usePrimeCallCheck } from "@/hooks/use-prime-call-check";
import type { PrimeCallParcel, PrimeCallRecord } from "@/lib/prime/call-record";
import type { PrimeDeskRow } from "@/lib/prime/desk-preview";
import { primeWhen } from "@/lib/prime/when";
import { computeCodAmount } from "@/lib/order-money";
import { cn } from "@/lib/utils";
import type { OrderCardModel } from "./use-order-card-model";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const TILE: Record<PrimeCallParcel["kind"], string> = {
    delivered: "bg-[#E3F2E9] text-[#165C39] dark:bg-emerald-400/15 dark:text-emerald-200",
    returned: "bg-[#FBEAE8] text-[#8F1D13] dark:bg-rose-500/15 dark:text-rose-200",
    moving: "bg-[#E8EEF8] text-[#1F3F75] dark:bg-sky-400/15 dark:text-sky-200",
};

type Tone = "new" | "moving" | "good" | "mixed";

function toneOf(record: PrimeCallRecord): Tone {
    if (record.parcels === 0) return "new";
    if (record.delivered + record.returned === 0) return "moving";
    return record.returned === 0 ? "good" : "mixed";
}

const CHIP: Record<Tone, string> = {
    new: "bg-[#F1EFEA] text-[#4A4A4A] dark:bg-white/10 dark:text-white/70",
    moving: "bg-[#E8EEF8] text-[#1F3F75] dark:bg-sky-400/15 dark:text-sky-200",
    good: "bg-[#E3F2E9] text-[#165C39] dark:bg-emerald-400/15 dark:text-emerald-200",
    mixed: "bg-[#FBEAE8] text-[#8F1D13] dark:bg-rose-500/15 dark:text-rose-200",
};

/**
 * The confirmation call's Prime line under a card still waiting on its call
 * (desktop): the customer's earlier Prime parcels from this store and how each
 * ended, a warning when the newest came back, and what Prime would charge for
 * this one (or what to fix before Prime takes it). Opens in place for the
 * parcels by month and the money if it is confirmed. Hidden for a tenant
 * without a switched-on Prime link.
 */
export function PrimeCallBand({ m }: { m: OrderCardModel }) {
    // Only cards still on their call subscribe to the Prime queries.
    if (!PRIME_CALL_ORDER_STATUSES.has(m.order.status)) return null;
    return <PrimeCallBandFor m={m} />;
}

function PrimeCallBandFor({ m }: { m: OrderCardModel }) {
    const { order } = m;
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const { connected } = usePrimeConnection();
    const check = usePrimeCallCheck(order, connected);
    const [open, setOpen] = useState(false);
    if (!connected || !check.data) return null;

    const { record, send } = check.data;
    const tone = toneOf(record);
    const finished = record.delivered + record.returned;
    const warn = record.returnedInARow > 0;
    const collect = computeCodAmount(order);
    const month = new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : "en-US", { month: "long", timeZone: "Asia/Baghdad" });

    return (
        <div
            data-prime-call={tone}
            onClick={(e) => e.stopPropagation()}
            className={cn(
                "hidden border-t border-dashed border-[#E7E2D9] md:block dark:border-white/10",
                warn ? "bg-[#FFFAF2] dark:bg-amber-400/[0.05]" : "bg-[#FCFBF9] dark:bg-white/[0.02]",
            )}
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-5 py-3 pl-6 pr-4 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
            >
                <span className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#315EA8]">
                        <span className="h-2 w-[22px] bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                    </span>
                    <b className="text-[13px] font-bold text-foreground">{t("orders.prime.call.title")}</b>
                    <span dir={dir} className={cn("inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold", CHIP[tone])}>
                        {tone === "new"
                            ? t("orders.prime.call.new")
                            : tone === "moving"
                              ? t("orders.prime.call.onlyMoving", { count: record.moving })
                              : tone === "good"
                              ? t("orders.prime.call.allDelivered", { delivered: record.delivered, total: finished })
                              : t("orders.prime.call.returned", { returned: record.returned, total: finished })}
                    </span>
                    {record.recent.length > 0 && (
                        <span className="flex items-center gap-1" aria-hidden="true">
                            {record.recent.map((p, i) => (
                                <span key={`${p.at}-${i}`} title={primeWhen(p.at, t)} className={cn("flex h-6 w-6 items-center justify-center rounded-full", TILE[p.kind])}>
                                    <ParcelIcon kind={p.kind} className="h-3.5 w-3.5" />
                                </span>
                            ))}
                        </span>
                    )}
                </span>

                <span dir={dir} className="min-w-0 truncate text-left text-[13px]">
                    {warn && (
                        <span className="font-semibold text-[#8A4B00] dark:text-amber-300">
                            {record.returnedInARow === 1
                                ? t("orders.prime.call.lastReturned")
                                : record.returnedInARow === 2
                                  ? t("orders.prime.call.lastReturnedTwo")
                                  : t("orders.prime.call.lastReturnedMany", { count: record.returnedInARow })}
                        </span>
                    )}
                </span>

                <SendLine send={send} city={order.city} collect={collect} />

                <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-[#8A8A8A] transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5 border-t border-[#EFECE6] px-6 pb-6 pt-5 dark:border-white/10">
                    <section className="flex flex-col gap-3.5 rounded-[18px] border border-[#EFECE6] bg-white p-[18px] dark:border-white/10 dark:bg-white/[0.03]">
                        <h3 className="text-sm font-bold text-foreground">{t("orders.prime.call.recordTitle")}</h3>
                        {record.recent.length === 0 ? (
                            <p dir={dir} className="text-left text-[13px] text-muted">
                                {t("orders.prime.call.newHint")}
                            </p>
                        ) : (
                            <ol className="grid grid-cols-6 gap-2.5">
                                {record.recent.map((p, i) => (
                                    <li key={`${p.at}-${i}`} title={primeWhen(p.at, t)} className={cn("flex flex-col items-center gap-1.5 rounded-[14px] px-1.5 py-3 text-center text-xs", TILE[p.kind])}>
                                        <ParcelIcon kind={p.kind} className="h-5 w-5" />
                                        <b>{t(`orders.prime.call.kind.${p.kind}`)}</b>
                                        <span>{month.format(new Date(p.at))}</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {record.parcels > record.recent.length && (
                            <p className="text-xs text-muted">{t("orders.prime.call.olderCount", { count: record.parcels - record.recent.length })}</p>
                        )}
                        {warn && (
                            <p dir={dir} className="flex items-start gap-2.5 rounded-[14px] border border-[#F1DDBF] bg-[#FFFBF5] px-3.5 py-3 text-left text-[13px] leading-relaxed text-foreground dark:border-amber-400/20 dark:bg-amber-400/[0.06]">
                                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#8A4B00] dark:text-amber-300" />
                                <span>{t("orders.prime.call.checkHint")}</span>
                            </p>
                        )}
                    </section>

                    <section className="flex flex-col gap-2.5 rounded-[18px] border border-[#EFECE6] bg-white p-[18px] dark:border-white/10 dark:bg-white/[0.03]">
                        <h3 className="text-sm font-bold text-foreground">{t("orders.prime.call.ifConfirmed")}</h3>
                        {send?.kind === "fix" ? (
                            <p dir={dir} className="text-left text-[13px] font-semibold text-[#8A4B00] dark:text-amber-300">
                                {t("orders.prime.call.fixFirst", { reason: t(`printing.primeReason.${send.reason}`) })}
                            </p>
                        ) : (
                            <>
                                <MoneyLine label={t("orders.prime.panel.collect")} value={amount.format(collect)} />
                                <MoneyLine
                                    label={order.city ? t("orders.prime.call.feeTo", { city: order.city }) : t("orders.prime.panel.fee")}
                                    value={send?.kind === "ready" && send.fee !== null ? amount.format(send.fee) : "—"}
                                />
                                <div className="border-t border-dashed border-[#E7E2D9] pt-2.5 dark:border-white/10">
                                    <MoneyLine
                                        strong
                                        tone="green"
                                        label={t("orders.prime.call.netIfDelivered")}
                                        value={send?.kind === "ready" && send.fee !== null ? amount.format(Math.max(0, collect - send.fee)) : "—"}
                                    />
                                </div>
                                <p className="text-xs text-muted">{t("orders.prime.call.feeSource")}</p>
                            </>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}

/** Prime's fee for this parcel and what reaches the store, or what to fix before Prime takes it. */
function SendLine({ send, city, collect }: { send: PrimeDeskRow | null; city: string | null | undefined; collect: number }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    if (send?.kind === "fix") {
        return (
            <span dir={dir} className="whitespace-nowrap text-left text-[13px] font-semibold text-[#8A4B00] dark:text-amber-300">
                {t("orders.prime.call.fixFirst", { reason: t(`printing.primeReason.${send.reason}`) })}
            </span>
        );
    }
    if (send?.kind !== "ready" || send.fee === null) return <span />;
    return (
        <span dir={dir} className="whitespace-nowrap text-left text-[13px] text-[#4A4A4A] dark:text-white/70">
            {city ? t("orders.prime.call.feeTo", { city }) : t("orders.prime.panel.fee")} <b className="font-mono tabular-nums text-foreground">{amount.format(send.fee)}</b>
            {" · "}
            {t("orders.prime.panel.net")} <b className="font-mono tabular-nums text-[#165C39] dark:text-emerald-300">{amount.format(Math.max(0, collect - send.fee))}</b>
        </span>
    );
}

function ParcelIcon({ kind, className }: { kind: PrimeCallParcel["kind"]; className?: string }) {
    if (kind === "delivered") return <Check aria-hidden="true" strokeWidth={2.6} className={className} />;
    if (kind === "returned") return <X aria-hidden="true" strokeWidth={2.6} className={className} />;
    return <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />;
}

function MoneyLine({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: "green" }) {
    const dir = useTextDir();
    return (
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span dir={dir} className={cn("text-left", strong ? "font-semibold text-foreground" : "text-[#6B6B6B] dark:text-white/60")}>
                {label}
            </span>
            <span
                className={cn(
                    "font-mono tabular-nums",
                    strong ? "text-base font-bold" : "font-semibold",
                    tone === "green" ? "text-[#165C39] dark:text-emerald-300" : "text-foreground",
                )}
            >
                {value}
            </span>
        </div>
    );
}
