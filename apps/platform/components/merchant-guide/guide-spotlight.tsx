"use client";

import type { TargetBox } from "./use-target-rect";

const PAD = 6;

/** The light on the real element: everything around it dims. */
export function GuideSpotlight({ box }: { box: TargetBox }) {
    return (
        <div
            aria-hidden="true"
            data-testid="merchant-guide-spot"
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
