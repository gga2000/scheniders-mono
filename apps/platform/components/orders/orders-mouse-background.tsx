"use client";

import { useEffect, useRef } from "react";

/**
 * Experimental, opt-in backdrop for the orders page: a faint dot grid that
 * swells into a glowing lens of drifting glyphs under the cursor.
 *
 * Cost model: the resting grid is plain CSS (no JS, no canvas). The canvas
 * only paints the few hundred cells inside the lens, and its frame loop runs
 * only while the lens is visible, so an idle page does zero work.
 */

const TAU = Math.PI * 2;
const SPACING = 24;
const RADIUS = 150;
const GLYPHS = Array.from("ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789+-<>|/{}[]=#%&$@λΣΩπ∞≈≠±§×÷");
const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const sstep = (e0: number, e1: number, x: number): number => {
    const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return k * k * (3 - 2 * k);
};

// Deterministic per-cell noise so glyphs/hues don't reshuffle on every redraw.
const hash = (n: number): number => {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
};

export function OrdersMouseBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce) return; // the CSS dot grid alone is the reduced-motion version

        let raf = 0;
        let disposed = false;
        let last = 0;
        let w = 0;
        let h = 0;
        let presence = 0;
        let active = false;
        const ptr = { tx: 0, ty: 0, x: 0, y: 0, seen: false };
        let dark = false;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = window.innerWidth;
            h = window.innerHeight;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const paint = (dt: number, tt: number) => {
            ctx.clearRect(0, 0, w, h);
            presence += ((active ? 1 : 0) - presence) * (1 - Math.exp(-dt * (active ? 7 : 4)));
            const k = 1 - Math.exp(-dt * 20);
            ptr.x += (ptr.tx - ptr.x) * k;
            ptr.y += (ptr.ty - ptr.y) * k;
            if (presence < 0.01 && !active) {
                presence = 0;
                return false;
            }

            const re = RADIUS * (1 - Math.pow(1 - presence, 3));
            const c0 = Math.max(0, Math.floor((ptr.x - re) / SPACING));
            const c1 = Math.floor((ptr.x + re) / SPACING);
            const r0 = Math.max(0, Math.floor((ptr.y - re) / SPACING));
            const r1 = Math.floor((ptr.y + re) / SPACING);

            // Soft tinted glow so the lens reads as a place, not just glyphs.
            const glow = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, re * 1.4);
            const gA = dark ? 0.1 : 0.07;
            glow.addColorStop(0, `hsla(230,80%,60%,${gA * presence})`);
            glow.addColorStop(1, "hsla(230,80%,60%,0)");
            ctx.fillStyle = glow;
            ctx.fillRect(ptr.x - re * 1.4, ptr.y - re * 1.4, re * 2.8, re * 2.8);

            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (let r = r0; r <= r1; r++) {
                for (let c = c0; c <= c1; c++) {
                    const bx = c * SPACING + SPACING / 2;
                    const by = r * SPACING + SPACING / 2;
                    const dx = bx - ptr.x;
                    const dy = by - ptr.y;
                    const d = Math.hypot(dx, dy);
                    if (d >= re) continue;
                    const u = d / re;
                    const m = sstep(0.98, 0.25, u) * presence;
                    if (m < 0.02) continue;

                    // Bulge cells outward so the lens looks spherical.
                    const s = Math.sin(u * (Math.PI / 2));
                    const rr = re * (u * 0.4 + s * 0.6);
                    const x = d > 0.001 ? ptr.x + (dx / d) * rr : bx;
                    const y = d > 0.001 ? ptr.y + (dy / d) * rr : by;
                    const z = Math.cos(u * (Math.PI / 2));

                    const id = r * 4096 + c;
                    // Each cell re-rolls its glyph a few times a second.
                    const tick = Math.floor(tt * (1 + z * 3) + hash(id) * 10);
                    const glyph = GLYPHS[Math.floor(hash(id + tick * 0.37) * GLYPHS.length)];
                    const hue = 215 + 80 * Math.sin(tt * 0.5 + hash(id) * TAU);
                    const alpha = Math.min(0.42, m * (0.15 + 0.35 * z));

                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = dark ? `hsl(${hue},85%,75%)` : `hsl(${hue},65%,42%)`;
                    ctx.font = `${(11 + 5 * z).toFixed(1)}px ${FONT}`;
                    ctx.fillText(glyph, x, y);
                }
            }
            ctx.globalAlpha = 1;
            return true;
        };

        let t = 0;
        const frame = (now: number) => {
            raf = 0;
            if (disposed) return;
            const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
            last = now;
            t += dt;
            if (paint(dt, t)) raf = requestAnimationFrame(frame);
        };
        const wake = () => {
            if (raf || disposed || document.hidden) return;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        };

        const onMove = (e: PointerEvent) => {
            if (e.pointerType === "touch") return;
            ptr.tx = e.clientX;
            ptr.ty = e.clientY;
            if (!ptr.seen || presence < 0.02) {
                ptr.x = ptr.tx;
                ptr.y = ptr.ty;
                ptr.seen = true;
                dark = document.documentElement.classList.contains("dark");
            }
            active = true;
            wake();
        };
        const onLeave = () => {
            active = false;
            wake();
        };
        const onVis = () => {
            if (document.hidden) {
                active = false;
                presence = 0;
                cancelAnimationFrame(raf);
                raf = 0;
                ctx.clearRect(0, 0, w, h);
            }
        };

        resize();
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("resize", resize);
        window.addEventListener("blur", onLeave);
        document.addEventListener("visibilitychange", onVis);
        document.documentElement.addEventListener("pointerleave", onLeave);

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("resize", resize);
            window.removeEventListener("blur", onLeave);
            document.removeEventListener("visibilitychange", onVis);
            document.documentElement.removeEventListener("pointerleave", onLeave);
        };
    }, []);

    return (
        <div
            aria-hidden="true"
            className="orders-mouse-bg pointer-events-none fixed inset-0 z-0"
        >
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        </div>
    );
}
