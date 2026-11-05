"use client";

import { useState } from "react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeStatement, usePrimeStatementAction, usePrimeStatements } from "@/hooks/use-prime-statements";
import { primePaidButNotDelivered } from "@/lib/prime/statement";
import { useActionProblem } from "./use-action-problem";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const light = "inline-flex h-[42px] items-center justify-center rounded-full bg-[var(--ink)] px-4 text-[13px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-[var(--ink)]";
const ghost = "inline-flex h-[42px] items-center justify-center rounded-full border border-[var(--card-border)] px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-black/[0.04] disabled:opacity-60 dark:hover:bg-white/10";

/**
 * «الكشف الجديد»: Prime's newest payment that the store has not approved, in
 * plain words (how many parcels, how many match, the difference), with the
 * same two-step approval the statement page has. Gone once the newest
 * payment is approved: nothing is left to do.
 */
export function PrimeStatementCard({ onOpen }: { onOpen: (id: number) => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const statements = usePrimeStatements(true);
    const action = usePrimeStatementAction();
    const problemOf = useActionProblem();
    const [confirming, setConfirming] = useState(false);
    const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
    const answer = statements.data;
    const entry = answer?.connected ? answer.statements[0] : undefined;
    const latest = answer?.connected ? answer.latest : null;
    // The rows say how many parcels the approval can still close.
    const payment = usePrimeStatement(entry && latest && entry.approval === null ? entry.id : null);
    const closable = payment.data?.statement.rows.filter((r) => r.kind === "match" && (r.ours?.status === "delivered" || r.ours?.status === "in_transit")).length ?? 0;

    const paidNotDelivered = payment.data?.statement.rows.filter(primePaidButNotDelivered).length ?? 0;

    if (answer?.connected && (!entry || entry.approval !== null) && !note) return null;

    const approve = async () => {
        if (!entry) return;
        setNote(null);
        try {
            const result = await action.mutateAsync({ action: "approve", id: entry.id });
            const problem = problemOf(result);
            if (problem) return setNote({ tone: "bad", text: problem });
            if (result.success && result.outcome.kind === "approved") {
                setNote({ tone: "ok", text: result.outcome.completed > 0 ? t("prime.cash.approvedDone", { count: result.outcome.completed }) : t("prime.cash.nothingToApprove") });
            }
        } catch {
            setNote({ tone: "bad", text: t("prime.cash.error.failed") });
        } finally {
            setConfirming(false);
        }
    };

    const off = latest ? latest.summary.different + latest.summary.unknown : 0;
    return (
        <section className="flex flex-col gap-3.5 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5 text-foreground">
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold text-foreground">{t("prime.page.newStatement")}</h2>
                {latest && (
                    <span
                        className={
                            off > 0
                                ? "inline-flex h-[26px] items-center rounded-full bg-[#FEF3E2] px-2.5 text-xs font-bold text-[#8A4B00] dark:bg-amber-400/15 dark:text-amber-200"
                                : "inline-flex h-[26px] items-center rounded-full bg-[#E3F2E9] px-2.5 text-xs font-bold text-[#165C39] dark:bg-emerald-400/15 dark:text-emerald-200"
                        }
                    >
                        {off > 0 ? t("prime.page.statementDiff") : t("prime.page.statementMatch")}
                    </span>
                )}
            </div>
            {statements.isPending ? (
                <div className="h-16 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/10" aria-busy="true" />
            ) : statements.isError ? (
                <p className="text-sm text-muted">{t("orders.prime.unreachable")}</p>
            ) : !entry || !latest ? (
                <p dir={dir} className="text-left text-sm text-muted">
                    {note ? note.text : t("prime.page.noStatements")}
                </p>
            ) : (
                <>
                    <div className="flex items-baseline justify-between gap-3">
                        <span dir={dir} className="text-[13px] text-muted">
                            {t("prime.page.statementLine", { id: entry.id, parcels: latest.summary.parcels })}
                        </span>
                        <b className="text-[26px] tabular-nums text-foreground">{amount.format(entry.amount)}</b>
                    </div>
                    <p dir={dir} className="text-left text-[13px] leading-relaxed text-foreground/80">
                        {latest.summary.diff === 0
                            ? t("prime.page.statementPlainSame", { parcels: latest.summary.parcels, matched: latest.summary.matched })
                            : t("prime.page.statementPlain", { parcels: latest.summary.parcels, matched: latest.summary.matched, amount: amount.format(Math.abs(latest.summary.diff)) })}
                    </p>
                    {paidNotDelivered > 0 && (
                        <p data-paid-not-delivered role="alert" dir={dir} className="text-left text-xs font-semibold text-[#B42318] dark:text-rose-300">
                            {t("prime.cash.paidNotDelivered", { count: paidNotDelivered })}
                        </p>
                    )}
                    {note && (
                        <p role={note.tone === "bad" ? "alert" : "status"} dir={dir} className={note.tone === "bad" ? "text-left text-xs font-semibold text-[#B42318] dark:text-rose-300" : "text-left text-xs font-semibold text-[#165C39] dark:text-emerald-300"}>
                            {note.text}
                        </p>
                    )}
                    {entry.approval === null &&
                        (confirming ? (
                            <div className="flex flex-col gap-2">
                                <span dir={dir} className="text-left text-[13px] font-semibold">
                                    {t("prime.cash.confirmApprove", { count: closable })}
                                </span>
                                <div className="flex gap-2">
                                    <button type="button" disabled={action.isPending} onClick={approve} className={light}>
                                        {action.isPending ? "…" : t("prime.cash.confirm")}
                                    </button>
                                    <button type="button" onClick={() => setConfirming(false)} className={ghost}>
                                        {t("prime.cash.cancel")}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button type="button" disabled={closable === 0 || payment.isPending} onClick={() => setConfirming(true)} className={light}>
                                    {t("prime.cash.approve", { count: closable })}
                                </button>
                                <button type="button" onClick={() => onOpen(entry.id)} className={ghost}>
                                    {t("prime.page.openStatement")}
                                </button>
                            </div>
                        ))}
                </>
            )}
        </section>
    );
}
