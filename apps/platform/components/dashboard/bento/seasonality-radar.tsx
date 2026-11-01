"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useReducedMotion } from "framer-motion";
import { useElementSize } from "@/hooks/use-element-size";
import { easeOutCubic, radarPath, radarPoint, radarShape } from "./chart-geometry";
import type { TooltipContent } from "./chart-tooltip";

interface SeasonalityRadarProps {
    /** One value per axis, in axis order (first axis at 12 o'clock, clockwise). */
    values: number[];
    axis: string[];
    /** Set the month labels in the mono face. Off for Arabic: a mono face breaks its joins. */
    monoLabels: boolean;
    label: string;
    describe: (index: number) => TooltipContent;
    onTip: (x: number, y: number, content: TooltipContent) => void;
    onTipEnd: () => void;
}

const MAX_SIZE = 400;
/** Room between the outer ring and the card edge for the month labels. */
const LABEL_ROOM = 34;
const LABEL_GAP = 12;

/**
 * Months around a dial, the year as one smooth closed shape. Switching years
 * morphs the shape from the old values to the new ones rather than redrawing it.
 */
export function SeasonalityRadar({ values, axis, monoLabels, label, describe, onTip, onTipEnd }: SeasonalityRadarProps) {
    const [ref, { width }] = useElementSize<HTMLDivElement>();
    const reduce = useReducedMotion();
    const line = useRef<SVGPathElement>(null);
    const shown = useRef<number[] | null>(null);
    const [hover, setHover] = useState<number | null>(null);

    const S = Math.min(width, MAX_SIZE);
    const C = S / 2;
    const R = S / 2 - LABEL_ROOM;
    const N = values.length;
    const angle = (i: number) => (i / N) * Math.PI * 2;
    const ray = (i: number, f: number): [number, number] => [C + Math.cos(angle(i) - Math.PI / 2) * R * f, C + Math.sin(angle(i) - Math.PI / 2) * R * f];

    useEffect(() => {
        if (!S) return;
        const to = values;
        // First paint grows from an even circle; later paints morph from what is shown.
        const from = shown.current && shown.current.length === to.length ? shown.current : to.map(() => 1);
        const t0 = performance.now();
        let raf = 0;
        const step = (now: number) => {
            const t = reduce ? 1 : easeOutCubic(Math.min(1, (now - t0) / 900));
            const cur = from.map((v, i) => v + (to[i] - v) * t);
            shown.current = cur;
            line.current?.setAttribute("d", radarPath(cur, S / 2, S / 2, S / 2 - LABEL_ROOM));
            if (t < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [values, S, reduce]);

    const move = (e: PointerEvent<SVGRectElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - box.left - C, y = e.clientY - box.top - C;
        if (Math.hypot(x, y) < R * 0.2) { setHover(null); onTipEnd(); return; }
        let a = Math.atan2(y, x) + Math.PI / 2;
        if (a < 0) a += Math.PI * 2;
        const i = Math.round((a / (Math.PI * 2)) * N) % N;
        const [px, py] = radarPoint(C, C, R, radarShape(values)(angle(i)), angle(i));
        setHover(i);
        onTip(box.left + px, box.top + py, describe(i));
    };
    const leave = () => { setHover(null); onTipEnd(); };
    const hp = hover !== null && S ? radarPoint(C, C, R, radarShape(values)(angle(hover)), angle(hover)) : null;

    return (
        <div ref={ref} className="mx-auto w-full max-w-[400px]" style={{ height: S || 320 }}>
            {S > 0 && (
                <svg width={S} height={S} overflow="visible" className="mx-auto block" role="img" aria-label={label}>
                    {[0.33, 0.66, 1].map((k) => <circle key={k} cx={C} cy={C} r={R * k} fill="none" stroke="var(--card-border)" strokeWidth={1} />)}
                    {axis.map((m, i) => {
                        const [x1, y1] = ray(i, 0.2), [x2, y2] = ray(i, 1);
                        const cos = Math.cos(angle(i) - Math.PI / 2), sin = Math.sin(angle(i) - Math.PI / 2);
                        const lx = C + cos * (R + LABEL_GAP), ly = C + sin * (R + LABEL_GAP + 6 * Math.abs(sin));
                        // Labels grow away from the ring, so a long month name never crosses it
                        // or runs off the card.
                        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
                        return (
                            <g key={`${m}-${i}`}>
                                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--card-border)" strokeWidth={1} />
                                <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="central" fontSize={11} className={monoLabels ? "font-mono" : undefined} fill={hover === i ? "var(--foreground)" : "var(--foreground-muted)"}>{m}</text>
                            </g>
                        );
                    })}
                    <path ref={line} fill="var(--bento-radar)" fillOpacity={0.08} stroke="var(--bento-radar)" strokeWidth={2.5} strokeLinejoin="round" />
                    <circle cx={C} cy={C} r={R * 0.2} fill="var(--card-bg)" stroke="var(--card-border)" strokeWidth={1} />
                    <g transform={`translate(${C - 11} ${C - 11})`} fill="none" stroke="var(--foreground-muted)" strokeWidth={1.4} strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 1.5l8.5 5v9L11 20.5l-8.5-5v-9z M11 1.5v19 M2.5 6.5L19.5 15.5 M19.5 6.5L2.5 15.5" />
                    </g>
                    {hp && <circle cx={hp[0]} cy={hp[1]} r={4.5} fill="var(--bento-radar)" stroke="var(--card-bg)" strokeWidth={2} />}
                    <rect width={S} height={S} fill="transparent" onPointerMove={move} onPointerLeave={leave} />
                </svg>
            )}
        </div>
    );
}
