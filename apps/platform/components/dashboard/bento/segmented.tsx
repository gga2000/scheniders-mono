"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface SegmentedProps<V extends string | number> {
    items: { value: V; label: string }[];
    value: V;
    onChange: (value: V) => void;
    label: string;
}

/** A compact segmented control whose selection thumb slides between options. */
export function Segmented<V extends string | number>({ items, value, onChange, label }: SegmentedProps<V>) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const [thumb, setThumb] = useState({ x: 0, w: 0 });
    const index = items.findIndex((i) => i.value === value);

    useLayoutEffect(() => {
        const b = refs.current[index];
        if (!b) return;
        const next = { x: b.offsetLeft, w: b.offsetWidth };
        setThumb((t) => (t.x === next.x && t.w === next.w ? t : next));
    }, [index, items]);

    return (
        <div role="tablist" aria-label={label} className="relative inline-grid h-[30px] auto-cols-fr grid-flow-col rounded-[10px] bg-[var(--background-soft)] p-[2px]">
            <div
                aria-hidden="true"
                className="absolute bottom-[2px] top-[2px] left-0 rounded-[8px] bg-[var(--bento-thumb)] shadow-sm ring-1 ring-[var(--card-border)] transition-[transform,width] duration-300 ease-[cubic-bezier(.2,.9,.25,1)] motion-reduce:transition-none"
                style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
            />
            {items.map((it, i) => (
                <button
                    key={it.value}
                    ref={(el) => { refs.current[i] = el; }}
                    role="tab"
                    type="button"
                    aria-selected={it.value === value}
                    onClick={() => onChange(it.value)}
                    className={`relative z-10 rounded-[8px] px-3 text-xs font-medium tracking-[-0.01em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${it.value === value ? "text-foreground" : "text-[var(--foreground-muted)] hover:text-foreground"}`}
                >
                    {it.label}
                </button>
            ))}
        </div>
    );
}
