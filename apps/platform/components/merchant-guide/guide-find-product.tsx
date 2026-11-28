"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/hooks/use-language";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { foundationDoneCount, FOUNDATION_STEPS, type FoundationStatus } from "@/lib/merchant-guide/foundation";
import { atGoalPage, routeStop } from "@/lib/merchant-guide/route";
import { lineText, type GuideLineId, type GuideLocale } from "@/lib/merchant-guide/script";
import { GuideCoachCard } from "./guide-coach-card";
import { GuidePill } from "./guide-pill";
import { GuideSpotlight } from "./guide-spotlight";
import type { GuideTourRecord } from "./use-merchant-guide-data";
import { useGuideVoice } from "./use-guide-voice";
import { useMissingAfterGrace } from "./use-missing-after-grace";
import { useFirstTargetBox } from "./use-target-rect";

/** How long the merchant tries alone at each click before the light shows it (Ali, 28 Nov). */
export const PRACTICE_HINT_MS = 5000;
/** Once the light is due, how long it may look for the thing to click before offering a plain link. */
const PRACTICE_LOST_MS = 5000;
/** Where the practice drops the merchant: a page far from their products. */
const PRACTICE_START = "/orders";
const PRODUCTS_LIST = "/products";

/**
 * The practice after the first product (Ali, 28 Nov): the guide takes the
 * merchant to Orders and they find their own way back to their product. The
 * light stays off while they try; after a few seconds at one click with no
 * step forward, it lights that click, the same way the basics steps walk.
 */
export function GuideFindProduct({
    record,
    status,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
    saving,
    onRecord,
    onBack,
    hintAfterMs = PRACTICE_HINT_MS,
}: {
    record: GuideTourRecord | undefined;
    status: FoundationStatus;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    saving: boolean;
    onRecord: (record: GuideTourRecord) => void;
    /** To the finished product step; null when it can't be shown. */
    onBack: (() => void) | null;
    hintAfterMs?: number;
}) {
    const { t } = useLanguage();
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const phone = useIsMobile();
    const sidebarCollapsed = useSidebarCollapsed();
    const [minimized, setMinimized] = useState(false);
    // Started here, before the saved record comes back.
    const [startedNow, setStartedNow] = useState(false);
    // Only a way back counts: the products page ticks once the merchant has
    // been somewhere else since the practice started.
    const [left, setLeft] = useState(false);
    const started = startedNow || !!record?.started_at;
    const home = atGoalPage("products-list", pathname);
    if (started && !left && !home) setLeft(true);
    const stage: "intro" | "find" | "found" = !started || (home && !left) ? "intro" : home ? "found" : "find";

    const route =
        stage === "find" ? routeStop("products-list", { pathname, phone, sidebarCollapsed, emptyRead: true }) : null;
    const routeHit = useFirstTargetBox(route && !minimized ? route.targets.map((r) => r.selector) : null);
    const routeTarget = route && routeHit && routeHit.index >= 0 ? (route.targets[routeHit.index] ?? null) : null;
    // Each step forward (the menu opened, the editor left) gives the merchant
    // their few seconds alone again.
    const clickKey = route ? `${route.id}|${routeTarget?.selector ?? ""}` : null;
    const hinted = useMissingAfterGrace(clickKey, false, hintAfterMs);
    const lost = useMissingAfterGrace(hinted ? clickKey : null, routeHit !== null, PRACTICE_LOST_MS);

    const line: GuideLineId =
        stage === "intro" ? "practice.intro" : stage === "found" ? "practice.found" : hinted && routeTarget ? routeTarget.line : "practice.find";
    const voice = useGuideVoice(line, lineText(line, locale), locale, soundOn && !minimized);

    const label = t("guide.phase.foundation");
    const doneCount = foundationDoneCount(status);
    if (minimized) {
        return <GuidePill left={pillLeft} label={label} done={doneCount} total={FOUNDATION_STEPS.length} onOpen={() => setMinimized(false)} />;
    }

    const box = hinted ? (routeHit?.box ?? null) : null;
    const raised = box !== null && !!routeTarget?.raised;
    const start = (): void => {
        setStartedNow(true);
        if (!record?.started_at) onRecord({ ...record, started_at: new Date().toISOString() });
        router.push(PRACTICE_START);
    };
    const finish = (): void => {
        const now = new Date().toISOString();
        onRecord({ ...record, started_at: record?.started_at ?? now, done_at: now });
    };
    const next =
        stage === "intro"
            ? { label: t("guide.practice.start"), onClick: start }
            : stage === "found"
              ? { label: t("guide.next"), onClick: finish, busy: saving }
              : undefined;

    return (
        <>
            {box && <GuideSpotlight box={box} raised={raised} />}
            <GuideCoachCard
                heading={`${label} · ${t("guide.practice.title")}`}
                voice={voice}
                soundOn={soundOn}
                onToggleSound={onToggleSound}
                checkText={t("guide.check.practice")}
                box={box}
                dockLeft={pillLeft}
                onBack={onBack}
                next={next}
                waitingFor="click"
                onLost={lost ? () => router.push(PRODUCTS_LIST) : undefined}
                done={stage === "found"}
                raised={raised}
                onMinimize={() => setMinimized(true)}
            />
            <GuidePill left={pillLeft} label={label} done={doneCount} total={FOUNDATION_STEPS.length} />
        </>
    );
}
