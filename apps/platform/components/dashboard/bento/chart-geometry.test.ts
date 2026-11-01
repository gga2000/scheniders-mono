import { describe, expect, it } from "vitest";
import { niceStep, radarPath, radarPoint, radarShape, smoothPath, squarify } from "./chart-geometry";

describe("smoothPath", () => {
    it("is empty for no points and a bare move for one", () => {
        expect(smoothPath([])).toBe("");
        expect(smoothPath([[3, 4]])).toBe("M3,4");
    });

    it("passes through every point, one cubic segment per gap", () => {
        const pts = [[0, 0], [10, 5], [20, 0], [30, 8]] as const;
        const d = smoothPath(pts);
        expect(d.startsWith("M0,0")).toBe(true);
        expect(d.match(/C/g)).toHaveLength(3);
        for (const [x, y] of pts.slice(1)) expect(d).toContain(` ${x},${y}`);
    });
});

describe("niceStep", () => {
    it("rounds to 1/2/2.5/5 × 10^n", () => {
        expect(niceStep(100, 4)).toBe(25);
        expect(niceStep(7, 4)).toBe(2);
        expect(niceStep(1_800_000, 4)).toBe(500_000);
    });

    it("falls back to 1 for an empty span", () => {
        expect(niceStep(0)).toBe(1);
        expect(niceStep(Number.NaN)).toBe(1);
    });
});

describe("squarify", () => {
    const tiles = [
        { key: "a", value: 6, item: null },
        { key: "b", value: 6, item: null },
        { key: "c", value: 4, item: null },
        { key: "d", value: 3, item: null },
        { key: "e", value: 2, item: null },
        { key: "f", value: 2, item: null },
        { key: "g", value: 1, item: null },
        { key: "zero", value: 0, item: null },
    ];

    it("fills the canvas exactly, areas proportional to value", () => {
        const rects = squarify(tiles, 600, 400);
        expect(rects.map((r) => r.key)).not.toContain("zero");
        const area = rects.reduce((s, r) => s + r.w * r.h, 0);
        expect(area).toBeCloseTo(600 * 400, 6);
        for (const r of rects) expect((r.w * r.h) / (600 * 400)).toBeCloseTo(r.value / 24, 6);
    });

    it("keeps every tile inside the canvas without overlap", () => {
        const rects = squarify(tiles, 600, 400);
        for (const r of rects) {
            expect(r.x).toBeGreaterThanOrEqual(-1e-9);
            expect(r.y).toBeGreaterThanOrEqual(-1e-9);
            expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-9);
            expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-9);
        }
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i], b = rects[j];
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            expect(ox <= 1e-6 || oy <= 1e-6).toBe(true);
        }
    });

    it("returns nothing for an empty or zero-size canvas", () => {
        expect(squarify([], 100, 100)).toEqual([]);
        expect(squarify(tiles, 0, 100)).toEqual([]);
    });
});

describe("radar", () => {
    const months = [10, 12, 30, 45, 20, 8, 5, 6, 9, 15, 25, 18];

    it("stays inside the ring and bulges toward the busy months", () => {
        const f = radarShape(months);
        const at = (i: number) => f((i / 12) * Math.PI * 2);
        for (let j = 0; j < 360; j++) expect(f((j / 360) * Math.PI * 2)).toBeLessThan(1.15);
        expect(at(3)).toBeGreaterThan(at(6));
        expect(at(3)).toBeGreaterThan(0.85);
    });

    it("draws a flat year as a circle", () => {
        const f = radarShape(new Array(12).fill(7));
        expect(f(0)).toBeCloseTo(f(Math.PI), 9);
    });

    it("puts angle 0 at 12 o'clock and keeps a hollow core", () => {
        const [x, y] = radarPoint(100, 100, 50, 0, 0);
        expect(x).toBeCloseTo(100, 9);
        expect(y).toBeCloseTo(90, 9);
    });

    it("emits a closed path", () => {
        const d = radarPath(months, 100, 100, 80, 36);
        expect(d.startsWith("M")).toBe(true);
        expect(d.endsWith("Z")).toBe(true);
        expect(d.match(/L/g)).toHaveLength(36);
    });
});
