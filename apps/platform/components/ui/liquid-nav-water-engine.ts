/**
 * Imperative engine behind <LiquidNavWater>: measures the active item, runs the
 * drop physics on requestAnimationFrame and paints either the WebGL water or the
 * CSS fallback drop.
 *
 * The frame loop only runs while something moves (a jump, droplets, ripples,
 * the cursor easing in or out). Once the water settles it stops completely, so
 * an idle sidebar costs no frames. It also stops while the tab is hidden or the
 * nav is off screen.
 */

import { createWaterGL, drawWater, type WaterGL } from "./liquid-nav-water-gl";
import {
    MAX_BLOBS,
    MAX_RIPPLES,
    WATER_PAD,
    addRipple,
    createWaterState,
    fallbackDropBox,
    isWaterBusy,
    packBlobs,
    packRipples,
    setWaterTarget,
    stepWater,
} from "./liquid-nav-water-physics";

export type WaterRenderer = "gl" | "css";

export type WaterEngine = {
    /** Move the drop to the item carrying data-liquid-key={key}; null hides it. */
    setTarget: (key: string | null) => void;
    setDark: (dark: boolean) => void;
    destroy: () => void;
};

type EngineOptions = {
    root: HTMLElement;
    canvas: HTMLCanvasElement;
    drop: HTMLElement;
    onRenderer: (renderer: WaterRenderer) => void;
};

/** Higher pixel ratios cost fill rate for no visible gain on a soft, blurry surface. */
const MAX_DPR = 1.5;
/** Longest step the physics takes, so a dropped frame never makes the springs explode. */
const MAX_DT = 1 / 30;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function findItem(root: HTMLElement, key: string): HTMLElement | null {
    for (const el of root.querySelectorAll<HTMLElement>("[data-liquid-key]")) {
        if (el.dataset.liquidKey === key) return el;
    }
    return null;
}

/** The engine needs layout observers; without them the static highlight stays. */
export function canRunWaterEngine(): boolean {
    return typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && typeof ResizeObserver === "function"
        && typeof IntersectionObserver === "function";
}

export function createWaterEngine({ root, canvas, drop, onRenderer }: EngineOptions): WaterEngine {
    const s = createWaterState();
    const blobs = new Float32Array(MAX_BLOBS * 4);
    const stretch = new Float32Array(MAX_BLOBS);
    const ripples = new Float32Array(MAX_RIPPLES * 4);
    const motionQuery = window.matchMedia(REDUCED_MOTION);
    let reduceMotion = motionQuery.matches;
    let dark = true;
    let key: string | null = null;
    let raf = 0;
    let last = 0;
    let visible = document.visibilityState === "visible";
    let onScreen = true;
    let lastWidth = -1;
    let gl: WaterGL | null = createWaterGL(canvas);
    onRenderer(gl ? "gl" : "css");

    const dpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

    function paint(): void {
        if (gl) {
            packBlobs(s, blobs, stretch);
            packRipples(s, ripples);
            const ratio = dpr();
            drawWater(gl, {
                width: s.width + WATER_PAD * 2,
                height: s.height + WATER_PAD * 2,
                dpr: ratio,
                time: s.time,
                // The whole canvas: the bleed is there so the drop is never cut at the edges.
                area: [0, 0, s.width + WATER_PAD * 2, s.height + WATER_PAD * 2],
                blobs,
                stretch,
                ripples,
                mouse: [s.mouse.x, s.mouse.y, s.mouse.strength],
                dark,
                ambient: s.ambient,
            });
            return;
        }
        const box = fallbackDropBox(s);
        drop.style.opacity = box ? "1" : "0";
        if (!box) return;
        drop.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
        drop.style.width = `${box.width}px`;
        drop.style.height = `${box.height}px`;
    }

    function tick(now: number): void {
        const dt = Math.min((now - last) / 1000, MAX_DT);
        last = now;
        stepWater(s, dt, now, { reduceMotion, random: Math.random });
        paint();
        raf = visible && onScreen && isWaterBusy(s, reduceMotion) ? requestAnimationFrame(tick) : 0;
    }

    function wake(): void {
        if (raf || !visible || !onScreen) return;
        last = performance.now();
        raf = requestAnimationFrame(tick);
    }

    function sizeCanvas(width: number, height: number): void {
        const ratio = dpr();
        const w = width + WATER_PAD * 2;
        const h = height + WATER_PAD * 2;
        const pw = Math.round(w * ratio);
        const ph = Math.round(h * ratio);
        if (canvas.width !== pw || canvas.height !== ph) {
            canvas.width = pw;
            canvas.height = ph;
        }
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
    }

    /** Re-read the layout. `snap` jumps the drop into place instead of animating. */
    function measure(snap: boolean): void {
        // The wrapper's padding box is the canvas; its content box is the nav area.
        const rootRect = root.getBoundingClientRect();
        s.width = Math.max(0, rootRect.width - WATER_PAD * 2);
        s.height = Math.max(0, rootRect.height - WATER_PAD * 2);
        sizeCanvas(s.width, s.height);
        const el = key ? findItem(root, key) : null;
        if (!el) {
            setWaterTarget(s, null, performance.now(), true);
            paint();
            return;
        }
        const r = el.getBoundingClientRect();
        const half = r.height / 2;
        setWaterTarget(
            s,
            {
                cx: r.left - rootRect.left + r.width / 2,
                y: r.top - rootRect.top + half,
                r: half,
                q: Math.max(0, r.width / 2 - half),
            },
            performance.now(),
            snap || reduceMotion,
        );
        paint();
        wake();
    }

    const local = (e: PointerEvent) => {
        const r = root.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onPointerMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        const p = local(e);
        s.mouse.x = p.x;
        s.mouse.y = p.y;
        s.mouse.on = true;
        wake();
    };
    const onPointerLeave = () => {
        s.mouse.on = false;
        wake();
    };
    const onPointerDown = (e: PointerEvent) => {
        if (reduceMotion) return;
        const p = local(e);
        addRipple(s, p.x, p.y, 0.5);
        wake();
    };
    const onMotionChange = () => {
        reduceMotion = motionQuery.matches;
        measure(true);
    };
    const onVisibility = () => {
        visible = document.visibilityState === "visible";
        wake();
    };
    const onContextLost = (e: Event) => {
        // preventDefault keeps the context restorable; the CSS drop takes over now.
        e.preventDefault();
        gl = null;
        onRenderer("css");
        paint();
    };

    const resize = new ResizeObserver(() => {
        const width = root.getBoundingClientRect().width;
        // A width change (collapse/expand) moves every item sideways: snap.
        // A height change (a sub-menu opening) only shifts rows: animate.
        const widthChanged = Math.abs(width - lastWidth) > 0.5;
        lastWidth = width;
        measure(widthChanged);
    });
    const intersection = new IntersectionObserver(([entry]) => {
        onScreen = entry?.isIntersecting ?? true;
        wake();
    });

    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerleave", onPointerLeave);
    root.addEventListener("pointerdown", onPointerDown);
    motionQuery.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onContextLost);
    resize.observe(root);
    intersection.observe(root);

    return {
        setTarget(next) {
            const first = key === null;
            key = next;
            measure(first);
        },
        setDark(next) {
            dark = next;
            paint();
        },
        destroy() {
            cancelAnimationFrame(raf);
            raf = 0;
            resize.disconnect();
            intersection.disconnect();
            root.removeEventListener("pointermove", onPointerMove);
            root.removeEventListener("pointerleave", onPointerLeave);
            root.removeEventListener("pointerdown", onPointerDown);
            motionQuery.removeEventListener("change", onMotionChange);
            document.removeEventListener("visibilitychange", onVisibility);
            canvas.removeEventListener("webglcontextlost", onContextLost);
        },
    };
}
