"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { useReducedMotion } from "framer-motion";
import { useElementSize } from "@/hooks/use-element-size";
import { easeOutCubic, smoothPath, type Pt } from "./chart-geometry";
import type { TooltipContent } from "./chart-tooltip";

interface WavesChartProps {
    /** [week][hour] — week 0 drawn strongest, older weeks fainter. Drawn above the axis. */
    up: number[][];
    /** Same shape, drawn below the axis. */
    down: number[][];
    label: string;
    describe: (hour: number) => TooltipContent;
    onTip: (x: number, y: number, content: TooltipContent) => void;
    onTipEnd: () => void;
}

const PAD = 24;
const WEEK_OPACITY = [1, 0.55, 0.3];

/**
 * Two mirrored families of curves around a shared axis: one lane rises above it,
 * the other falls below, each week a fainter echo of the one after it. The curves
 * grow out of the axis on mount and then breathe very slightly, so the card reads
 * as live without the data moving.
 */
export function WavesChart({ up, down, label, describe, onTip, onTipEnd }: WavesChartProps) {
    const [ref, { width: W, height: H }] = useElementSize<HTMLDivElement>();
    const reduce = useReducedMotion();
    const id = useId().replace(/:/g, "");
    const paths = useRef<(SVGPathElement | null)[]>([]);
    const [hover, setHover] = useState<number | null>(null);

    const hours = up[0]?.length ?? 24;
    const max = Math.max(1, ...up.flat(), ...down.flat());
    const mid = H / 2;
    const X = (i: number) => PAD + (i / (hours - 1)) * (W - 2 * PAD);

    // Oldest week first so the current week paints on top.
    const sets = useMemo(() => {
        const s: { values: number[]; dir: 1 | -1; week: number; lane: "up" | "down" }[] = [];
        for (let w = up.length - 1; w >= 0; w--) s.push({ values: up[w], dir: -1, week: w, lane: "up" });
        for (let w = down.length - 1; w >= 0; w--) s.push({ values: down[w], dir: 1, week: w, lane: "down" });
        return s;
    }, [up, down]);

    useEffect(() => {
        if (!W || !H) return;
        const x = (i: number) => PAD + (i / (hours - 1)) * (W - 2 * PAD);
        const draw = (grow: number, t: number) => {
            sets.forEach((s, j) => {
                const breathe = reduce ? 1 : 1 + Math.sin(t * 1.2 + s.week * 0.9) * 0.035;
                const pts: Pt[] = s.values.map((v, i) => [x(i), H / 2 + s.dir * (3 + (v / max) * (H / 2 - 14) * grow * breathe)]);
                paths.current[j]?.setAttribute("d", smoothPath(pts));
            });
        };
        if (reduce) { draw(1, 0); return; }
        let raf = 0;
        const t0 = performance.now();
        const frame = (now: number) => {
            const t = (now - t0) / 1000;
            draw(easeOutCubic(Math.min(1, t / 1.3)), t);
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, [W, H, sets, reduce, max, hours]);

    const move = (e: PointerEvent<SVGRectElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        const h = Math.max(0, Math.min(hours - 1, Math.round(((e.clientX - box.left - PAD) / (W - 2 * PAD)) * (hours - 1))));
        setHover(h);
        onTip(box.left + X(h), box.top + 12, describe(h));
    };
    const leave = () => { setHover(null); onTipEnd(); };

    return (
        <div ref={ref} className="relative min-h-[220px] flex-1 overflow-hidden rounded-[18px] border border-[var(--card-border)] bg-[var(--bento-well)]">
            {W > 0 && H > 0 && (
                <svg width={W} height={H} className="absolute inset-0 block" role="img" aria-label={label}>
                    <defs>
                        <linearGradient id={`${id}-up`} x1="0" x2="1" y1="0" y2="0">
                            <stop offset=".1" style={{ stopColor: "var(--bento-online-a)" }} />
                            <stop offset=".9" style={{ stopColor: "var(--bento-online-b)" }} />
                        </linearGradient>
                        <linearGradient id={`${id}-down`} x1="0" x2="1" y1="0" y2="0">
                            <stop offset=".15" style={{ stopColor: "var(--bento-chat-a)" }} />
                            <stop offset=".85" style={{ stopColor: "var(--bento-chat-b)" }} />
                        </linearGradient>
                    </defs>
                    {/* Ruler ticks on both edges, like an instrument's scale. */}
                    {Array.from({ length: 9 }, (_, i) => 10 + ((H - 20) * i) / 8).map((y) => (
                        <g key={y} stroke="var(--foreground-muted)" strokeOpacity={0.45}>
                            <line x1={8} x2={14} y1={y} y2={y} strokeWidth={1} />
                            <line x1={W - 14} x2={W - 8} y1={y} y2={y} strokeWidth={1} />
                        </g>
                    ))}
                    <line x1={PAD} x2={W - PAD} y1={mid} y2={mid} stroke="var(--card-border)" strokeWidth={1} />
                    {[0, 6, 12, 18, 23].map((h) => (
                        <text key={h} x={X(h)} y={mid - 6} textAnchor="middle" fontSize={9} className="font-mono" fill="var(--foreground-muted)" fillOpacity={0.7}>
                            {String(h).padStart(2, "0")}
                        </text>
                    ))}
                    {sets.map((s, j) => (
                        <path
                            key={`${s.lane}-${s.week}`}
                            ref={(el) => { paths.current[j] = el; }}
                            fill="none"
                            stroke={`url(#${id}-${s.lane})`}
                            strokeWidth={s.week === 0 ? 2.5 : 1.6}
                            strokeLinecap="round"
                            opacity={WEEK_OPACITY[s.week] ?? 0.2}
                        />
                    ))}
                    {hover !== null && (
                        <line x1={X(hover)} x2={X(hover)} y1={4} y2={H - 4} stroke="var(--foreground-muted)" strokeOpacity={0.6} strokeWidth={1} />
                    )}
                    <rect width={W} height={H} fill="transparent" onPointerMove={move} onPointerLeave={leave} />
                </svg>
            )}
        </div>
    );
}
