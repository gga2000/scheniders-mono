import { useEffect, useRef, type RefObject } from "react";

interface Line {
    id: string;
    quantity: number;
}

/**
 * When a line is added or its quantity goes up, scroll the list so that line is in view and
 * flash it once. Long sales otherwise add the new bottle below the fold, on the till and on
 * the customer screen alike. The list's children must be the lines, in order.
 */
export function useShowChangedLine(listRef: RefObject<HTMLElement | null>, lines: Line[], scope: string) {
    const before = useRef<{ scope: string; qty: Map<string, number> } | null>(null);

    useEffect(() => {
        const prev = before.current;
        before.current = { scope, qty: new Map(lines.map((l) => [l.id, l.quantity])) };
        // First render, an empty cart, or a different ticket opened: nothing was "just added".
        if (prev === null || prev.scope !== scope || prev.qty.size === 0) return;
        const at = lines.findIndex((l) => (prev.qty.get(l.id) ?? 0) < l.quantity);
        const el = at < 0 ? null : listRef.current?.children.item(at);
        if (!(el instanceof HTMLElement)) return;
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
        if (!calm) {
            const rest = getComputedStyle(el).backgroundColor;
            el.animate([{ backgroundColor: "#FDFFC2" }, { backgroundColor: rest }], { duration: 900, easing: "ease-out" });
        }
    }, [listRef, lines, scope]);
}
