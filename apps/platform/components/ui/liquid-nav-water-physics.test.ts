import { describe, expect, it } from "vitest";
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
    type WaterState,
    type WaterTarget,
} from "./liquid-nav-water-physics";

const ROW = 44;
const item = (row: number): WaterTarget => ({ cx: WATER_PAD + 100, y: WATER_PAD + ROW / 2 + row * ROW, r: ROW / 2, q: 78 });

function sidebar(): WaterState {
    const s = createWaterState();
    s.width = 200;
    s.height = ROW * 10;
    return s;
}

/** Deterministic stand-in for Math.random. */
function seeded(seed = 7) {
    let x = seed;
    return () => {
        x = (x * 16807) % 2147483647;
        return x / 2147483647;
    };
}

/** Run until the water settles (or give up), 60 fps. */
function settle(s: WaterState, reduceMotion = false, maxFrames = 600): number {
    const random = seeded();
    let now = 1000;
    for (let i = 0; i < maxFrames; i++) {
        now += 1000 / 60;
        stepWater(s, 1 / 60, now, { reduceMotion, random });
        if (!isWaterBusy(s, reduceMotion)) return i + 1;
    }
    return maxFrames;
}

describe("liquid nav water physics", () => {
    it("places the drop on the first target without motion", () => {
        const s = sidebar();
        setWaterTarget(s, item(2), 0, false);
        expect(s.a.x).toBe(item(2).y);
        expect(s.b.x).toBe(item(2).y);
        expect(s.moving).toBe(false);
        expect(isWaterBusy(s, false)).toBe(false);
    });

    it("stretches toward a new item, then settles exactly on it and stops", () => {
        const s = sidebar();
        setWaterTarget(s, item(1), 0, true);
        setWaterTarget(s, item(2), 0, false);
        expect(s.moving).toBe(true);
        let maxSep = 0;
        const random = seeded();
        for (let i = 0, now = 0; i < 20; i++, now += 16) {
            stepWater(s, 1 / 60, now, { reduceMotion: false, random });
            maxSep = Math.max(maxSep, Math.abs(s.a.x - s.b.x));
        }
        expect(maxSep).toBeGreaterThan(5);
        const frames = settle(s);
        expect(frames).toBeLessThan(600);
        expect(s.a.x).toBe(item(2).y);
        expect(s.b.x).toBe(item(2).y);
        expect(s.droplets).toHaveLength(0);
    });

    it("splits into droplets only on long jumps", () => {
        const short = sidebar();
        setWaterTarget(short, item(1), 0, true);
        setWaterTarget(short, item(2), 0, false);
        let shortSplit = false;
        const r1 = seeded();
        for (let i = 0, now = 0; i < 120; i++, now += 16) {
            stepWater(short, 1 / 60, now, { reduceMotion: false, random: r1 });
            shortSplit ||= short.droplets.length > 0;
        }
        expect(shortSplit).toBe(false);

        const long = sidebar();
        setWaterTarget(long, item(0), 0, true);
        setWaterTarget(long, item(8), 0, false);
        let longSplit = false;
        const r2 = seeded();
        for (let i = 0, now = 0; i < 120; i++, now += 16) {
            stepWater(long, 1 / 60, now, { reduceMotion: false, random: r2 });
            longSplit ||= long.droplets.length > 0;
        }
        expect(longSplit).toBe(true);
        expect(long.droplets.length).toBeLessThanOrEqual(MAX_BLOBS - 2);
    });

    it("keeps the drop inside the nav area", () => {
        const s = sidebar();
        setWaterTarget(s, item(9), 0, true);
        setWaterTarget(s, item(0), 0, false);
        const random = seeded();
        for (let i = 0, now = 0; i < 300; i++, now += 16) {
            stepWater(s, 1 / 60, now, { reduceMotion: false, random });
            for (const body of [s.a, s.b]) {
                expect(body.x).toBeGreaterThanOrEqual(WATER_PAD + ROW / 2 - 0.001);
                expect(body.x).toBeLessThanOrEqual(WATER_PAD + s.height - ROW / 2 + 0.001);
            }
        }
    });

    it("jumps straight to the target with reduced motion: no stretch, no droplets, no ripples", () => {
        const s = sidebar();
        setWaterTarget(s, item(0), 0, true);
        setWaterTarget(s, item(8), 0, false);
        stepWater(s, 1 / 60, 16, { reduceMotion: true, random: seeded() });
        expect(s.a.x).toBe(item(8).y);
        expect(s.b.x).toBe(item(8).y);
        expect(s.droplets).toHaveLength(0);
        expect(s.ripples).toHaveLength(0);
        expect(isWaterBusy(s, true)).toBe(false);
    });

    it("never asks for frames while idle", () => {
        const s = sidebar();
        setWaterTarget(s, item(3), 0, true);
        expect(isWaterBusy(s, false)).toBe(false);
        s.mouse.on = true;
        expect(isWaterBusy(s, false)).toBe(true);
        settle(s);
        expect(isWaterBusy(s, false)).toBe(false);
    });

    it("hides the drop when no item matches the route", () => {
        const s = sidebar();
        setWaterTarget(s, item(3), 0, true);
        setWaterTarget(s, null, 0, false);
        const blobs = new Float32Array(MAX_BLOBS * 4);
        const stretch = new Float32Array(MAX_BLOBS);
        packBlobs(s, blobs, stretch);
        expect(Array.from(blobs).every((v) => v === 0)).toBe(true);
        expect(fallbackDropBox(s)).toBeNull();
    });

    it("packs the resting drop as one capsule the size of the item", () => {
        const s = sidebar();
        setWaterTarget(s, item(3), 0, true);
        const blobs = new Float32Array(MAX_BLOBS * 4);
        const stretch = new Float32Array(MAX_BLOBS);
        packBlobs(s, blobs, stretch);
        expect(Array.from(blobs.slice(0, 4))).toEqual([item(3).cx, item(3).y, 78, 22]);
        expect(fallbackDropBox(s)).toEqual({ top: WATER_PAD + 3 * ROW, height: ROW, left: WATER_PAD, width: 200 });
    });

    it("keeps at most the newest ripples", () => {
        const s = sidebar();
        for (let i = 0; i < MAX_RIPPLES + 3; i++) addRipple(s, i, i, 1);
        expect(s.ripples).toHaveLength(MAX_RIPPLES);
        const out = new Float32Array(MAX_RIPPLES * 4);
        packRipples(s, out);
        expect(out[0]).toBe(3);
    });
});
