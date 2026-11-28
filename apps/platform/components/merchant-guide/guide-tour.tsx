"use client";

// =====================================================================
// GuideTour — one stop of a walk-through phase (3 to 9) or the staff tour
// =====================================================================
// The light sits on the stop's piece of the page, one line is said, and
// Next moves on (the last stop says Finish). A piece that isn't on the page
// right now (no low stock, no flags yet) still gets its line: the card docks
// in the corner and says the piece shows up once there is something to show.
// The back arrow re-reads the stops before; Next walks forward again.
// =====================================================================

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { lineText, type GuideLocale } from "@/lib/merchant-guide/script";
import { nextTourStop, type TourRecord, type TourStop } from "@/lib/merchant-guide/tours";
import { GuideCoachCard } from "./guide-coach-card";
import { GuidePill } from "./guide-pill";
import { GuideSpotlight } from "./guide-spotlight";
import { useGuideVoice } from "./use-guide-voice";
import { useMissingAfterGrace } from "./use-missing-after-grace";
import { useTargetBox } from "./use-target-rect";

/** Whether the address already holds the stop's query (e.g. ?tab=expenses). */
function onStopQuery(href: string, search: URLSearchParams | null): boolean {
    const q = href.split("?")[1];
    if (!q) return true;
    const want = new URLSearchParams(q);
    for (const [k, v] of want) if (search?.get(k) !== v) return false;
    return true;
}

export function GuideTour({
    label,
    stop,
    index,
    count,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
    onNext,
    onBack,
    saving,
}: {
    /** The phase's name: "Money", "Your pages"… */
    label: string;
    stop: TourStop;
    index: number;
    count: number;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    onNext: () => void;
    /** To the stop before; null on the first one. */
    onBack: (() => void) | null;
    saving: boolean;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const pathname = usePathname() ?? "/";
    const searchParams = useSearchParams();
    const router = useRouter();
    const [minimized, setMinimized] = useState(false);

    const onPage = pathname.startsWith(stop.path) && onStopQuery(stop.href, searchParams);
    const box = useTargetBox(onPage && !minimized ? stop.selector : null);
    const missing = useMissingAfterGrace(stop.selector, box !== null);
    const voice = useGuideVoice(stop.line, lineText(stop.line, locale), locale, soundOn && !minimized);

    if (minimized) {
        return <GuidePill left={pillLeft} label={label} done={index} total={count} onOpen={() => setMinimized(false)} />;
    }

    const heading = `${label} · ${t(stop.labelKey)} · ${t("guide.progress", { done: index + 1, total: count })}`;
    const last = index === count - 1;

    return (
        <>
            {box && <GuideSpotlight box={box} />}
            <GuideCoachCard
                heading={heading}
                voice={voice}
                soundOn={soundOn}
                onToggleSound={onToggleSound}
                checkText={t("guide.tour.check")}
                box={box}
                dockLeft={pillLeft}
                onBack={onBack}
                onGo={!onPage ? () => router.push(stop.href) : undefined}
                next={onPage ? { label: t(last ? "guide.fo.finish" : "guide.next"), onClick: onNext, busy: saving } : undefined}
                onMinimize={() => setMinimized(true)}
            >
                {onPage && missing && (
                    <p dir={dir} className="inline-flex items-start gap-1.5 text-xs text-neutral-300">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {t("guide.tour.notShown")}
                    </p>
                )}
            </GuideCoachCard>
            <GuidePill left={pillLeft} label={label} done={index} total={count} />
        </>
    );
}

/**
 * A walk-through phase from where the merchant stopped: the first stop not
 * seen yet, or one before it they went back to. Going back marks nothing;
 * Next from a stop already seen moves to the one after it.
 */
export function GuideTourSteps({
    stops,
    record,
    onSee,
    ...card
}: {
    stops: readonly TourStop[];
    record: TourRecord | undefined;
    /** Marks the stop seen (and the phase done after the last one). */
    onSee: (stop: TourStop) => void;
    label: string;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    saving: boolean;
}) {
    const [viewing, setViewing] = useState<string | null>(null);
    const current = nextTourStop(stops, record);
    if (!current) return null;
    const currentIndex = stops.indexOf(current);
    const viewIndex = viewing === null ? -1 : stops.findIndex((s) => s.id === viewing);
    const index = viewIndex >= 0 && viewIndex < currentIndex ? viewIndex : currentIndex;
    const stop = stops[index];
    const onNext = (): void => {
        if (index < currentIndex) setViewing(index + 1 < currentIndex ? stops[index + 1].id : null);
        else onSee(stop);
    };
    return (
        <GuideTour
            {...card}
            key={stop.id}
            stop={stop}
            index={index}
            count={stops.length}
            onNext={onNext}
            onBack={index > 0 ? () => setViewing(stops[index - 1].id) : null}
        />
    );
}
