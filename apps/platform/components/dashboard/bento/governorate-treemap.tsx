"use client";

import { useEffect, useState } from "react";
import { useElementSize } from "@/hooks/use-element-size";
import { squarify } from "./chart-geometry";
import { CountUp } from "./count-up";
import type { TooltipContent } from "./chart-tooltip";

export interface TreemapTile {
    key: string;
    name: string;
    value: number;
    /** CSS color of the tile. */
    color: string;
    /** Text color that reads on `color`. */
    ink: string;
}

interface GovernorateTreemapProps {
    tiles: TreemapTile[];
    label: string;
    describe: (tile: TreemapTile, share: string) => TooltipContent;
    onTip: (x: number, y: number, content: TooltipContent) => void;
    onTipEnd: () => void;
}

/** Gap between tiles, in px. */
const GAP = 6;
const EASE = "cubic-bezier(.2,.9,.25,1)";

/**
 * Squarified treemap whose tiles glide to their new place and size when the data
 * changes (a period switch re-flows the whole map). Tiles grow out of the centre
 * on first paint. A tile shows as much as fits: name, count and share badge,
 * then count only, then colour only.
 */
export function GovernorateTreemap({ tiles, label, describe, onTip, onTipEnd }: GovernorateTreemapProps) {
    const [ref, { width: W, height: H }] = useElementSize<HTMLDivElement>();
    const [placed, setPlaced] = useState(false);

    useEffect(() => {
        if (!W || placed) return;
        // Two frames: the first commits the centred start, the second the layout,
        // so the browser has a "from" to transition out of.
        let inner = 0;
        const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setPlaced(true)); });
        return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }, [W, placed]);

    const total = tiles.reduce((s, t) => s + t.value, 0) || 1;
    // Lay out on a canvas one gap larger, then inset each tile by the gap: equal
    // gutters everywhere and flush outer edges.
    const rects = W ? squarify(tiles.map((t) => ({ key: t.key, value: t.value, item: t })), W + GAP, H + GAP) : [];

    return (
        <div ref={ref} className="relative h-[320px]" role="img" aria-label={label}>
            {rects.map((r) => {
                const t = r.item;
                const w = Math.max(0, r.w - GAP), h = Math.max(0, r.h - GAP);
                const share = `${((r.value / total) * 100).toFixed(1).replace(/\.0$/, "")}%`;
                const digits = r.value.toLocaleString("en-US").length;
                let fontSize = Math.min(30, (w - 24 - 52) / (digits * 0.62));
                let showShare = true;
                if (fontSize < 17) { showShare = false; fontSize = Math.min(30, (w - 24) / (digits * 0.62)); }
                const showValue = fontSize >= 12 && h >= 54 && w >= 56;
                const showName = h >= 78 && w >= 92;
                return (
                    <div
                        key={r.key}
                        className="absolute flex flex-col justify-between overflow-hidden rounded-[14px] p-3 hover:brightness-[1.06] motion-reduce:transition-none"
                        style={{
                            left: placed ? r.x : W / 2,
                            top: placed ? r.y : H / 2,
                            width: placed ? w : 0,
                            height: placed ? h : 0,
                            background: t.color,
                            color: t.ink,
                            transition: `left .7s ${EASE}, top .7s ${EASE}, width .7s ${EASE}, height .7s ${EASE}, filter .2s`,
                        }}
                        onPointerMove={(e) => onTip(e.clientX, e.clientY, describe(t, share))}
                        onPointerLeave={onTipEnd}
                    >
                        <div className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]">
                            <span aria-hidden="true" className="size-2 shrink-0 rounded-[3px] bg-current opacity-80" />
                            {showName && <span className="truncate">{t.name}</span>}
                        </div>
                        {showValue && (
                            <div className="flex items-end justify-between gap-1.5">
                                <span className="font-mono font-medium leading-[.9] tracking-[-0.04em] tabular-nums" style={{ fontSize }}>
                                    <CountUp value={r.value} durationMs={900} />
                                </span>
                                {showShare && (
                                    <span className="rounded-md bg-black/80 px-[5px] py-[3px] font-mono text-[10px] font-medium tracking-[-0.02em] text-white">{share}</span>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
