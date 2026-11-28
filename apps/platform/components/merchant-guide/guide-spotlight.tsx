"use client";

import type { CSSProperties } from "react";
import { useGlide } from "./use-glide";
import type { TargetBox } from "./use-target-rect";

const PAD = 6;
/** The pulse ring starts 3px outside the light and fades out 14px outside it (globals.css). */
const RING_FROM = 3;
const RING_TO = 14;

/** The pulse grows the ring by scaling it, so it costs no layout: the scale that takes it from 3px out to 14px out. */
function pulseScale(size: number): number {
    return (size + RING_TO * 2) / (size + RING_FROM * 2);
}

/** The light on the real element: everything around it dims. */
export function GuideSpotlight({ box, raised = false }: { box: TargetBox; raised?: boolean }) {
    const glide = useGlide(box.of);
    const width = box.width + PAD * 2;
    const height = box.height + PAD * 2;
    // Moved with a transform, not top/left: the dim it carries covers the
    // whole screen, and following a scrolling field must not re-lay it out.
    const style = {
        transform: `translate(${box.left - PAD}px, ${box.top - PAD}px)`,
        width,
        height,
        "--guide-pulse-x": pulseScale(width),
        "--guide-pulse-y": pulseScale(height),
    } as CSSProperties;
    return (
        <div
            aria-hidden="true"
            data-testid="merchant-guide-spot"
            data-raised={raised ? "true" : undefined}
            data-glide={glide ? "true" : undefined}
            className="merchant-guide-spot"
            style={style}
        >
            <span className="merchant-guide-ring" />
        </div>
    );
}
