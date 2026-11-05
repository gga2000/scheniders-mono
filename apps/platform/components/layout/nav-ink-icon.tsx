"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { cn } from "@/lib/utils";

/** Every stroked shape a lucide icon is drawn with. */
const STROKES = "path, rect, circle, ellipse, polyline, polygon, line";
/** The new icon starts drawing while the active pill is still gliding, so both land together. */
const ARRIVE_DELAY_MS = 110;
const DRAW_MS = 520;
const DRAW_STAGGER_MS = 45;
const DRAW_EASE = "cubic-bezier(.65,0,.35,1)";
const SETTLE_EASE = "cubic-bezier(.22,1.25,.36,1)";

type NavInkIconProps = {
    icon: ComponentType<{ className?: string }>;
    active: boolean;
    className?: string;
};

/**
 * A sidebar icon that redraws its outline, part by part, when its page becomes
 * active, and dips slightly when its page is left. It is still at rest: nothing
 * plays on first render, and nothing plays with reduced motion.
 */
export function NavInkIcon({ icon: Icon, active, className }: NavInkIconProps) {
    const rootRef = useRef<HTMLSpanElement>(null);
    const bloomRef = useRef<HTMLSpanElement>(null);
    const wasActive = useRef(active);

    useEffect(() => {
        const was = wasActive.current;
        wasActive.current = active;
        const svg = rootRef.current?.querySelector("svg");
        if (was === active || !svg) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        if (!active) {
            const exhale = svg.animate(
                [{ transform: "none" }, { transform: "scale(0.92)", offset: 0.4 }, { transform: "none" }],
                { duration: 300, easing: "ease-out" },
            );
            return () => exhale.cancel();
        }

        const running: Animation[] = [];
        svg.querySelectorAll(STROKES).forEach((shape, i) => {
            // pathLength="1" lets one dash cover any shape, whatever its real length.
            shape.setAttribute("pathLength", "1");
            running.push(shape.animate(
                [{ strokeDasharray: "1", strokeDashoffset: 1 }, { strokeDasharray: "1", strokeDashoffset: 0 }],
                { duration: DRAW_MS, delay: ARRIVE_DELAY_MS + i * DRAW_STAGGER_MS, easing: DRAW_EASE, fill: "backwards" },
            ));
        });
        running.push(svg.animate(
            [{ transform: "scale(0.92)" }, { transform: "none" }],
            { duration: 360, delay: ARRIVE_DELAY_MS, easing: SETTLE_EASE, fill: "backwards" },
        ));
        const bloom = bloomRef.current;
        if (bloom) {
            running.push(bloom.animate(
                [
                    { opacity: 0, transform: "scale(0.6)" },
                    { opacity: 1, transform: "scale(1)", offset: 0.3 },
                    { opacity: 0, transform: "scale(1.15)" },
                ],
                { duration: 520, delay: ARRIVE_DELAY_MS, easing: "ease-out" },
            ));
        }
        return () => running.forEach((animation) => animation.cancel());
    }, [active]);

    return (
        <span ref={rootRef} className="relative inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center">
            <span
                ref={bloomRef}
                aria-hidden="true"
                className="pointer-events-none absolute -inset-[9px] rounded-full bg-[radial-gradient(circle,rgba(239,255,0,0.32),rgba(239,255,0,0)_68%)] opacity-0"
            />
            <Icon className={cn("relative h-[22px] w-[22px]", className)} />
        </span>
    );
}
