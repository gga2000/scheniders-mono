"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { StoreConfigV2 } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { foundationDoneCount, FOUNDATION_STEPS, type FoundationStatus, type FoundationStep } from "@/lib/merchant-guide/foundation";
import { lineText, type GuideLocale } from "@/lib/merchant-guide/script";
import {
    DELIVERY_CHOICES,
    FOUNDATION_PLACES,
    OPEN_EDITOR_SCREEN_EVENT,
    STORE_EDITOR_PATH,
    type DeliveryChoice,
    type GuideTarget,
} from "@/lib/merchant-guide/steps";
import { GuideChoice } from "./guide-choice";
import { GuideCoachCard } from "./guide-coach-card";
import { GuidePill } from "./guide-pill";
import { GuideProductWalk } from "./guide-product-walk";
import { useGuideSetup } from "./guide-setup-store";
import { productWalkStage } from "@/lib/merchant-guide/product-walk";
import { GuideSpotlight } from "./guide-spotlight";
import { useGuideVoice } from "./use-guide-voice";
import { useTargetBox } from "./use-target-rect";

/** How long a missing element may take to appear before offering "Take me there". */
const FIND_GRACE_MS = 900;

function pickTarget(
    step: FoundationStep,
    working: StoreConfigV2 | null,
    part: number,
    choice: DeliveryChoice | null,
): GuideTarget {
    const place = FOUNDATION_PLACES[step];
    if (step === "shop") {
        // Name first; once a name is saved the light moves to the logo.
        return place.targets[working?.brand_kit?.identity?.name?.trim() ? 1 : 0];
    }
    if (step === "delivery" && choice) return DELIVERY_CHOICES[choice];
    return place.targets[Math.min(part, place.targets.length - 1)];
}

/** Waits a moment for the element to appear before calling it missing. */
function useMissingAfterGrace(selector: string, found: boolean): boolean {
    const [missing, setMissing] = useState<{ selector: string; missing: boolean }>({ selector, missing: false });
    useEffect(() => {
        if (found) return;
        const timer = setTimeout(() => setMissing({ selector, missing: true }), FIND_GRACE_MS);
        return () => clearTimeout(timer);
    }, [selector, found]);
    return !found && missing.selector === selector && missing.missing;
}

export function GuideFoundationStep({
    step,
    status,
    working,
    locale,
    soundOn,
    onToggleSound,
    pillLeft,
}: {
    step: FoundationStep;
    status: FoundationStatus;
    working: StoreConfigV2 | null;
    locale: GuideLocale;
    soundOn: boolean;
    onToggleSound: () => void;
    pillLeft: number;
}) {
    const { t } = useLanguage();
    const pathname = usePathname();
    const router = useRouter();
    const place = FOUNDATION_PLACES[step];
    // The delivery answer starts over with each step (this card is keyed by step).
    const [choice, setChoice] = useState<DeliveryChoice | null>(null);
    const [minimized, setMinimized] = useState(false);
    // The first product walks itself: the light sits on the first field that
    // still needs something. Back and Next override that only until the
    // merchant fills or clears a field.
    const productDraft = useGuideSetup((s) => s.productDraft);
    const autoPart = productWalkStage(productDraft);
    const [manualPart, setManualPart] = useState<{ forAuto: number; value: number } | null>(null);
    const part =
        step === "product"
            ? manualPart && manualPart.forAuto === autoPart
                ? manualPart.value
                : autoPart
            : 0;

    const onPage = pathname.startsWith(place.path);
    const target = pickTarget(step, working, part, step === "delivery" ? choice : null);
    const box = useTargetBox(onPage && !minimized ? target.selector : null);
    const missing = useMissingAfterGrace(target.selector, box !== null);
    const voice = useGuideVoice(target.line, lineText(target.line, locale), locale, soundOn && !minimized);

    const done = foundationDoneCount(status);
    const label = t("guide.phase.foundation");
    const heading = `${label} · ${t(place.labelKey)} · ${t("guide.progress", { done: FOUNDATION_STEPS.indexOf(step) + 1, total: FOUNDATION_STEPS.length })}`;

    const go = (): void => {
        if (onPage && place.path === STORE_EDITOR_PATH && place.editorScreen !== undefined) {
            window.dispatchEvent(new CustomEvent(OPEN_EDITOR_SCREEN_EVENT, { detail: place.editorScreen }));
            return;
        }
        router.push(place.href);
    };
    const showGo = !onPage || missing;

    if (minimized) {
        return <GuidePill left={pillLeft} label={label} done={done} total={FOUNDATION_STEPS.length} onOpen={() => setMinimized(false)} />;
    }

    const setPart = (n: number): void => setManualPart({ forAuto: autoPart, value: n });
    const walk = step === "product" ? { index: part, count: place.targets.length, onBack: () => setPart(Math.max(0, part - 1)), onNext: () => setPart(Math.min(place.targets.length - 1, part + 1)) } : undefined;

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
                part={walk}
                onGo={showGo ? go : undefined}
                onMinimize={() => setMinimized(true)}
            >
                {step === "product" && onPage && !showGo && <GuideProductWalk draft={productDraft} stage={part} />}
                {step === "delivery" && onPage && !showGo && (
                    <GuideChoice<DeliveryChoice>
                        tone="dark"
                        label={lineText("delivery.ask", locale)}
                        value={choice}
                        onChange={setChoice}
                        options={[
                            { id: "same", label: t(DELIVERY_CHOICES.same.labelKey) },
                            { id: "each", label: t(DELIVERY_CHOICES.each.labelKey) },
                        ]}
                    />
                )}
            </GuideCoachCard>
            <GuidePill left={pillLeft} label={label} done={done} total={FOUNDATION_STEPS.length} />
        </>
    );
}
