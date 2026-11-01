"use client";

import React, { useState, useRef, useId, useCallback, useEffect, useLayoutEffect } from "react";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

interface TooltipProps {
    content: React.ReactNode;
    side?: Side;
    align?: Align;
    delay?: number;
    className?: string;
    contentClassName?: string;
    /**
     * Sides to try, in order, when `side` would be cut off by the viewport or by a scrolling
     * ancestor (a drawer body): the first that fits is used, else the one cut off least.
     * Empty by default, so the tooltip always opens on `side`.
     */
    fallbackSides?: Side[];
    children: React.ReactElement;
}

/** The visible box the tooltip must fit in: the viewport cut down by every clipping ancestor. */
function clipBounds(el: HTMLElement) {
    let top = 0, left = 0, bottom = window.innerHeight, right = window.innerWidth;
    for (let node = el.parentElement; node; node = node.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(node);
        if (overflowX === "visible" && overflowY === "visible") continue;
        const r = node.getBoundingClientRect();
        top = Math.max(top, r.top); left = Math.max(left, r.left);
        bottom = Math.min(bottom, r.bottom); right = Math.min(right, r.right);
    }
    return { top, left, bottom, right };
}

/** How far a box runs past the bounds, summed over its four edges (0 when it fits). */
function overflow(box: DOMRect, b: ReturnType<typeof clipBounds>) {
    return Math.max(0, b.top - box.top) + Math.max(0, box.bottom - b.bottom)
        + Math.max(0, b.left - box.left) + Math.max(0, box.right - b.right);
}

/** Where a tooltip of `size` sits on `side` of `anchor` with `align`, as SIDE/ALIGN place it (8px gap). */
function boxAt(s: Side, align: Align, anchor: DOMRect, size: { width: number; height: number }) {
    const gap = 8;
    const { width: w, height: h } = size;
    if (s === "top" || s === "bottom") {
        const x = align === "start" ? anchor.left : align === "end" ? anchor.right - w : anchor.left + (anchor.width - w) / 2;
        return new DOMRect(x, s === "top" ? anchor.top - gap - h : anchor.bottom + gap, w, h);
    }
    const y = align === "start" ? anchor.top : align === "end" ? anchor.bottom - h : anchor.top + (anchor.height - h) / 2;
    return new DOMRect(s === "left" ? anchor.left - gap - w : anchor.right + gap, y, w, h);
}

const SIDE: Record<Side, string> = {
    top: "bottom-full mb-2",
    bottom: "top-full mt-2",
    left: "right-full mr-2",
    right: "left-full ml-2",
};

const ALIGN: Record<Side, Record<Align, string>> = {
    top: { start: "left-0", center: "left-1/2 -translate-x-1/2", end: "right-0" },
    bottom: { start: "left-0", center: "left-1/2 -translate-x-1/2", end: "right-0" },
    left: { start: "top-0", center: "top-1/2 -translate-y-1/2", end: "bottom-0" },
    right: { start: "top-0", center: "top-1/2 -translate-y-1/2", end: "bottom-0" },
};

export function Tooltip({
    content,
    side = "top",
    align = "center",
    delay = 150,
    className,
    contentClassName,
    fallbackSides,
    children,
}: TooltipProps) {
    const [open, setOpen] = useState(false);
    const [placed, setPlaced] = useState<Side>(side);
    const tipRef = useRef<HTMLSpanElement>(null);
    const id = useId();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clear = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
    }, []);
    const show = useCallback(() => {
        clear();
        timerRef.current = setTimeout(() => setOpen(true), delay);
    }, [clear, delay]);
    const hide = useCallback(() => {
        clear();
        setOpen(false);
    }, [clear]);

    useEffect(() => () => clear(), [clear]);
    const fallbackKey = fallbackSides?.join(",") ?? "";
    // Measured before paint on each open, so a moved tooltip never shows a frame on the clipped side.
    useLayoutEffect(() => {
        const tip = tipRef.current;
        const anchor = tip?.parentElement?.getBoundingClientRect();
        if (!open || !fallbackKey || !tip || !anchor) return;
        const bounds = clipBounds(tip);
        const size = tip.getBoundingClientRect();
        const order = [side, ...(fallbackKey.split(",") as Side[])];
        const scored = order.map((s) => ({ s, cut: overflow(boxAt(s, align, anchor, size), bounds) }));
        const best = scored.find((o) => o.cut === 0) ?? scored.reduce((a, b) => (b.cut < a.cut ? b : a));
        setPlaced(best.s);
    }, [open, fallbackKey, side, align]);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, hide]);

    if (!content) return children;

    return (
        <span
            className={cn("relative inline-flex", className)}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            {React.cloneElement(
                children as React.ReactElement<{ "aria-describedby"?: string }>,
                { "aria-describedby": open ? id : undefined },
            )}
            <span
                ref={tipRef}
                role="tooltip"
                id={id}
                aria-hidden={!open}
                className={cn(
                    "pointer-events-none absolute z-50 whitespace-normal transition-opacity duration-150",
                    SIDE[fallbackSides ? placed : side],
                    ALIGN[fallbackSides ? placed : side][align],
                    open ? "opacity-100" : "opacity-0",
                    contentClassName ?? "rounded-lg bg-(--ink,#0a0a0a) text-white text-[11px] px-2 py-1 shadow-lg max-w-xs",
                )}
            >
                {content}
            </span>
        </span>
    );
}
