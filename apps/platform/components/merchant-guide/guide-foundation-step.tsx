"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { StoreConfigV2 } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { foundationDoneCount, FOUNDATION_STEPS, type FoundationStatus, type FoundationStep } from "@/lib/merchant-guide/foundation";
import { productWalkStage } from "@/lib/merchant-guide/product-walk";
import { atGoalPage, inStoreEditor, routeStop, type RouteGoal } from "@/lib/merchant-guide/route";
import { lineText, type GuideLineId, type GuideLocale } from "@/lib/merchant-guide/script";
import { FOUNDATION_PLACES, OPEN_EDITOR_SCREEN_EVENT, STORE_EDITOR_PATH, type GuideTarget } from "@/lib/merchant-guide/steps";
import { GuideCoachCard } from "./guide-coach-card";
import { GuidePill } from "./guide-pill";
import { GuideProductWalk } from "./guide-product-walk";
import { useGuideSetup } from "./guide-setup-store";
import { GuideSpotlight } from "./guide-spotlight";
import { useGuideVoice } from "./use-guide-voice";
import { useFirstTargetBox, useTargetBox } from "./use-target-rect";
import { useMissingAfterGrace } from "./use-missing-after-grace";
import { useTypingIn } from "./use-typing-in";

/**
 * How long the guide looks for the next thing to click before offering a
 * plain link there: long enough for a page to load over a slow connection.
 */
const ROUTE_GRACE_MS = 5000;

function pickTarget(step: FoundationStep, working: StoreConfigV2 | null, part: number): GuideTarget {
    const place = FOUNDATION_PLACES[step];
    if (step === "shop") {
        // Name first; once a name is saved the light moves to the logo.
        return place.targets[working?.brand_kit?.identity?.name?.trim() ? 1 : 0];
    }
    return place.targets[Math.min(part, place.targets.length - 1)];
}

/**
 * One basics step. On its page the light walks the step's own fields. Off
 * it, the light walks the way there (lib/merchant-guide/route.ts): the menu,
 * the page, the button, each clicked by the merchant.
 */
export function GuideFoundationStep({
    step,
    done,
    revisit,
    logoLater,
    onLater,
    status,
    working,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
    onBack,
    onReturn,
}: {
    step: FoundationStep;
    /** The step is finished. */
    done: boolean;
    /** The merchant came back to this step with the back arrow: Next returns to where they stopped. */
    revisit: boolean;
    /** The merchant put the logo off for later; on the shop step it is the last thing left before opening. */
    logoLater: boolean;
    /** Puts the logo off for later. */
    onLater: () => void;
    status: FoundationStatus;
    working: StoreConfigV2 | null;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
    /** To the step before; null on the first one. */
    onBack: (() => void) | null;
    /** From a finished step, back to the step the merchant stopped at. */
    onReturn: () => void;
}) {
    const { t } = useLanguage();
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const phone = useIsMobile();
    const sidebarCollapsed = useSidebarCollapsed();
    const place = FOUNDATION_PLACES[step];
    const [minimized, setMinimized] = useState(false);
    // The "empty for now" stop on the products page is read once per step.
    const [emptyRead, setEmptyRead] = useState(false);
    // The first product walks itself: the light sits on the first field that
    // still needs something. Back and Next override that only until the
    // merchant fills or clears a field.
    const productDraft = useGuideSetup((s) => s.productDraft);
    // A field being typed in keeps the light: the walk moves on when the
    // merchant leaves it, not at the first letter.
    const typingIn = useTypingIn(step === "product" ? place.targets.map((target) => target.selector) : null);
    const filledUpTo = productWalkStage(productDraft);
    const autoPart = typingIn >= 0 && typingIn < filledUpTo ? typingIn : filledUpTo;
    const [manualPart, setManualPart] = useState<{ forAuto: number; value: number } | null>(null);
    const part =
        step === "product"
            ? manualPart && manualPart.forAuto === autoPart
                ? manualPart.value
                : autoPart
            : 0;

    // A finished first product is shown in the list: a second new one isn't the point.
    const goal: RouteGoal = step === "product" && done ? "products-list" : step;
    const onPage = atGoalPage(goal, pathname);
    const target: GuideTarget | null = goal === "products-list" ? null : pickTarget(step, working, part);
    const fieldBox = useTargetBox(onPage && !minimized && target ? target.selector : null);
    // The store editor's address doesn't say which screen is open, its fields do:
    // until the step's field shows, the way there is inside the editor.
    const route =
        !onPage || (inStoreEditor(pathname) && target !== null && fieldBox === null)
            ? routeStop(goal, { pathname, phone, sidebarCollapsed, emptyRead })
            : null;
    const routeHit = useFirstTargetBox(route && !minimized ? route.targets.map((r) => r.selector) : null);
    const routeTarget = route && routeHit && routeHit.index >= 0 ? (route.targets[routeHit.index] ?? null) : null;
    const routeMissing = useMissingAfterGrace(route ? route.id : null, routeHit !== null, ROUTE_GRACE_MS);
    const fieldMissing = useMissingAfterGrace(onPage && !route && target ? target.selector : null, fieldBox !== null);

    // The logo put off for later comes back last, before the shop opens.
    const logoBack = step === "shop" && logoLater && !revisit && target?.line === "shop.logo";
    const line: GuideLineId = route
        ? (routeTarget?.line ?? route.idle)
        : done || !target
          ? "step.doneAgain"
          : logoBack
            ? "shop.logoLast"
            : target.line;
    const voice = useGuideVoice(line, lineText(line, locale), locale, soundOn && !minimized);
    const box = route ? (routeHit?.box ?? null) : fieldBox;

    const label = t("guide.phase.foundation");
    const doneCount = foundationDoneCount(status);
    if (minimized) {
        return <GuidePill left={pillLeft} label={label} done={doneCount} total={FOUNDATION_STEPS.length} onOpen={() => setMinimized(false)} />;
    }

    const heading = `${label} · ${t(place.labelKey)} · ${t("guide.progress", { done: FOUNDATION_STEPS.indexOf(step) + 1, total: FOUNDATION_STEPS.length })}`;

    // The last resort when the thing to click never shows: go there directly.
    const go = (): void => {
        if (goal === "products-list") {
            router.push("/products");
            return;
        }
        if (inStoreEditor(pathname) && place.path === STORE_EDITOR_PATH && place.editorScreen !== undefined) {
            window.dispatchEvent(new CustomEvent(OPEN_EDITOR_SCREEN_EVENT, { detail: place.editorScreen }));
            return;
        }
        router.push(place.href);
    };
    const lost = route ? routeMissing : fieldMissing;

    const arrived = route === null && onPage;
    const setPart = (n: number): void => setManualPart({ forAuto: autoPart, value: n });
    const walk =
        step === "product" && arrived && !done
            ? { index: part, count: place.targets.length, onNext: () => setPart(Math.min(place.targets.length - 1, part + 1)) }
            : undefined;
    // Back goes to the field before in the product walk, then to the step before.
    const back = walk && part > 0 ? () => setPart(part - 1) : onBack;
    const next = routeTarget?.explain
        ? { label: t("guide.next"), onClick: () => setEmptyRead(true) }
        : done || revisit
          ? { label: t("guide.next"), onClick: onReturn }
          : undefined;
    // No logo yet: the merchant may carry on and add it before the shop opens.
    const later =
        step === "shop" && !done && !revisit && !logoLater && target?.line === "shop.logo"
            ? { label: t("guide.logoLater"), onClick: onLater }
            : undefined;

    return (
        <>
            {box && <GuideSpotlight box={box} raised={!!routeTarget?.raised} />}
            <GuideCoachCard
                heading={heading}
                voice={voice}
                soundOn={soundOn}
                onToggleSound={onToggleSound}
                checkText={t(place.checkKey)}
                box={box}
                dockLeft={pillLeft}
                part={walk}
                onBack={back}
                next={next}
                later={later}
                waitingFor={route ? "click" : "step"}
                onLost={lost ? go : undefined}
                done={done}
                raised={!!routeTarget?.raised}
                onMinimize={() => setMinimized(true)}
            >
                {walk && <GuideProductWalk draft={productDraft} stage={part} />}
            </GuideCoachCard>
            <GuidePill left={pillLeft} label={label} done={doneCount} total={FOUNDATION_STEPS.length} />
        </>
    );
}
