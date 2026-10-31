import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { CODE128_PATTERNS, code128Svg, code128Widths, DOT_GRID_MM, encodeCode128, qrSvg } from "./print-codes";

// Decoder: widths -> symbol values -> text, checking the checksum.
// (The pattern table was checked once against JsBarcode's BARS table: all 107 match.)
function decodeCode128(widths: number[]): string {
    const symbols: number[] = [];
    for (let i = 6; i < widths.length - 7; i += 6) {
        symbols.push(Number(widths.slice(i, i + 6).join("")));
    }
    const patternToValue = new Map(CODE128_PATTERNS.map((p, v) => [Number(p), v]));
    const values = symbols.map((p) => {
        const v = patternToValue.get(p);
        if (v === undefined) throw new Error(`unknown pattern ${p}`);
        return v;
    });
    const startPattern = Number(widths.slice(0, 6).join(""));
    let set: "B" | "C" = startPattern === 211232 ? "C" : "B";
    const data = values.slice(0, -1);
    const checksum = values[values.length - 1];
    const sum = [startPattern === 211232 ? 105 : 104, ...data].reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0) % 103;
    if (sum !== checksum) throw new Error("bad checksum");
    let out = "";
    for (const v of data) {
        if (set === "C") {
            if (v === 100) set = "B";
            else out += String(v).padStart(2, "0");
        } else if (v === 99) set = "C";
        else out += String.fromCharCode(v + 32);
    }
    return out;
}

describe("encodeCode128", () => {
    it.each(["122658090", "4261031001", "1", "12", "1234", "AB-12345", "ORD 2026/77", "x99999y"])(
        "round-trips %s",
        (text) => {
            const widths = code128Widths(text);
            expect(decodeCode128(widths)).toBe(text);
        }
    );

    it("uses code set C for numeric order ids", () => {
        expect(encodeCode128("4261031001")[0]).toBe(105);
        expect(encodeCode128("4261031001")).toHaveLength(1 + 5 + 2);
    });

    it("ends with the stop pattern", () => {
        expect(code128Widths("122658090").slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2]);
    });

    it("rejects empty and non-ASCII text", () => {
        expect(() => encodeCode128("")).toThrow();
        expect(() => encodeCode128("طلب")).toThrow();
    });
});

describe("code128Svg", () => {
    const widthMm = (svg: string) => Number(svg.match(/width="([\d.]+)mm"/)?.[1]);

    it("sizes every module to whole printer dots", () => {
        const svg = code128Svg("122658090");
        const modules = Number(svg.match(/viewBox="0 0 (\d+) 1"/)?.[1]);
        const moduleMm = widthMm(svg) / modules;
        expect(moduleMm / DOT_GRID_MM).toBeCloseTo(Math.round(moduleMm / DOT_GRID_MM), 6);
        expect(svg).toContain('shape-rendering="crispEdges"');
    });

    it("shrinks the module to fit the max width but never below one grid step", () => {
        const wide = code128Svg("ORDER-ABCDEFGH", { maxWidthMm: 70 });
        expect(widthMm(wide)).toBeLessThanOrEqual(70);
        const tiny = code128Svg("ABCDEFGHIJKLMNOPQRSTUVWXYZ", { maxWidthMm: 5 });
        const modules = Number(tiny.match(/viewBox="0 0 (\d+) 1"/)?.[1]);
        expect(widthMm(tiny)).toBeCloseTo(modules * DOT_GRID_MM, 3);
    });
});

describe("qrSvg", () => {
    it("draws exactly the QR modules on the dot grid", () => {
        const svg = qrSvg("122658090");
        const n = QRCode.create("122658090", { errorCorrectionLevel: "M" }).modules.size;
        const total = Number(svg.match(/viewBox="0 0 (\d+) /)?.[1]);
        expect(total).toBe(n + 4);
        const size = Number(svg.match(/width="([\d.]+)mm"/)?.[1]);
        expect((size / total / DOT_GRID_MM) % 1).toBeCloseTo(0, 6);
        expect(size).toBeLessThanOrEqual(20);
    });
});
