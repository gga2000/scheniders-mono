"use client";

import React, { useState, useRef, useId, useCallback, useEffect } from "react";
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
    children: React.ReactElement;
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
    children,
}: TooltipProps) {
    const [open, setOpen] = useState(false);
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
                role="tooltip"
                id={id}
                aria-hidden={!open}
                className={cn(
                    "pointer-events-none absolute z-50 whitespace-normal transition-opacity duration-150",
                    SIDE[side],
                    ALIGN[side][align],
                    open ? "opacity-100" : "opacity-0",
                    contentClassName ?? "rounded-lg bg-(--ink,#0a0a0a) text-white text-[11px] px-2 py-1 shadow-lg max-w-xs",
                )}
            >
                {content}
            </span>
        </span>
    );
}
