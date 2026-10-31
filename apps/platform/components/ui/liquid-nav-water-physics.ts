/**
 * Physics for the sidebar's liquid drop ("Waterline", turned vertical).
 *
 * The active-item highlight is a drop of water with two edges (bodies) on the
 * vertical axis. When the target moves, the edge facing the direction of travel
 * is stiff and leads; the other lags, so the drop stretches and then pulls back
 * together. Long jumps break the neck into a few small droplets that fall back
 * into the drop, and arrival sends a ripple.
 *
 * All coordinates are CSS pixels in the water canvas space: the nav area offset
 * by WATER_PAD on each side, so shadows and ripples can bleed past the edges.
 * Everything here is pure state + math so it can be unit tested without a DOM.
 */

export const WATER_PAD = 14;
/** Uniform array sizes in the shader: 2 drop bodies + 4 droplets, 6 ripples. */
export const MAX_BLOBS = 6;
export const MAX_RIPPLES = 6;
const MAX_DROPLETS = MAX_BLOBS - 2;
const RIPPLE_LIFETIME_S = 2.4;
/** Gap (beyond the drop's own height) the edges must open before the neck breaks. */
const SPLIT_GAP_PX = 70;

type Body = { x: number; v: number };
type Droplet = { x: number; y: number; vx: number; vy: number; r: number; k: number };
type Ripple = { x: number; y: number; age: number; amp: number };

export type WaterTarget = {
    /** Horizontal centre of the active item. */
    cx: number;
    /** Vertical centre of the active item. */
    y: number;
    /** Half the item height: the drop's corner radius. */
    r: number;
    /** Half the straight horizontal run of the capsule (half width minus r). */
    q: number;
};

export type WaterState = {
    /** Edge bodies on the vertical axis. */
    a: Body;
    b: Body;
    /** Stretch along the direction of travel (1 = at rest). */
    sy: Body;
    lead: 0 | 1;
    /** Until this time (ms) the trailing edge barely moves: the drop "lets go". */
    lagUntil: number;
    droplets: Droplet[];
    ripples: Ripple[];
    target: WaterTarget | null;
    /** Eased straight run, so width changes (sidebar collapse) never jump. */
    q: number;
    /** Size of the nav area (without padding). */
    width: number;
    height: number;
    mouse: { x: number; y: number; strength: number; on: boolean };
    /** Ambient wave strength, eased toward 1 while the water is active. */
    ambient: number;
    moving: boolean;
    split: boolean;
    time: number;
};

export function createWaterState(): WaterState {
    return {
        a: { x: 0, v: 0 },
        b: { x: 0, v: 0 },
        sy: { x: 1, v: 0 },
        lead: 0,
        lagUntil: 0,
        droplets: [],
        ripples: [],
        target: null,
        q: 0,
        width: 0,
        height: 0,
        mouse: { x: 0, y: 0, strength: 0, on: false },
        ambient: 0,
        moving: false,
        split: false,
        time: 0,
    };
}

/**
 * Point the drop at a new item. `snap` places it there with no motion (first
 * paint, sidebar resize, reduced motion); otherwise the springs carry it over.
 */
export function setWaterTarget(s: WaterState, next: WaterTarget | null, now: number, snap: boolean): void {
    const prev = s.target;
    s.target = next;
    if (!next) {
        s.moving = false;
        s.droplets = [];
        return;
    }
    if (snap || !prev) {
        s.a = { x: next.y, v: 0 };
        s.b = { x: next.y, v: 0 };
        s.sy = { x: 1, v: 0 };
        s.q = next.q;
        s.droplets = [];
        s.moving = false;
        s.split = false;
        return;
    }
    if (Math.abs(next.y - prev.y) > 0.5) {
        s.lead = Math.abs(next.y - s.a.x) <= Math.abs(next.y - s.b.x) ? 0 : 1;
        s.lagUntil = now + 70;
        s.moving = true;
        s.split = false;
    }
}

export function addRipple(s: WaterState, x: number, y: number, amp: number): void {
    s.ripples.push({ x, y, age: 0, amp });
    if (s.ripples.length > MAX_RIPPLES) s.ripples.splice(0, s.ripples.length - MAX_RIPPLES);
}

export type StepOptions = {
    reduceMotion: boolean;
    /** Injected so tests are deterministic. */
    random: () => number;
};

/** Advance the simulation by dt seconds. `now` is a performance.now() timestamp in ms. */
export function stepWater(s: WaterState, dt: number, now: number, opts: StepOptions): void {
    const T = s.target;
    s.time += dt;
    s.ripples.forEach((p) => (p.age += dt));
    s.ripples = s.ripples.filter((p) => p.age < RIPPLE_LIFETIME_S);
    s.mouse.strength += ((s.mouse.on ? 1 : 0) - s.mouse.strength) * Math.min(1, dt * 7);
    const wantAmbient = !opts.reduceMotion && (s.moving || s.ripples.length > 0 || s.droplets.length > 0) ? 1 : 0;
    s.ambient += (wantAmbient - s.ambient) * Math.min(1, dt * 3);
    if (!T) return;

    s.q += (T.q - s.q) * Math.min(1, dt * 12);

    if (opts.reduceMotion) {
        s.a = { x: T.y, v: 0 };
        s.b = { x: T.y, v: 0 };
        s.sy = { x: 1, v: 0 };
        s.droplets = [];
        s.moving = false;
        return;
    }

    let still = true;
    const bodies = [s.a, s.b];
    const lo = WATER_PAD + T.r, hi = WATER_PAD + s.height - T.r;
    bodies.forEach((B, i) => {
        const lead = i === s.lead;
        const k = lead ? 210 : 72;
        const c = lead ? 25 : 13;
        const f = !lead && now < s.lagUntil ? 0.08 : 1;
        B.v += (k * (T.y - B.x) - c * B.v) * dt * f;
        B.x += B.v * dt;
        if (hi > lo && (B.x < lo || B.x > hi)) {
            B.x = Math.max(lo, Math.min(hi, B.x));
            B.v *= -0.25;
        }
        if (Math.abs(T.y - B.x) > 0.3 || Math.abs(B.v) > 3) still = false;
    });

    // A slight stretch along the direction of travel while the leader is fast.
    const leader = bodies[s.lead];
    const syTarget = 1 + 0.06 * Math.min(Math.abs(leader.v) / 1500, 1);
    s.sy.v += (280 * (syTarget - s.sy.x) - 9 * s.sy.v) * dt;
    s.sy.x += s.sy.v * dt;
    if (Math.abs(s.sy.x - 1) > 0.002 || Math.abs(s.sy.v) > 0.02) still = false;

    // Break the neck on long jumps: a few small droplets between the edges.
    const sep = Math.abs(s.a.x - s.b.x);
    if (!s.split && s.moving && sep - 2 * T.r > SPLIT_GAP_PX) {
        s.split = true;
        const from = bodies[1 - s.lead], to = bodies[s.lead];
        [0.3, 0.5, 0.72].slice(0, MAX_DROPLETS).forEach((t, j) => {
            s.droplets.push({
                y: from.x + (to.x - from.x) * t + (opts.random() - 0.5) * 6,
                x: T.cx + (opts.random() - 0.5) * 12,
                vy: (from.v + to.v) * 0.45,
                vx: (opts.random() - 0.5) * 20,
                r: 4.5 + opts.random() * 2 - j * 0.5,
                k: 70 + opts.random() * 90,
            });
        });
    }
    const halfRun = s.q + T.r;
    s.droplets = s.droplets.filter((d) => {
        d.vy += (d.k * (T.y - d.y) - 9 * d.vy) * dt;
        d.vx += (90 * (T.cx - d.x) - 7 * d.vx) * dt;
        d.y += d.vy * dt;
        d.x += d.vx * dt;
        d.y = Math.max(WATER_PAD + d.r, Math.min(WATER_PAD + s.height - d.r, d.y));
        d.x = Math.max(T.cx - halfRun + d.r, Math.min(T.cx + halfRun - d.r, d.x));
        if (Math.abs(T.y - d.y) < T.r * 0.5) d.r -= dt * 26;
        return d.r > 0.6;
    });
    if (s.droplets.length) still = false;

    if (s.moving && still) {
        s.moving = false;
        s.a.x = s.b.x = T.y;
        s.a.v = s.b.v = 0;
        addRipple(s, T.cx, T.y, s.split ? 0.9 : 0.5);
    }
}

/** True while another frame would change the picture. */
export function isWaterBusy(s: WaterState, reduceMotion: boolean): boolean {
    if (s.moving || s.droplets.length > 0 || s.ripples.length > 0) return true;
    const mouseTarget = s.mouse.on ? 1 : 0;
    if (Math.abs(s.mouse.strength - mouseTarget) > 0.01) return true;
    if (!reduceMotion && s.ambient > 0.01) return true;
    return false;
}

/**
 * Pack the drop into the shader's blob uniforms: [cx, cy, halfRun, radius] per
 * blob plus a per-blob vertical stretch. Head keeps its shape, the tail thins
 * as the edges separate, droplets are plain circles.
 */
export function packBlobs(s: WaterState, blobs: Float32Array, stretch: Float32Array): void {
    blobs.fill(0);
    stretch.fill(1);
    const T = s.target;
    if (!T) return;
    const sep = Math.abs(s.a.x - s.b.x);
    const thin = Math.min(sep / (4 * T.r || 1), 1);
    const head = s.lead === 0 ? s.a : s.b;
    const tail = s.lead === 0 ? s.b : s.a;
    blobs.set([T.cx, head.x, s.q * (1 - 0.1 * thin), T.r * (1 - 0.12 * thin)], 0);
    blobs.set([T.cx, tail.x, s.q * (1 - 0.7 * thin), T.r * (1 - 0.5 * thin)], 4);
    stretch[0] = stretch[1] = s.sy.x;
    s.droplets.slice(0, MAX_DROPLETS).forEach((d, i) => blobs.set([d.x, d.y, 0, d.r], 8 + i * 4));
}

export function packRipples(s: WaterState, out: Float32Array): void {
    out.fill(0);
    s.ripples.slice(-MAX_RIPPLES).forEach((p, i) => out.set([p.x, p.y, p.age, p.amp], i * 4));
}

/** Box for the CSS fallback drop, in nav-area pixels (padding removed). */
export function fallbackDropBox(s: WaterState): { top: number; height: number; left: number; width: number } | null {
    const T = s.target;
    if (!T) return null;
    const sep = Math.abs(s.a.x - s.b.x);
    const r = T.r * (1 - 0.2 * Math.min(sep / (4 * T.r || 1), 1));
    return {
        top: Math.min(s.a.x, s.b.x) - r - WATER_PAD,
        height: sep + 2 * r,
        left: T.cx - s.q - T.r - WATER_PAD,
        width: 2 * (s.q + T.r),
    };
}
