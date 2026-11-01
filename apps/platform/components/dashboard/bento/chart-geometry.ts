/**
 * Geometry for the dashboard's hand-drawn SVG charts. Pure functions, no DOM:
 * the bento cards draw their own SVG so every mark, animation and tooltip is
 * under our control instead of a chart library's.
 */

export type Pt = readonly [number, number];

/**
 * A smooth path through every point (Catmull-Rom expressed as cubic Béziers).
 * `k` is the tension; 0.18 keeps peaks honest (the curve passes through each
 * data point and never overshoots far between them).
 */
export function smoothPath(points: readonly Pt[], k = 0.18): string {
    const n = points.length;
    if (n === 0) return "";
    if (n === 1) return `M${points[0][0]},${points[0][1]}`;
    const at = (i: number) => points[Math.max(0, Math.min(n - 1, i))];
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        d += `C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} `
            + `${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
    }
    return d;
}

/** A round tick step (1, 2, 2.5, 5 × 10^n) giving about `count` gridlines. */
export function niceStep(span: number, count = 4): number {
    if (!(span > 0)) return 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}

export interface TreemapInput<T> { key: string; value: number; item: T }
export interface TreemapRect<T> extends TreemapInput<T> { x: number; y: number; w: number; h: number }

/**
 * Squarified treemap (Bruls, Huizing, van Wijk). Items are laid out largest first
 * in rows along the shorter side, keeping tiles as close to square as possible.
 * Zero and negative values are dropped: they have no area.
 */
export function squarify<T>(input: readonly TreemapInput<T>[], width: number, height: number): TreemapRect<T>[] {
    const items = input.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total || width <= 0 || height <= 0) return [];
    const scale = (width * height) / total;
    type Sized = TreemapInput<T> & { area: number };
    let rest: Sized[] = items.map((i) => ({ ...i, area: i.value * scale }));
    let x = 0, y = 0, w = width, h = height;
    const out: TreemapRect<T>[] = [];

    const worst = (row: Sized[], side: number) => {
        const sum = row.reduce((s, r) => s + r.area, 0);
        const max = Math.max(...row.map((r) => r.area));
        const min = Math.min(...row.map((r) => r.area));
        return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
    };

    while (rest.length) {
        const side = Math.min(w, h);
        const row: Sized[] = [rest[0]];
        let i = 1;
        while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) row.push(rest[i++]);
        rest = rest.slice(i);
        const sum = row.reduce((s, r) => s + r.area, 0);
        if (w >= h) {
            const colW = sum / h;
            let cy = y;
            for (const r of row) { const rh = r.area / colW; out.push({ key: r.key, value: r.value, item: r.item, x, y: cy, w: colW, h: rh }); cy += rh; }
            x += colW; w -= colW;
        } else {
            const rowH = sum / w;
            let cx = x;
            for (const r of row) { const rw = r.area / rowH; out.push({ key: r.key, value: r.value, item: r.item, x: cx, y, w: rw, h: rowH }); cx += rw; }
            y += rowH; h -= rowH;
        }
    }
    return out;
}

/**
 * The radar's closed shape: a low-order Fourier fit through the monthly values,
 * so lobes stay round and even instead of the spiky star a polygon draws.
 * Values are normalised to 0.42–1 of the radius: a quiet month still reads as a
 * shape, and the busiest month reaches out to (about) the outer ring.
 */
export function radarShape(values: readonly number[]) {
    const n = values.length;
    const lo = Math.min(...values), hi = Math.max(...values);
    const norm = values.map((v) => 0.42 + ((v - lo) / (hi - lo || 1)) * 0.58);
    const harmonics = Math.min(5, Math.floor(n / 2));
    const coeffs: [number, number][] = [];
    for (let k = 0; k <= harmonics; k++) {
        let a = 0, b = 0;
        norm.forEach((x, i) => {
            const th = (i / n) * Math.PI * 2;
            a += x * Math.cos(k * th);
            b += x * Math.sin(k * th);
        });
        coeffs.push([(a * (k ? 2 : 1)) / n, (b * (k ? 2 : 1)) / n]);
    }
    /** Radius fraction (0–1) at angle `th` (0 = first axis, clockwise). */
    return (th: number) => Math.max(0.05, coeffs.reduce((r, [a, b], k) => r + a * Math.cos(k * th) + b * Math.sin(k * th), 0));
}

/** Point on the radar for a radius fraction at angle `th`, with a hollow core. */
export function radarPoint(cx: number, cy: number, radius: number, frac: number, th: number, core = 0.2): Pt {
    const a = -Math.PI / 2 + th;
    const r = radius * core + frac * radius * (1 - core);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

/** Closed SVG path of the fitted radar shape. */
export function radarPath(values: readonly number[], cx: number, cy: number, radius: number, steps = 180): string {
    const f = radarShape(values);
    let d = "";
    for (let j = 0; j <= steps; j++) {
        const th = (j / steps) * Math.PI * 2;
        const [x, y] = radarPoint(cx, cy, radius, f(th), th);
        d += `${j ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    }
    return `${d}Z`;
}

/**
 * Gaussian smoothing on a circular series (hour 23 sits next to hour 0), for
 * drawing only: hour-by-hour counts are jagged, and the shape of the day is the
 * point of the chart. The total is preserved.
 */
export function smoothCircular(values: readonly number[], sigma: number): number[] {
    const n = values.length;
    if (n === 0 || !(sigma > 0)) return [...values];
    const reach = Math.min(Math.floor(n / 2), Math.ceil(sigma * 3));
    const weights = Array.from({ length: 2 * reach + 1 }, (_, i) => Math.exp(-((i - reach) ** 2) / (2 * sigma * sigma)));
    const sum = weights.reduce((a, b) => a + b, 0);
    return values.map((_, i) => weights.reduce((acc, w, j) => acc + w * values[(((i + j - reach) % n) + n) % n], 0) / sum);
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
