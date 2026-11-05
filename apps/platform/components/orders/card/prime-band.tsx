"use client";

import { useState } from "react";
import { BellRing, ChevronDown, Check, MessageSquareText, RotateCw, Route } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { openWhatsAppChat } from "@/lib/open-whatsapp-chat";
import { primeChipState } from "@/lib/prime/chip-state";
import { usePrimeQueueEntry } from "@/hooks/use-prime-queues";
import { primeBandAction, primeReasonNote, primeTrack, type PrimeTrackState } from "@/lib/prime/track";
import { primeReasonText, primeWhen } from "@/lib/prime/when";
import { formatTime } from "@/lib/order-format-utils";
import { cn } from "@/lib/utils";
import type { OrderCardModel } from "./use-order-card-model";
import { PRIME_BAND_ORDER_STATUSES, usePrimeBand } from "./use-prime-band";
import { PrimeTrackLine } from "./prime-track-line";
import { PrimeParcelPanel, type PrimePanelFocus } from "./prime-parcel-panel";
import { primeMessageLink } from "@/lib/prime/message-link";

const BAND_BG: Record<PrimeTrackState, string> = {
    moving: "bg-[#FCFBF9] dark:bg-white/[0.02]",
    postponed: "bg-[#FFFAF2] dark:bg-amber-400/[0.05]",
    needs_you: "bg-[#FFFAF2] dark:bg-amber-400/[0.05]",
    returning: "bg-[#FFF6F5] dark:bg-rose-500/[0.06]",
    delivered: "bg-[#FCFBF9] dark:bg-white/[0.02]",
    cancelled: "bg-[#FCFBF9] dark:bg-white/[0.02]",
};

const bandButton =
    "inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[#E7E5E4] bg-white px-4 text-[13px] font-semibold text-[#1E1E1E] transition-colors hover:bg-[#F5F3EF] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

/**
 * The slim Prime band under an order card (desktop): the parcel's five stops
 * with the current one pulsing, Prime's last step and when, the case number,
 * and one quick action — resend a parcel coming back, remind a customer who
 * postponed, or open the parcel's journey. The journey opens in place under
 * the band (no drawer). Shown while the "Prime track on cards" switch is on,
 * unless the card's truck button hid it.
 */
export function PrimeBand({ m }: { m: OrderCardModel }) {
    // Only cards that can carry the band subscribe to the Prime queries.
    if (!PRIME_BAND_ORDER_STATUSES.has(m.order.status)) return null;
    return <PrimeBandFor m={m} />;
}

function PrimeBandFor({ m }: { m: OrderCardModel }) {
    const { order, onContactRecorded } = m;
    const { t } = useLanguage();
    const dir = useTextDir();
    const band = usePrimeBand(order);
    // In an open «معالجة» / «راجع» list the queue band under this one carries
    // Prime's answer and the fixes, so this band keeps only the journey.
    const inQueue = usePrimeQueueEntry(order.id) !== null;
    const [panel, setPanel] = useState<PrimePanelFocus | null>(null);
    if (!band.shown || !band.view) return null;

    const view = band.view;
    const track = primeTrack(view);
    const action = primeBandAction(view, order.status);
    const chip = primeChipState(view, order.status);
    const when = primeWhen(view.statusChangedAt ?? view.sentAt, t);
    const title = view.stepName ?? t("orders.prime.band.sentTitle");
    const note =
        view.pushError !== null ? t("orders.prime.band.editRefused") : view.cancelRefusedAt !== null ? t("orders.prime.cancelRefused") : null;
    const primeSays = inQueue ? null : primeReasonText(primeReasonNote(view), t);
    const togglePanel = (focus: PrimePanelFocus) => setPanel((open) => (open === focus ? null : focus));

    const remind = () =>
        openWhatsAppChat(order.phone, t("orders.prime.band.remindText", { name: order.customer_name, order: order.order_id }), t, () =>
            onContactRecorded?.(order.id),
        );

    return (
        <div
            data-prime-band={track.state}
            onClick={(e) => e.stopPropagation()}
            className={cn("hidden border-t border-dashed border-[#E7E2D9] md:block dark:border-white/10", BAND_BG[track.state])}
        >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 py-3.5 pl-6 pr-4">
                <div className="grid grid-cols-[minmax(0,1fr)_260px] items-center gap-7">
                    <PrimeTrackLine track={track} branchName={band.branchName} />
                    <button
                        type="button"
                        onClick={() => togglePanel("journey")}
                        aria-expanded={panel !== null}
                        title={t("orders.prime.band.openJourney")}
                        className="group flex min-w-0 items-start gap-2 rounded-xl px-2 py-1 text-left text-[13px] leading-normal transition-colors hover:bg-black/[0.03] dark:hover:bg-white/5"
                    >
                        <span dir={dir} className="min-w-0 flex-1 text-left">
                            <span className="block truncate">
                                <b className="font-bold text-foreground">{title}</b>
                                {order.city && <span className="text-[#4A4A4A] dark:text-white/70"> · {order.city}</span>}
                            </span>
                            <span className="block truncate text-xs text-[#6B6B6B] dark:text-white/50">
                                {when && <>{when} · </>}
                                {t("orders.prime.band.caseLabel")} <span className="font-mono tabular-nums">#{view.caseId}</span>
                            </span>
                            {note && <span className="mt-0.5 block truncate text-xs font-semibold text-[#8A4B00] dark:text-amber-300">{note}</span>}
                            {primeSays && (
                                <span
                                    data-prime-reason
                                    title={primeSays}
                                    className={cn(
                                        "mt-0.5 block truncate text-xs font-semibold",
                                        track.state === "returning" ? "text-[#8F1D13] dark:text-rose-300" : "text-[#8A4B00] dark:text-amber-300",
                                    )}
                                >
                                    {primeSays}
                                </span>
                            )}
                        </span>
                        <ChevronDown
                            aria-hidden="true"
                            className={cn("mt-1 h-4 w-4 shrink-0 text-[#8A8A8A] transition-transform", panel !== null && "rotate-180")}
                        />
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    {chip.pending && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1F3F75] dark:text-sky-300" title={t("orders.prime.sendingLong")}>
                            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#315EA8]" />
                            {t("orders.prime.sending")}
                        </span>
                    )}
                    {chip.resendRequested && view.resentAt && (
                        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#CFE6D8] bg-[#E3F2E9] px-3 text-xs font-bold text-[#165C39] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span dir={dir}>{t("orders.prime.resent", { time: formatTime(view.resentAt) })}</span>
                        </span>
                    )}
                    {action === "resend" && !inQueue && (
                        <>
                            <button
                                type="button"
                                onClick={() => togglePanel("resend")}
                                className={cn(bandButton, "border-[#B42318] bg-[#B42318] text-white hover:bg-[#8F1D13] dark:border-rose-500 dark:bg-rose-500/80 dark:hover:bg-rose-500")}
                            >
                                <RotateCw className="h-4 w-4" aria-hidden="true" />
                                {t("orders.prime.band.resend")}
                            </button>
                            <a href={primeMessageLink(t, view.caseId, order.order_id)} target="_blank" rel="noopener noreferrer" className={bandButton}>
                                <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                                {t("orders.prime.band.messagePrime")}
                            </a>
                        </>
                    )}
                    {action === "remind" && !inQueue && (
                        <button type="button" onClick={remind} className={cn(bandButton, "border-[#F3D7A8] text-[#8A4B00] dark:border-amber-400/30 dark:text-amber-200")}>
                            <BellRing className="h-4 w-4" aria-hidden="true" />
                            {t("orders.prime.band.remind")}
                        </button>
                    )}
                    {action === "journey" && (
                        <button type="button" onClick={() => togglePanel("journey")} aria-expanded={panel !== null} className={bandButton}>
                            <Route className="h-4 w-4" aria-hidden="true" />
                            {t("orders.prime.band.journey")}
                        </button>
                    )}
                </div>
            </div>
            {panel !== null && <PrimeParcelPanel order={order} view={view} focus={panel} returning={track.state === "returning"} canResend={chip.canResend} />}
        </div>
    );
}
