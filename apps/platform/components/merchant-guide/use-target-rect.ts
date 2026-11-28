"use client";

// Follows a real element on the page: where it is on screen right now. Pages
// load data, open panels and scroll, so the element can appear late or move;
// one animation-frame loop keeps the light on it, and only re-renders when
// the box actually changes.

import { useEffect, useState } from "react";

export interface TargetBox {
    top: number;
    left: number;
    width: number;
    height: number;
}

/** The first of several elements found on screen, and which one it is (-1 for a moment while the list changes). */
export interface TargetHit {
    box: TargetBox;
    index: number;
}

function sameBox(a: TargetBox, b: TargetBox): boolean {
    return (
        Math.abs(a.top - b.top) < 0.5 &&
        Math.abs(a.left - b.left) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5
    );
}

function sameHit(a: TargetHit | null, b: TargetHit | null): boolean {
    if (a === null || b === null) return a === b;
    return a.index === b.index && sameBox(a.box, b.box);
}

function visibleBox(el: Element): TargetBox | null {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Joins selectors into one stable key, so a list made fresh each render doesn't restart the loop. */
const KEY_SEPARATOR = "\n";

/**
 * Lights the first of `selectors` that is on screen, checked in order every
 * frame: when an earlier one appears (a menu opens), the light moves to it.
 */
export function useFirstTargetBox(selectors: readonly string[] | null): TargetHit | null {
    const key = selectors && selectors.length > 0 ? selectors.join(KEY_SEPARATOR) : null;
    const [hit, setHit] = useState<{ key: string; hit: TargetHit | null } | null>(null);

    useEffect(() => {
        if (key === null) return;
        const list = key.split(KEY_SEPARATOR);
        let frame = 0;
        // undefined = nothing reported yet for this key, so the first frame
        // always replaces the previous key's hit.
        let last: TargetHit | null | undefined = undefined;
        // Each element is scrolled into view once, the first time it is lit.
        const scrolled = new Set<number>();
        const tick = (): void => {
            let next: TargetHit | null = null;
            for (let index = 0; index < list.length; index++) {
                const el = document.querySelector(list[index]);
                const box = el ? visibleBox(el) : null;
                if (!el || !box) continue;
                next = { box, index };
                if (!scrolled.has(index)) {
                    scrolled.add(index);
                    const offscreen = box.top < 0 || box.top + box.height > window.innerHeight;
                    if (offscreen) el.scrollIntoView({ block: "center", behavior: "smooth" });
                }
                break;
            }
            if (last === undefined || !sameHit(last, next)) {
                last = next;
                setHit({ key, hit: next });
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [key]);

    if (key === null || hit === null || hit.hit === null) return null;
    // Until the first frame finds the new list's element, the light stays
    // where it was so it glides over; index -1 says which one isn't known yet.
    return hit.key === key ? hit.hit : { box: hit.hit.box, index: -1 };
}

export function useTargetBox(selector: string | null): TargetBox | null {
    return useFirstTargetBox(selector ? [selector] : null)?.box ?? null;
}
