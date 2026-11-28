"use client";

import type { TargetBox } from "./use-target-rect";

const PAD = 6;

/** The light on the real element: everything around it dims. */
export function GuideSpotlight({ box, raised = false }: { box: TargetBox; raised?: boolean }) {
    return (
        <div
            aria-hidden="true"
            data-testid="merchant-guide-spot"
            data-raised={raised ? "true" : undefined}
            className="merchant-guide-spot"
            style={{
                top: box.top - PAD,
                left: box.left - PAD,
                width: box.width + PAD * 2,
                height: box.height + PAD * 2,
            }}
        />
    );
}
