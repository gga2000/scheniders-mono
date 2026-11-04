"use client";

import { useState } from "react";
import { ChevronDown, MessageSquareText, RotateCw } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeBoardData } from "@/hooks/use-prime-board";
import type { PrimeBoardList, PrimeNeedReason } from "@/lib/prime/board";
import { primeChipState } from "@/lib/prime/chip-state";
import { primeReasonNote, primeTrack } from "@/lib/prime/track";
import { primeReasonText, primeWhen } from "@/lib/prime/when";
import { cn } from "@/lib/utils";
import { PrimeParcelPanel, type PrimePanelFocus } from "@/components/orders/card/prime-parcel-panel";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const REASON_CHIP: Record<PrimeNeedReason, string> = {
    stuck: "bg-[#FEF3E2] text-[#8A4B00] dark:bg-amber-400/15 dark:text-amber-200",
    needs_you: "bg-[#F5F1FE] text-[#4B2FA8] dark:bg-violet-400/15 dark:text-violet-200",
    cancelled_by_prime: "bg-[#F1EFEA] text-[#4A4A4A] dark:bg-white/10 dark:text-white/70",
    returning: "bg-[#FBEAE8] text-[#8F1D13] dark:bg-rose-500/15 dark:text-rose-200",
};

const button =
    "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E7E5E4] bg-white px-3.5 text-[13px] font-semibold text-[#1E1E1E] transition-colors hover:bg-[#F5F3EF] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

const DAY_MS = 86_400_000;

/**
 * The parcels behind the number picked on the pipeline; by default the ones
 * that need a decision, oldest first. A row opens the parcel in place: its
 * journey, money, the customer's record and, for one coming back, the form
 * that asks Prime for one more attempt.
 */
export function PrimeParcelList({
    data,
    list,
    onShowNeeds,
    onAskPrime,
}: {
    data: PrimeBoardData;
    list: PrimeBoardList;
    onShowNeeds: () => void;
    onAskPrime: (orderId: string) => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const [open, setOpen] = useState<{ orderId: string; focus: PrimePanelFocus } | null>(null);
    const ids = data.board.lists[list];
    const toggle = (orderId: string, focus: PrimePanelFocus) =>
        setOpen((now) => (now?.orderId === orderId && now.focus === focus ? null : { orderId, focus }));

    return (
        <section className="flex min-w-0 flex-col gap-2 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-bold text-foreground">
                    {t(`prime.page.list.${list}`)} <span className="text-muted tabular-nums">· {ids.length}</span>
                </h2>
                {list === "needs" ? (
                    <span className="text-xs text-muted">{t("prime.page.oldestFirst")}</span>
                ) : (
                    <button type="button" onClick={onShowNeeds} className="text-xs font-semibold text-[#315EA8] hover:underline dark:text-sky-300">
                        {t("prime.page.backToNeeds")}
                    </button>
                )}
            </div>
            {ids.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">{t(list === "needs" ? "prime.page.nothingNeeded" : "prime.page.emptyList")}</p>
            ) : (
                <ol className="flex max-h-[640px] flex-col overflow-y-auto">
                    {ids.map((orderId) => {
                        const view = data.views.get(orderId);
                        const order = data.orders.get(orderId);
                        if (!view || !order) return null;
                        const reason = list === "needs" ? data.board.reasons.get(orderId) : undefined;
                        const chip = primeChipState(view, order.status);
                        const track = primeTrack(view);
                        const since = view.statusChangedAt ?? view.sentAt;
                        const days = Math.floor((data.readAt - Date.parse(since)) / DAY_MS);
                        const primeSays = primeReasonText(primeReasonNote(view), t);
                        const detail = reason === "stuck" ? t("prime.page.stuckFor", { days }) : (primeSays ?? view.stepName ?? primeWhen(since, t));
                        const isOpen = open?.orderId === orderId;
                        return (
                            <li key={orderId} data-prime-parcel={orderId} className="border-t border-[#F0EDE7] first:border-t-0 dark:border-white/10">
                                <div className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-sm">
                                    <button type="button" onClick={() => toggle(orderId, "journey")} aria-expanded={isOpen} className="flex min-w-0 items-center gap-2 text-left">
                                        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-[#8A8A8A] transition-transform", isOpen && "rotate-180")} />
                                        <span dir={dir} className="min-w-0 truncate text-left">
                                            <b className="font-semibold text-foreground">{order.customer_name || order.order_id}</b>
                                            <span className="text-xs text-muted">
                                                {order.city && <> · {order.city}</>} · {detail}
                                            </span>
                                        </span>
                                    </button>
                                    {reason ? (
                                        <span className={cn("inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold", REASON_CHIP[reason])}>
                                            {t(`prime.page.reason.${reason}`)}
                                        </span>
                                    ) : (
                                        <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-muted">
                                            IQD {amount.format(view.receiptAmountIqd ?? 0)} · #{view.caseId}
                                        </span>
                                    )}
                                    {chip.canResend ? (
                                        <button type="button" onClick={() => toggle(orderId, "resend")} className={cn(button, "border-[#B42318] bg-[#B42318] text-white hover:bg-[#8F1D13] dark:border-rose-500 dark:bg-rose-500/80")}>
                                            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                                            {t("prime.page.newAttempt")}
                                        </button>
                                    ) : reason === "stuck" || reason === "needs_you" ? (
                                        <button type="button" onClick={() => onAskPrime(orderId)} className={button}>
                                            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                                            {t("prime.page.askPrime")}
                                        </button>
                                    ) : (
                                        <span />
                                    )}
                                </div>
                                {isOpen && open && (
                                    <div className="-mx-5 bg-[#FCFBF9] dark:bg-white/[0.02]">
                                        <PrimeParcelPanel order={order} view={view} focus={open.focus} returning={track.state === "returning"} canResend={chip.canResend} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
