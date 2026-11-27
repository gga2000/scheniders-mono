"use client";

// =====================================================================
// GuideFirstOrder — phase 2 of the guide, on the Orders page and the desk
// =====================================================================
// Offers three practice orders on the first visit to Orders after the
// basics, then walks six stops (lib/merchant-guide/first-order.ts): what
// each status means, an order from the merchant's own store, confirming one,
// switching on the WhatsApp bot, who delivers, and printing at the dispatch
// desk. Ending the phase bins the practice orders and the store test orders.
// The back arrow re-reads a finished stop; Next returns to the current one.
// =====================================================================

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCheck, ExternalLink, FlaskConical, Loader2, MessageCircle, Truck } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useAutoSend } from "@/hooks/use-auto-send";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { toast } from "@/hooks/use-toast";
import {
    FIRST_ORDER_PLACES,
    FIRST_ORDER_STOPS,
    STATUS_WALK,
    firstOrderDoneCount,
    firstOrderView,
    type FirstOrderCourier,
    type FirstOrderFacts,
    type FirstOrderReadStop,
    type FirstOrderRecord,
    type FirstOrderStop,
} from "@/lib/merchant-guide/first-order";
import { lineText, type GuideLineId, type GuideLocale } from "@/lib/merchant-guide/script";
import { cn } from "@/lib/utils";
import { GuideCoachCard } from "./guide-coach-card";
import { GuideNote } from "./guide-note";
import { GuidePill } from "./guide-pill";
import { GuideSpotlight } from "./guide-spotlight";
import { useGuideVoice } from "./use-guide-voice";
import { usePracticeOrderActions, usePracticeOrders, useStoreOrderLink } from "./use-merchant-guide-data";
import { useTargetBox } from "./use-target-rect";
import { useMissingAfterGrace } from "./use-missing-after-grace";

type Patch = (patch: FirstOrderRecord) => void;

export function GuideFirstOrder({
    tenantId,
    record,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
    onPatch,
}: {
    tenantId: string;
    record: FirstOrderRecord | undefined;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    /** Merges into phases.first_order. */
    onPatch: Patch;
}) {
    const pathname = usePathname() ?? "/";
    const { t } = useLanguage();
    const startedAt = record?.started_at && !record.done_at ? record.started_at : null;
    const ordersQ = usePracticeOrders(tenantId, startedAt);
    const actions = usePracticeOrderActions(tenantId);
    const autoSend = useAutoSend();
    const prime = usePrimeConnection();
    // Captured once per render pass for the "Later" check; a day-long wait needs no ticking clock.
    const [now] = useState(() => Date.now());
    // A finished stop the merchant went back to with the back arrow.
    const [viewing, setViewing] = useState<FirstOrderStop | null>(null);
    // Both switches are read before a stop shows, so a done stop never flashes.
    const facts: FirstOrderFacts | null =
        autoSend.isLoading || !(prime.checked || prime.failed) ? null : { autoSendOn: autoSend.enabled, primeLinked: prime.connected };
    const view = firstOrderView(record, ordersQ.isSuccess ? ordersQ.data : null, facts, pathname.startsWith("/orders"), now);

    const start = async (): Promise<void> => {
        try {
            // Trying again after the practice orders ran out first bins that run's store orders.
            if (startedAt) await actions.end(startedAt);
            await actions.start();
            onPatch({ started_at: new Date().toISOString(), seen: [] });
        } catch {
            toast.error(t("guide.fo.startFailed"));
        }
    };
    const finish = async (): Promise<void> => {
        try {
            await actions.end(startedAt ?? undefined);
            onPatch({ done_at: new Date().toISOString() });
        } catch {
            toast.error(t("guide.saveFailed"));
        }
    };

    switch (view.kind) {
        case "none":
            return null;
        case "offer":
            return (
                <GuideNote
                    line="fo.offer"
                    title={t("guide.fo.title")}
                    body={t("guide.fo.offerBody")}
                    locale={locale}
                    soundOn={soundOn}
                    onToggleSound={onToggleSound}
                    pillLeft={pillLeft}
                    primary={{ label: actions.starting ? t("guide.fo.starting") : t("guide.fo.start"), onClick: start, busy: actions.starting }}
                    secondary={{ label: t("guide.fo.later"), onClick: () => onPatch({ later_at: new Date().toISOString() }) }}
                />
            );
        case "expired":
            return (
                <GuideNote
                    line="fo.expired"
                    title={t("guide.fo.expiredTitle")}
                    locale={locale}
                    soundOn={soundOn}
                    onToggleSound={onToggleSound}
                    pillLeft={pillLeft}
                    primary={{ label: actions.starting ? t("guide.fo.starting") : t("guide.fo.tryAgain"), onClick: start, busy: actions.starting }}
                    secondary={{ label: t("guide.fo.close"), onClick: finish }}
                />
            );
        case "finished":
            return (
                <GuideNote
                    line="fo.done"
                    title={t("guide.fo.finishedTitle")}
                    locale={locale}
                    soundOn={soundOn}
                    onToggleSound={onToggleSound}
                    pillLeft={pillLeft}
                    primary={{ label: t("guide.fo.finish"), onClick: finish, busy: actions.ending }}
                />
            );
        case "stop": {
            // Stops before the current one are all done: any of them may be re-read.
            const currentIndex = FIRST_ORDER_STOPS.indexOf(view.stop);
            const shown = viewing !== null && FIRST_ORDER_STOPS.indexOf(viewing) < currentIndex ? viewing : view.stop;
            const shownIndex = FIRST_ORDER_STOPS.indexOf(shown);
            return (
                <FirstOrderStopCard
                    key={shown}
                    stop={shown}
                    review={shown !== view.stop}
                    onBack={shownIndex > 0 ? () => setViewing(FIRST_ORDER_STOPS[shownIndex - 1]) : null}
                    onReturn={() => setViewing(null)}
                    done={firstOrderDoneCount(record ?? {}, ordersQ.data ?? [], facts ?? { autoSendOn: false, primeLinked: false })}
                    locale={locale}
                    soundOn={soundOn}
                    onToggleSound={onToggleSound}
                    pillLeft={pillLeft}
                    onSeen={(stop) => onPatch({ seen: [...(record?.seen ?? []), stop] })}
                    onCourier={(courier) => onPatch({ courier })}
                />
            );
        }
    }
}

function FirstOrderStopCard({
    stop,
    review,
    onBack,
    onReturn,
    done,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
    onSeen,
    onCourier,
}: {
    stop: FirstOrderStop;
    /** A finished stop, re-read: it explains again but asks for nothing. */
    review: boolean;
    /** To the stop before; null on the first one. */
    onBack: (() => void) | null;
    /** From a finished stop, back to the current one. */
    onReturn: () => void;
    done: number;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    onSeen: (stop: FirstOrderReadStop) => void;
    onCourier: (courier: FirstOrderCourier) => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const autoSend = useAutoSend();
    const [minimized, setMinimized] = useState(false);
    const place = FIRST_ORDER_PLACES[stop];

    // A stop with nothing to light up (the store order, the courier) happens on any page.
    const onPage = place.selector === null || pathname.startsWith(place.path);
    const box = useTargetBox(onPage && !minimized ? place.selector : null);
    const missing = useMissingAfterGrace(place.selector, box !== null);
    const autoOff = !review && stop === "whatsapp" && !autoSend.isLoading && !autoSend.enabled;
    const line: GuideLineId = autoOff ? "fo.whatsappOff" : place.line;
    const voice = useGuideVoice(line, lineText(line, locale), locale, soundOn && !minimized);

    const label = t("guide.phase.firstOrder");
    if (minimized) {
        return <GuidePill left={pillLeft} label={label} done={done} total={FIRST_ORDER_STOPS.length} onOpen={() => setMinimized(false)} />;
    }

    const heading = `${label} · ${t(place.labelKey)} · ${t("guide.progress", { done: FIRST_ORDER_STOPS.indexOf(stop) + 1, total: FIRST_ORDER_STOPS.length })}`;
    // The confirm button sits on a practice card; a filter or a status tab can hide it.
    const hiddenCard = !review && stop === "confirm" && onPage && missing;
    const next = review
        ? { label: t("guide.next"), onClick: onReturn }
        : !onPage
            ? undefined
            : stop === "statuses"
              ? { label: t("guide.next"), onClick: () => onSeen("statuses") }
              : stop === "whatsapp"
                ? { label: t("guide.fo.switchOn"), onClick: autoSend.toggle, busy: autoSend.isToggling || autoSend.isLoading }
                : undefined;

    return (
        <>
            {box && <GuideSpotlight box={box} />}
            <GuideCoachCard
                heading={heading}
                voice={voice}
                soundOn={soundOn}
                onToggleSound={onToggleSound}
                checkText={t(place.checkKey)}
                box={box}
                dockLeft={pillLeft}
                onBack={onBack}
                onGo={!onPage && !review ? () => router.push(place.path) : undefined}
                next={next}
                done={review}
                onMinimize={() => setMinimized(true)}
            >
                {stop === "statuses" && onPage && <StatusWalk />}
                {stop === "store_order" && !review && <StoreOrderButton />}
                {stop === "courier" && !review && (
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                onCourier("prime");
                                router.push("/prime");
                            }}
                            data-testid="merchant-guide-courier-prime"
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                        >
                            {t("guide.fo.courierPrime")}
                        </button>
                        <button
                            type="button"
                            onClick={() => onCourier("other")}
                            data-testid="merchant-guide-courier-other"
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EFFF00]"
                        >
                            <Truck className="h-4 w-4" aria-hidden="true" />
                            <span dir={dir}>{t("guide.fo.courierOther")}</span>
                        </button>
                    </div>
                )}
                {stop === "whatsapp" && onPage && review && <WhatsAppBubble />}
                {stop === "whatsapp" && onPage && !review && (
                    <>
                        {autoOff && (
                            <p dir={dir} className="text-sm text-neutral-300">
                                {lineText("fo.whatsapp", locale)}
                            </p>
                        )}
                        <WhatsAppBubble />
                        <span dir={dir} className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", autoSend.enabled ? "text-[#25D366]" : "text-neutral-400")}>
                            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            {t(autoSend.enabled ? "guide.fo.autoOn" : "guide.fo.autoOff")}
                        </span>
                        <button
                            type="button"
                            onClick={() => onSeen("whatsapp")}
                            data-testid="merchant-guide-not-now"
                            className="justify-self-start text-xs text-neutral-400 underline-offset-2 hover:text-white hover:underline"
                        >
                            {t("guide.fo.notNow")}
                        </button>
                    </>
                )}
                {stop === "dispatch" && onPage && !review && (
                    <p dir={dir} className="text-xs text-neutral-300">
                        {t("guide.fo.multiNote")}
                    </p>
                )}
                {hiddenCard && (
                    <p dir={dir} className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
                        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-purple-300" aria-hidden="true" />
                        {t("guide.fo.findCard")}
                    </p>
                )}
            </GuideCoachCard>
            <GuidePill left={pillLeft} label={label} done={done} total={FIRST_ORDER_STOPS.length} />
        </>
    );
}

/** Opens the shop's own store in a new tab, in draft view: an order there is a test order. */
function StoreOrderButton() {
    const { t } = useLanguage();
    const dir = useTextDir();
    const link = useStoreOrderLink(true);
    const CLASS =
        "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#EFFF00] px-4 text-sm font-bold text-neutral-900 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";
    if (link.isError) {
        return (
            <button type="button" onClick={() => void link.refetch()} className={CLASS}>
                <span dir={dir}>{t("guide.fo.storeLinkFailed")}</span>
            </button>
        );
    }
    return (
        <div className="grid gap-2">
            {link.data ? (
                <a href={link.data} target="_blank" rel="noopener noreferrer" data-testid="merchant-guide-open-store" className={CLASS}>
                    <span dir={dir}>{t("guide.fo.openStore")}</span>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
            ) : (
                <span className={cn(CLASS, "opacity-60")} aria-busy="true">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span dir={dir}>{t("guide.fo.openStore")}</span>
                </span>
            )}
            <span dir={dir} className="inline-flex items-center gap-1.5 text-xs text-neutral-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {t("guide.fo.storeWaiting")}
            </span>
        </div>
    );
}

function StatusWalk() {
    const { t } = useLanguage();
    const dir = useTextDir();
    return (
        <ol dir={dir} className="grid gap-1.5 text-sm">
            {STATUS_WALK.map((status, i) => (
                <li key={status} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] tabular-nums text-neutral-300">{i + 1}</span>
                    <span className={cn("font-semibold", status === "completed" && "text-[#EFFF00]")}>{t(`orders.status.${status}`)}</span>
                    <span className="text-neutral-400">{t(`guide.fo.status.${status}`)}</span>
                </li>
            ))}
        </ol>
    );
}

/** The confirmation message as the customer sees it, drawn. */
function WhatsAppBubble() {
    const { t } = useLanguage();
    const dir = useTextDir();
    return (
        <div dir={dir} aria-hidden="true" className="grid gap-1.5 rounded-xl bg-[#0B141A] p-3">
            <div className="text-[11px] font-semibold text-[#25D366]">{t("guide.fo.bubbleShop")}</div>
            <div className="max-w-[88%] rounded-lg rounded-tl-none bg-[#202C33] px-3 py-2 text-[13px] leading-snug text-neutral-100">
                {t("guide.fo.bubbleText")}
                <div className="mt-1 flex justify-end">
                    <CheckCheck className="h-3.5 w-3.5 text-[#53BDEB]" />
                </div>
            </div>
            <div className="grid max-w-[88%] grid-cols-2 gap-1.5">
                <span className="rounded-lg bg-[#202C33] py-1.5 text-center text-[13px] font-semibold text-[#53BDEB]">{t("guide.fo.bubbleConfirm")}</span>
                <span className="rounded-lg bg-[#202C33] py-1.5 text-center text-[13px] font-semibold text-[#53BDEB]">{t("guide.fo.bubbleCancel")}</span>
            </div>
        </div>
    );
}
