"use client";

/**
 * Liquid glass highlight for a vertical nav: the active item sits in a drop of
 * water that stretches toward the next item, splits into droplets on long
 * jumps and settles with a ripple. Adapted from Nimbus UI "Waterline"
 * (guglielmogiannattasio.it), turned vertical and toned down.
 *
 * Usage: wrap the nav items, mark each link with data-liquid-key, and put
 * <LiquidNavPending navKey=…/> inside each Next link so the drop moves the
 * moment a link is clicked, before the new route has loaded.
 *
 * Renderers: WebGL water, else a CSS drop (no WebGL, shader rejected, context
 * lost). Before the engine starts (server render, first paint) the wrapper has
 * data-liquid-water="pending", which the items use to show a static highlight.
 */

import { useLinkStatus } from "next/link";
import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { WATER_PAD } from "./liquid-nav-water-physics";
import { canRunWaterEngine, createWaterEngine, type WaterEngine, type WaterRenderer } from "./liquid-nav-water-engine";

type PendingApi = { setPending: (key: string, pending: boolean) => void };

const LiquidNavContext = createContext<PendingApi | null>(null);

type LiquidNavWaterProps = {
    /** data-liquid-key of the item for the current route, or null when none matches. */
    activeKey: string | null;
    /** The water's tint: "dark" for dark panels, "light" for bright ones. */
    tone?: "light" | "dark";
    className?: string;
    children: ReactNode;
};

export function LiquidNavWater({ activeKey, tone = "dark", className, children }: LiquidNavWaterProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dropRef = useRef<HTMLSpanElement>(null);
    const engineRef = useRef<WaterEngine | null>(null);
    const [renderer, setRenderer] = useState<WaterRenderer | "pending">("pending");
    const [pendingKey, setPendingKey] = useState<string | null>(null);
    const targetKey = pendingKey ?? activeKey;
    const dark = tone === "dark";

    const api = useMemo<PendingApi>(() => ({
        setPending: (key, pending) =>
            setPendingKey((current) => (pending ? key : current === key ? null : current)),
    }), []);

    useLayoutEffect(() => {
        const root = rootRef.current, canvas = canvasRef.current, drop = dropRef.current;
        if (!root || !canvas || !drop || !canRunWaterEngine()) return;
        // The engine lives as long as the component; tone and target are pushed in by the effects below.
        const engine = createWaterEngine({ root, canvas, drop, onRenderer: setRenderer });
        engineRef.current = engine;
        return () => {
            engine.destroy();
            engineRef.current = null;
        };
    }, []);

    useLayoutEffect(() => {
        engineRef.current?.setDark(dark);
    }, [dark]);

    useLayoutEffect(() => {
        engineRef.current?.setTarget(targetKey);
    }, [targetKey, renderer]);

    return (
        <LiquidNavContext.Provider value={api}>
            <div ref={rootRef} data-liquid-water={renderer} className={cn("relative isolate", className)}>
                <canvas
                    ref={canvasRef}
                    aria-hidden="true"
                    hidden={renderer !== "gl"}
                    className="pointer-events-none absolute -z-10"
                    style={{ left: -WATER_PAD, top: -WATER_PAD }}
                />
                <span
                    ref={dropRef}
                    aria-hidden="true"
                    hidden={renderer !== "css"}
                    className="pointer-events-none absolute left-0 top-0 -z-10 rounded-full bg-white/[0.14] opacity-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_-2px_6px_rgba(0,162,255,0.2),inset_0_0_0_1px_rgba(255,255,255,0.25),0_6px_16px_-6px_rgba(0,70,140,0.45)] will-change-transform"
                />
                {children}
            </div>
        </LiquidNavContext.Provider>
    );
}

/**
 * Place inside a Next <Link>: while that link's navigation is pending, the drop
 * already moves to it. If the navigation is abandoned, it returns to the route's item.
 */
export function LiquidNavPending({ navKey }: { navKey: string }) {
    const { pending } = useLinkStatus();
    const api = useContext(LiquidNavContext);
    useEffect(() => {
        if (!api || !pending) return;
        api.setPending(navKey, true);
        return () => api.setPending(navKey, false);
    }, [api, navKey, pending]);
    return null;
}
