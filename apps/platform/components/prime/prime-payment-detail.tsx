"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import {
    usePrimeStatement,
    usePrimeStatementAction,
    type PrimeStatementAction,
    type PrimeStatementRowView,
} from "@/hooks/use-prime-statements";
import { downloadCsv } from "@/lib/export-utils";
import { primeWhen } from "@/lib/prime/when";
import { cn } from "@/lib/utils";
import { useActionProblem } from "./use-action-problem";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const KIND_ORDER = { different: 0, unknown: 1, match: 2 } as const;

const chip = "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold";
const small =
    "inline-flex h-[34px] items-center justify-center whitespace-nowrap rounded-full border border-[#E7E5E4] bg-white px-3.5 text-[13px] font-semibold text-[#1E1E1E] transition-colors hover:bg-[#FAF8F5] disabled:opacity-60 dark:border-white/10 dark:bg-transparent dark:text-white";
const button =
    "inline-flex h-11 items-center justify-center rounded-full border border-[#E7E5E4] bg-white px-[18px] text-sm font-semibold text-[#1E1E1E] transition-colors hover:bg-[#FAF8F5] disabled:opacity-60 dark:border-white/10 dark:bg-transparent dark:text-white";
const dark = "inline-flex h-11 items-center justify-center rounded-full bg-[var(--ink)] px-[18px] text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-[var(--ink)]";

/** Prime collected another amount than our books expect for this parcel. */
const collectDiffers = (row: PrimeStatementRowView) => row.ours?.collect != null && row.primeCollect !== row.ours.collect;
/** Prime charged another fee than it quoted for this parcel. */
const feeDiffers = (row: PrimeStatementRowView) => row.ours?.fee != null && row.primeFee !== row.ours.fee;

/**
 * One Prime payment against our books: what Prime collected, its fees, what
 * it paid and what we expected; each parcel, differences first, with a way
 * to settle each (accept Prime's price, or ask Prime about its fee); and the
 * approval that closes the matching orders as paid.
 */
export function PrimePaymentDetail({ paymentId, onAskPrime }: { paymentId: number; onAskPrime: (orderId: string, draft: string, label: string) => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const payment = usePrimeStatement(paymentId);
    const action = usePrimeStatementAction();
    const problemOf = useActionProblem();
    const [confirming, setConfirming] = useState(false);
    const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
    const [busyOrder, setBusyOrder] = useState<string | null>(null);

    const run = async (body: PrimeStatementAction) => {
        setNote(null);
        try {
            const answer = await action.mutateAsync(body);
            const problem = problemOf(answer);
            if (problem) return setNote({ tone: "bad", text: problem });
            if (!answer.success) return;
            const { outcome } = answer;
            if (outcome.kind === "approved") {
                setNote({ tone: "ok", text: outcome.completed > 0 ? t("prime.cash.approvedDone", { count: outcome.completed }) : t("prime.cash.nothingToApprove") });
            } else if (outcome.kind === "accepted") {
                setNote({ tone: "ok", text: t("prime.cash.priceAccepted", { price: amount.format(outcome.price) }) });
            }
        } catch {
            setNote({ tone: "bad", text: t("prime.cash.error.failed") });
        }
    };

    if (payment.isPending) return <div className="h-72 animate-pulse rounded-[22px] bg-[var(--card-bg)]" aria-busy="true" />;
    if (payment.isError || !payment.data) {
        return <p className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-sm text-muted">{t("orders.prime.unreachable")}</p>;
    }

    const { statement, approval } = payment.data;
    const { summary } = statement;
    const rows = [...statement.rows].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const expected = summary.net - summary.diff;
    const off = summary.different + summary.unknown;
    const closable = statement.rows.filter((r) => r.kind === "match" && (r.ours?.status === "delivered" || r.ours?.status === "in_transit")).length;

    const exportCsv = () =>
        downloadCsv(
            [
                t("prime.cash.csv.order"),
                t("prime.cash.csv.customer"),
                t("prime.cash.csv.case"),
                t("prime.cash.colExpected"),
                t("prime.cash.colCollected"),
                t("prime.cash.colFee"),
                t("prime.cash.csv.paid"),
                t("prime.cash.csv.difference"),
                t("prime.cash.csv.result"),
            ],
            rows.map((r) => [
                r.ours?.orderNumber ?? r.receipt ?? "",
                r.ours?.customerName ?? "",
                r.caseId ?? "",
                r.ours?.collect ?? "",
                r.primeCollect,
                r.primeFee,
                r.primeNet,
                r.diff ?? "",
                t(`prime.page.kind.${r.kind}`),
            ]),
            `prime-payment-${paymentId}`,
        );

    return (
        <section className="flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)]">
            <div className="grid grid-cols-4 gap-3 p-5">
                {[
                    { label: t("prime.cash.collected"), value: amount.format(summary.collect) },
                    { label: t("prime.cash.fees"), value: summary.fees > 0 ? `−${amount.format(summary.fees)}` : "0" },
                    { label: t("prime.cash.paid"), value: amount.format(summary.net) },
                    { label: t("prime.cash.expected"), value: amount.format(expected), warn: summary.diff !== 0 },
                ].map(({ label, value, warn }) => (
                    <div key={label}>
                        <span dir={dir} className="block text-left text-xs text-muted">
                            {label}
                        </span>
                        <b className={cn("text-[22px] tabular-nums", warn ? "text-[#8A4B00] dark:text-amber-300" : "text-foreground")}>{value}</b>
                    </div>
                ))}
            </div>

            <div
                className={cn(
                    "mx-5 mb-4 flex items-center gap-2.5 rounded-[14px] border px-4 py-3 text-sm",
                    off > 0
                        ? "border-[#E9C8A0] bg-[#FFFBF5] text-[#5C3200] dark:border-amber-400/30 dark:bg-amber-400/[0.06] dark:text-amber-100"
                        : "border-[#BFE3CC] bg-[#F3F8F5] text-[#165C39] dark:border-emerald-400/30 dark:bg-emerald-400/[0.06] dark:text-emerald-100",
                )}
            >
                {off > 0 ? <AlertTriangle className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />}
                <p dir={dir} className="text-left">
                    {off === 0 ? (
                        <b>{t("prime.cash.allMatch", { count: summary.parcels })}</b>
                    ) : (
                        <>
                            <b>{t("prime.cash.someMatch", { count: summary.matched })}</b>{" "}
                            {summary.different > 0 && t("prime.cash.difference", { amount: amount.format(Math.abs(summary.diff)), count: summary.different })}{" "}
                            {summary.unknown > 0 && t("prime.cash.notOurs", { count: summary.unknown })}
                        </>
                    )}
                </p>
            </div>

            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-[#FAF8F5] text-left text-xs text-muted dark:bg-white/[0.03]">
                        <th className="h-10 px-5 font-medium">{t("prime.page.order")}</th>
                        <th className="h-10 px-3 font-medium">{t("prime.cash.colExpected")}</th>
                        <th className="h-10 px-3 font-medium">{t("prime.cash.colCollected")}</th>
                        <th className="h-10 px-3 font-medium">{t("prime.cash.colFee")}</th>
                        <th className="h-10 w-[180px] px-5 font-medium" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => {
                        const ours = row.ours;
                        const priceOff = collectDiffers(row);
                        const feeOff = feeDiffers(row);
                        return (
                            <tr
                                key={`${row.caseId ?? row.receipt ?? "row"}-${i}`}
                                className={cn("h-14 border-t border-[#EFECE6] dark:border-white/10", row.kind === "different" && "bg-[#FFFBF5] dark:bg-amber-400/[0.04]")}
                            >
                                <td className="px-5">
                                    <span className="block font-semibold text-foreground">{ours?.customerName || ours?.orderNumber || row.receipt || "—"}</span>
                                    <span className="block text-xs text-muted tabular-nums">{ours?.orderNumber ?? row.receipt ?? ""}</span>
                                </td>
                                <td className="px-3 tabular-nums">{ours?.collect == null ? "—" : amount.format(ours.collect)}</td>
                                <td className={cn("px-3 tabular-nums", priceOff && "font-bold text-[#8A4B00] dark:text-amber-300")}>{amount.format(row.primeCollect)}</td>
                                <td className={cn("px-3 tabular-nums", feeOff && "font-bold text-[#8A4B00] dark:text-amber-300")}>{amount.format(row.primeFee)}</td>
                                <td className="px-5">
                                    {row.kind === "match" ? (
                                        <span className={cn(chip, "bg-[#E3F2E9] text-[#165C39] dark:bg-emerald-400/15 dark:text-emerald-200")}>{t("prime.page.kind.match")}</span>
                                    ) : row.kind === "unknown" || !ours ? (
                                        <span className={cn(chip, "bg-[#F1EFEA] text-[#4A4A4A] dark:bg-white/10 dark:text-white/70")}>{t("prime.cash.notOursChip")}</span>
                                    ) : priceOff ? (
                                        <button
                                            type="button"
                                            disabled={action.isPending}
                                            onClick={async () => {
                                                setBusyOrder(ours.orderId);
                                                await run({ action: "accept_price", id: paymentId, orderId: ours.orderId });
                                                setBusyOrder(null);
                                            }}
                                            className={small}
                                        >
                                            {busyOrder === ours.orderId ? "…" : t("prime.cash.acceptPrice")}
                                        </button>
                                    ) : feeOff && ours.linked ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onAskPrime(
                                                    ours.orderId,
                                                    t("prime.cash.ticketDraft", {
                                                        payment: paymentId,
                                                        fee: amount.format(row.primeFee),
                                                        expected: amount.format(ours.fee ?? 0),
                                                    }),
                                                    [ours.customerName, ours.orderNumber].filter(Boolean).join(" · "),
                                                )
                                            }
                                            className={small}
                                        >
                                            {t("prime.page.askPrime")}
                                        </button>
                                    ) : (
                                        <span className={cn(chip, "bg-[#FEF3E2] text-[#8A4B00] dark:bg-amber-400/15 dark:text-amber-200")}>{t("prime.page.kind.different")}</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EFECE6] px-5 py-4 dark:border-white/10">
                <div className="min-w-0">
                    <p dir={dir} className="text-left text-xs text-muted">
                        {approval
                            ? approval.source === "app"
                                ? t("prime.cash.approvedOn", { when: primeWhen(approval.at, t) })
                                : t("prime.cash.pdfOn", { when: primeWhen(approval.at, t) })
                            : t("prime.cash.footer")}
                    </p>
                    {note && (
                        <p
                            role={note.tone === "bad" ? "alert" : "status"}
                            dir={dir}
                            className={cn("mt-1 text-left text-xs font-semibold", note.tone === "bad" ? "text-[#B42318] dark:text-rose-300" : "text-[#165C39] dark:text-emerald-300")}
                        >
                            {note.text}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2.5">
                    <button type="button" onClick={exportCsv} className={button}>
                        {t("prime.cash.export")}
                    </button>
                    {!approval &&
                        (confirming ? (
                            <>
                                <span dir={dir} className="text-sm font-semibold text-foreground">
                                    {t("prime.cash.confirmApprove", { count: closable })}
                                </span>
                                <button type="button" onClick={() => setConfirming(false)} className={button}>
                                    {t("prime.cash.cancel")}
                                </button>
                                <button
                                    type="button"
                                    disabled={action.isPending}
                                    onClick={async () => {
                                        await run({ action: "approve", id: paymentId });
                                        setConfirming(false);
                                    }}
                                    className={dark}
                                >
                                    {action.isPending ? "…" : t("prime.cash.confirm")}
                                </button>
                            </>
                        ) : (
                            <button type="button" disabled={closable === 0} onClick={() => setConfirming(true)} className={dark}>
                                {t("prime.cash.approve", { count: closable })}
                            </button>
                        ))}
                </div>
            </div>
        </section>
    );
}
