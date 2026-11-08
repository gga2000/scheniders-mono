"use client";

// =====================================================================
// GuideFirstOrder — phase 2 of the guide, on the Orders page and the desk
// =====================================================================
// Offers three practice orders on the first visit to Orders after the
// basics, then walks four stops (lib/merchant-guide/first-order.ts): what
// each status means, confirming one, the WhatsApp bot, and printing at the
// dispatch desk. Ending the phase bins the practice orders.
// =====================================================================

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckCheck, FlaskConical, MessageCircle } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useAutoSend } from "@/hooks/use-auto-send";
import { toast } from "@/hooks/use-toast";
import {
    FIRST_ORDER_PLACES,
    FIRST_ORDER_STOPS,
    STATUS_WALK,
    firstOrderDoneCount,
    firstOrderView,
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
import { usePracticeOrderActions, usePracticeOrders } from "./use-merchant-guide-data";
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
    const started = !!record?.started_at && !record.done_at;
    const ordersQ = usePracticeOrders(tenantId, started);
    const actions = usePracticeOrderActions(tenantId);
    // Captured once per render pass for the "Later" check; a day-long wait needs no ticking clock.
    const [now] = useState(() => Date.now());
    const view = firstOrderView(record, ordersQ.isSuccess ? ordersQ.data : null, pathname.startsWith("/orders"), now);

    const start = async (): Promise<void> => {
        try {
            await actions.start();
            onPatch({ started_at: new Date().toISOString(), seen: [] });
        } catch {
            toast.error(t("guide.fo.startFailed"));
        }
    };
    const finish = async (): Promise<void> => {
        try {
            await actions.end();
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
                    secondary={{ label: t("guide.fo.close"), onClick: () => onPatch({ done_at: new Date().toISOString() }) }}
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
        case "stop":
            return (
                <FirstOrderStopCard
                    key={view.stop}
                    stop={view.stop}
                    done={firstOrderDoneCount(record ?? {}, ordersQ.data ?? [])}
                    locale={locale}
                    soundOn={soundOn}
                    onToggleSound={onToggleSound}
                    pillLeft={pillLeft}
                    onSeen={(stop) => onPatch({ seen: [...(record?.seen ?? []), stop] })}
                />
            );
    }
}

function FirstOrderStopCard({
    stop,
    done,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
    onSeen,
}: {
    stop: FirstOrderStop;
    done: number;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    onSeen: (stop: FirstOrderReadStop) => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const autoSend = useAutoSend();
    const [minimized, setMinimized] = useState(false);
    const place = FIRST_ORDER_PLACES[stop];

    const onPage = pathname.startsWith(place.path);
    const box = useTargetBox(onPage && !minimized ? place.selector : null);
    const missing = useMissingAfterGrace(place.selector, box !== null);
    const autoOff = stop === "whatsapp" && !autoSend.isLoading && !autoSend.enabled;
    const line: GuideLineId = autoOff ? "fo.whatsappOff" : place.line;
    const voice = useGuideVoice(line, lineText(line, locale), locale, soundOn && !minimized);

    const label = t("guide.phase.firstOrder");
    if (minimized) {
        return <GuidePill left={pillLeft} label={label} done={done} total={FIRST_ORDER_STOPS.length} onOpen={() => setMinimized(false)} />;
    }

    const heading = `${label} · ${t(place.labelKey)} · ${t("guide.progress", { done: FIRST_ORDER_STOPS.indexOf(stop) + 1, total: FIRST_ORDER_STOPS.length })}`;
    // The confirm button sits on a practice card; a filter or a status tab can hide it.
    const hiddenCard = stop === "confirm" && onPage && missing;
    const readStop = stop === "statuses" || stop === "whatsapp" ? stop : null;

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
                onGo={!onPage ? () => router.push(place.path) : undefined}
                next={onPage && readStop ? { label: t("guide.next"), onClick: () => onSeen(readStop) } : undefined}
                onMinimize={() => setMinimized(true)}
            >
                {stop === "statuses" && onPage && <StatusWalk />}
                {stop === "whatsapp" && onPage && (
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
                    </>
                )}
                {stop === "dispatch" && onPage && (
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
