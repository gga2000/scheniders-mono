"use client";

// =====================================================================
// GuideAfterBasics — everything the guide shows once the basics are done
// =====================================================================
// In order: a phase in progress (First order, or a walk-through phase);
// else this page's one-time offer; else the «دليلك» corner list.
// =====================================================================

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import { useMetaAdsConnection } from "@/hooks/use-meta-ads";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { firstOrderView, type FirstOrderRecord } from "@/lib/merchant-guide/first-order";
import type { GuideLocale } from "@/lib/merchant-guide/script";
import {
    TOUR_PHASES,
    nextTourStop,
    phaseAvailable,
    phaseStops,
    seeStop,
    tourActive,
    tourOfferFor,
    type GuideShopFacts,
    type TourPhase,
    type TourPhaseId,
    type TourRecord,
} from "@/lib/merchant-guide/tours";
import { GuideFirstOrder } from "./guide-first-order";
import { GuideList, type GuideListItem } from "./guide-list";
import { GuideNote } from "./guide-note";
import { GuideTour } from "./guide-tour";
import type { GuideAnswers, GuidePhases } from "./use-merchant-guide-data";

const FIRST_ORDER = { id: "first_order", labelKey: "guide.phase.firstOrder", minutes: 4 } as const;

export function GuideAfterBasics({
    tenantId,
    answers,
    phases,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
    onPhases,
    saving,
}: {
    tenantId: string;
    answers: GuideAnswers;
    phases: GuidePhases;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    /** Writes the whole phases object. */
    onPhases: (next: GuidePhases) => void;
    saving: boolean;
}) {
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const { t } = useLanguage();
    const prime = usePrimeConnection();
    const ads = useMetaAdsConnection();
    const [now] = useState(() => Date.now());
    const facts: GuideShopFacts = {
        staff: answers.staff === true,
        inShop: answers.channel === "online_and_shop",
        primeLinked: prime.connected,
        adsLinked: !!ads.data,
    };

    const now_iso = (): string => new Date().toISOString();
    const setTour = (id: TourPhaseId, record: TourRecord): void => onPhases({ ...phases, [id]: record });
    const patchFirstOrder = (patch: FirstOrderRecord): void => onPhases({ ...phases, first_order: { ...phases.first_order, ...patch } });

    // Facts load after the page. Wait for Prime's answer; if the check failed, leave
    // Courier out rather than guess which of its stops apply.
    const primeKnown = prime.checked || prime.failed;
    const shown = (p: TourPhase): boolean => phaseAvailable(p, facts) && (p.id !== "courier" || prime.checked);
    const phasesShown = primeKnown ? TOUR_PHASES.filter(shown) : [];

    // The till console shows only its own phase.
    const onTill = pathname === "/till";

    // 1. First order, in progress or offered on Orders.
    const fo = phases.first_order;
    const foView = firstOrderView(fo, null, pathname.startsWith("/orders"), now);
    if (!onTill && (tourActive(fo) || foView.kind === "offer")) {
        return (
            <GuideFirstOrder
                tenantId={tenantId}
                record={fo}
                locale={locale}
                soundOn={soundOn}
                onToggleSound={onToggleSound}
                pillLeft={pillLeft}
                onPatch={patchFirstOrder}
            />
        );
    }

    // 2. A walk-through phase in progress.
    const active = phasesShown.find((p) => tourActive(phases[p.id]) && (!onTill || p.id === "till"));
    if (active) {
        const stops = phaseStops(active, facts);
        const record = phases[active.id];
        const stop = nextTourStop(stops, record);
        if (stop) {
            return (
                <GuideTour
                    key={`${active.id}:${stop.id}`}
                    label={t(active.labelKey)}
                    stop={stop}
                    index={stops.indexOf(stop)}
                    count={stops.length}
                    locale={locale}
                    soundOn={soundOn}
                    onToggleSound={onToggleSound}
                    pillLeft={pillLeft}
                    saving={saving}
                    onNext={() => setTour(active.id, seeStop(stops, record, stop.id, now_iso()))}
                />
            );
        }
    }

    // 3. This page's one-time offer.
    const pageOffer = primeKnown ? tourOfferFor(pathname, phases, facts) : null;
    const offer = pageOffer && shown(pageOffer) ? pageOffer : null;
    if (offer) {
        return (
            <GuideNote
                key={offer.id}
                line="tour.offer"
                title={`${t(offer.labelKey)} · ${t("guide.list.minutes", { count: offer.minutes })}`}
                locale={locale}
                soundOn={soundOn}
                onToggleSound={onToggleSound}
                pillLeft={pillLeft}
                testId="merchant-guide-offer"
                primary={{ label: t("guide.fo.start"), onClick: () => setTour(offer.id, { started_at: now_iso(), seen: [] }) }}
                secondary={{ label: t("guide.fo.later"), onClick: () => setTour(offer.id, { ...phases[offer.id], later_at: now_iso() }) }}
            />
        );
    }

    // 4. The corner list.
    if (phases.list_hidden_at || onTill) return null;
    const items: GuideListItem[] = [
        { ...FIRST_ORDER, done: !!fo?.done_at },
        ...phasesShown.map((p) => ({
            id: p.id,
            labelKey: p.labelKey,
            minutes: p.minutes,
            done: !!phases[p.id]?.done_at,
        })),
    ];
    const pick = (id: string): void => {
        if (id === FIRST_ORDER.id) {
            // A fresh offer on Orders; «يلا» there makes the practice orders.
            onPhases({ ...phases, first_order: {} });
            router.push("/orders");
            return;
        }
        const phase = TOUR_PHASES.find((p) => p.id === id);
        if (!phase) return;
        const first = phaseStops(phase, facts)[0];
        setTour(phase.id, { started_at: now_iso(), seen: [] });
        if (first) router.push(first.href);
    };
    return <GuideList items={items} left={pillLeft} onPick={pick} onHide={() => onPhases({ ...phases, list_hidden_at: now_iso() })} />;
}
