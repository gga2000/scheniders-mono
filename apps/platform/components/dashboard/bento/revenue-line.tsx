"use client";

import { useId, useState, type PointerEvent } from "react";
import { useElementSize } from "@/hooks/use-element-size";
import { niceStep, smoothPath, type Pt } from "./chart-geometry";
import type { TooltipContent } from "./chart-tooltip";

interface RevenueLineProps {
    series: { label: string; value: number }[];
    caption: string;
    /** Compact tick label, e.g. 4.5M or 120. */
    tick: (v: number) => string;
    /** Tooltip body for the hovered point. */
    describe: (index: number) => TooltipContent;
    onTip: (x: number, y: number, content: TooltipContent) => void;
    onTipEnd: () => void;
    /** Changing this replays the draw-in (new window or measure). */
    drawKey: string;
    /** Counts: gridlines only at whole numbers. */
    integer?: boolean;
}

const LEFT = 14;
/** Room on the right for the tick labels. */
const RIGHT = 52;
const TOP = 30;
const BOTTOM = 14;

/**
 * One measure over time in a recessed well: a gradient line that draws itself in,
 * a soft fill that fades in from the left, ticks on the right, and a scrub that
 * follows the pointer to the nearest day.
 */
export function RevenueLine({ series, caption, tick, describe, onTip, onTipEnd, drawKey, integer = false }: RevenueLineProps) {
    const [ref, { width: W, height: H }] = useElementSize<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const id = useId().replace(/:/g, "");

    const values = series.map((s) => s.value);
    const n = values.length;
    const lo = Math.min(...values), hi = Math.max(...values);
    const span = hi - lo || Math.max(1, hi);
    const step = integer ? Math.max(1, Math.ceil(niceStep(span))) : niceStep(span);
    // The line sits in the upper part of the well; the lower part is breathing
    // room for the fill. A flat series still gets a visible band.
    const min = lo - span * 0.22, max = hi + span * 0.08;
    const Y = (v: number) => TOP + (1 - (v - min) / (max - min || 1)) * (H - TOP - BOTTOM);
    const X = (i: number) => LEFT + (n > 1 ? i / (n - 1) : 0) * (W - LEFT - RIGHT);
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 && ticks.length < 8; v += step) ticks.push(v);
    const pts: Pt[] = values.map((v, i) => [X(i), Y(v)]);
    const d = W > 0 && n > 1 ? smoothPath(pts) : "";
    const last = pts[n - 1];

    const move = (e: PointerEvent<SVGRectElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - box.left - LEFT) / (W - LEFT - RIGHT)) * (n - 1))));
        setHover(i);
        onTip(box.left + pts[i][0], box.top + pts[i][1], describe(i));
    };
    const leave = () => { setHover(null); onTipEnd(); };

    return (
        <div ref={ref} className="relative min-h-[180px] flex-1 overflow-hidden rounded-[18px] border border-[var(--card-border)] bg-[var(--bento-well)]">
            <div className="pointer-events-none absolute left-3 top-2.5 z-10 text-[11px] tracking-[-0.01em] text-[var(--foreground-muted)]">{caption}</div>
            {d && (
                <svg width={W} height={H} className="absolute inset-0 block" role="img" aria-label={caption}>
                    <defs>
                        <linearGradient id={`${id}-line`} x1="0" x2="1" y1="0" y2="0">
                            <stop offset="0" style={{ stopColor: "var(--bento-line-a)" }} />
                            <stop offset="1" style={{ stopColor: "var(--bento-line-b)" }} />
                        </linearGradient>
                        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0" style={{ stopColor: "var(--bento-line-b)", stopOpacity: 0.18 }} />
                            <stop offset="1" style={{ stopColor: "var(--bento-line-b)", stopOpacity: 0 }} />
                        </linearGradient>
                        <linearGradient id={`${id}-fade`} x1="0" x2="1" y1="0" y2="0">
                            <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
                            <stop offset="1" stopColor="#fff" stopOpacity="1" />
                        </linearGradient>
                        <mask id={`${id}-mask`}><rect width={W} height={H} fill={`url(#${id}-fade)`} /></mask>
                    </defs>
                    {ticks.map((v) => (
                        <g key={v}>
                            <line x1={0} x2={W} y1={Y(v)} y2={Y(v)} stroke="var(--card-border)" strokeWidth={1} />
                            <text x={W - 10} y={Y(v) - 5} textAnchor="end" fontSize={10} className="font-mono" fill="var(--foreground-muted)">{tick(v)}</text>
                        </g>
                    ))}
                    <path d={`${d}L${last[0]},${H}L${pts[0][0]},${H}Z`} fill={`url(#${id}-fill)`} mask={`url(#${id}-mask)`} />
                    <path
                        key={drawKey}
                        d={d}
                        pathLength={1}
                        fill="none"
                        stroke={`url(#${id}-line)`}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        className="bento-draw"
                    />
                    <circle cx={last[0]} cy={last[1]} r={4.5} fill="var(--bento-line-b)" stroke="var(--card-bg)" strokeWidth={2} />
                    {hover !== null && (
                        <>
                            <line x1={pts[hover][0]} x2={pts[hover][0]} y1={0} y2={H} stroke="var(--foreground-muted)" strokeOpacity={0.5} strokeWidth={1} />
                            <circle cx={pts[hover][0]} cy={pts[hover][1]} r={4.5} fill="var(--bento-line-b)" stroke="var(--card-bg)" strokeWidth={2} />
                        </>
                    )}
                    <rect width={W} height={H} fill="transparent" onPointerMove={move} onPointerLeave={leave} />
                </svg>
            )}
        </div>
    );
}
