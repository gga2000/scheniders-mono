"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface TooltipRow {
    label: string;
    value: string;
    color?: string;
}
export interface TooltipContent {
    title: string;
    rows: TooltipRow[];
}
type Anchored = TooltipContent & { x: number; y: number };

/**
 * A pointer tooltip for the bento charts. Rendered into document.body: the cards
 * animate `transform` on mount, and a transformed ancestor would otherwise become
 * the containing block of a `position: fixed` tooltip and misplace it.
 */
export function useChartTooltip(): {
    show: (x: number, y: number, content: TooltipContent) => void;
    hide: () => void;
    element: ReactNode;
} {
    const [tip, setTip] = useState<Anchored | null>(null);
    const show = useCallback((x: number, y: number, content: TooltipContent) => setTip({ ...content, x, y }), []);
    const hide = useCallback(() => setTip(null), []);
    return { show, hide, element: <ChartTooltip tip={tip} /> };
}

function ChartTooltip({ tip }: { tip: Anchored | null }) {
    const box = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: 0, top: 0 });

    // Measure, then flip to stay on screen: left of the pointer near the right
    // edge, below it near the top.
    useLayoutEffect(() => {
        if (!tip || !box.current) return;
        const r = box.current.getBoundingClientRect();
        let left = tip.x + 14;
        let top = tip.y - r.height - 12;
        if (left + r.width > window.innerWidth - 8) left = tip.x - r.width - 14;
        if (top < 8) top = tip.y + 16;
        setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
    }, [tip]);

    if (typeof document === "undefined") return null;
    return createPortal(
        <div
            ref={box}
            role="tooltip"
            className={`pointer-events-none fixed z-[70] whitespace-nowrap rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/95 px-2.5 py-2 text-xs text-foreground shadow-lg backdrop-blur-md transition-opacity duration-150 ${tip ? "opacity-100" : "opacity-0"}`}
            style={{ left: pos.left, top: pos.top }}
        >
            {tip && (
                <>
                    <div className="mb-1 text-[var(--foreground-muted)]">{tip.title}</div>
                    {tip.rows.map((r) => (
                        <div key={r.label} className="flex items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 text-[var(--foreground-muted)]">
                                {r.color && <i className="inline-block size-2 rounded-[2px]" style={{ background: r.color }} />}
                                {r.label}
                            </span>
                            <b className="font-mono font-medium tabular-nums tracking-[-0.04em]">{r.value}</b>
                        </div>
                    ))}
                </>
            )}
        </div>,
        document.body,
    );
}
