/**
 * Vector barcodes and QR codes for printed labels.
 *
 * Label printers rasterise at a fixed dot pitch (203 dpi or 300 dpi). A bar or
 * QR module that is not a whole number of dots gets rounded differently from
 * one bar to the next, so bars come out uneven and edges blur. Every module
 * here is a multiple of 1/100 inch (0.254 mm), which is exactly 2 dots at
 * 203 dpi and 3 dots at 300 dpi, and the output is SVG so the printer driver
 * draws it at its own resolution instead of stretching a small bitmap.
 */
import QRCode from "qrcode";

const SVG_NS = "http://www.w3.org/2000/svg";

/** 1/100 inch: whole dots at 203 dpi (2) and 300 dpi (3). */
export const DOT_GRID_MM = 0.254;

/** Code 128 needs a quiet zone of at least 10 modules on each side. */
const CODE128_QUIET_MODULES = 10;

/** ISO/IEC 18004 asks for 4; 2 still scans reliably on a white label and saves space. */
const QR_QUIET_MODULES = 2;

// Code 128 bar/space patterns (widths in modules) for values 0..106.
export const CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

/**
 * Encodes text as Code 128 symbol values (start, data, checksum, stop).
 * Runs of 4+ digits use code set C (two digits per symbol); the rest uses
 * code set B. Only printable ASCII (32..126) is accepted.
 */
export function encodeCode128(text: string): number[] {
    if (text.length === 0) throw new Error("Barcode text is empty");
    for (const ch of text) {
        const c = ch.charCodeAt(0);
        if (c < 32 || c > 126) throw new Error(`Barcode text has an unsupported character: ${JSON.stringify(ch)}`);
    }

    const digitRun = (from: number): number => {
        let i = from;
        while (i < text.length && text[i] >= "0" && text[i] <= "9") i++;
        return i - from;
    };

    let set: "B" | "C" = digitRun(0) >= 4 ? "C" : "B";
    const values: number[] = [set === "C" ? START_C : START_B];
    let i = 0;

    while (i < text.length) {
        const run = digitRun(i);
        if (set === "C") {
            if (run >= 2) {
                values.push(Number(text.slice(i, i + 2)));
                i += 2;
            } else {
                values.push(CODE_B);
                set = "B";
            }
            continue;
        }
        if (run >= 4) {
            // An odd run keeps its first digit in B so the rest pairs up in C.
            if (run % 2 === 1) {
                values.push(text.charCodeAt(i) - 32);
                i += 1;
            }
            values.push(CODE_C);
            set = "C";
            continue;
        }
        values.push(text.charCodeAt(i) - 32);
        i += 1;
    }

    const checksum = values.reduce((sum, v, idx) => sum + v * (idx === 0 ? 1 : idx), 0) % 103;
    values.push(checksum, STOP);
    return values;
}

/** Bar/space widths in modules, starting with a bar. */
export function code128Widths(text: string): number[] {
    return encodeCode128(text).flatMap((v) => CODE128_PATTERNS[v].split("").map(Number));
}

export interface BarcodeSvgOptions {
    /** Height of the bars in millimetres. */
    heightMm?: number;
    /** Widest the symbol (with quiet zones) may be; the module shrinks to fit, never below one grid step. */
    maxWidthMm?: number;
    /** Preferred module width in dot-grid steps (1 step = 0.254 mm). */
    moduleSteps?: number;
}

/** Code 128 as a crisp SVG sized in millimetres, quiet zones included. */
export function code128Svg(text: string, options: BarcodeSvgOptions = {}): string {
    const { heightMm = 12, maxWidthMm = 70, moduleSteps = 2 } = options;
    const widths = code128Widths(text);
    const dataModules = widths.reduce((a, b) => a + b, 0);
    const totalModules = dataModules + CODE128_QUIET_MODULES * 2;

    let steps = moduleSteps;
    while (steps > 1 && totalModules * steps * DOT_GRID_MM > maxWidthMm) steps -= 1;
    const moduleMm = steps * DOT_GRID_MM;

    let x = CODE128_QUIET_MODULES;
    let path = "";
    widths.forEach((w, idx) => {
        if (idx % 2 === 0) path += `M${x} 0h${w}v1h-${w}z`;
        x += w;
    });

    const widthMm = +(totalModules * moduleMm).toFixed(3);
    return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${totalModules} 1" width="${widthMm}mm" height="${heightMm}mm" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${escapeAttr(text)}"><rect width="${totalModules}" height="1" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export interface QrSvgOptions {
    /** Module width in dot-grid steps (1 step = 0.254 mm). */
    moduleSteps?: number;
    /** Largest the symbol (with quiet zone) may be; the module shrinks to fit. */
    maxSizeMm?: number;
}

/** QR code (error correction M) as a crisp SVG sized in millimetres. */
export function qrSvg(text: string, options: QrSvgOptions = {}): string {
    const { moduleSteps = 3, maxSizeMm = 20 } = options;
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const total = n + QR_QUIET_MODULES * 2;

    let steps = moduleSteps;
    while (steps > 1 && total * steps * DOT_GRID_MM > maxSizeMm) steps -= 1;
    const sizeMm = +(total * steps * DOT_GRID_MM).toFixed(3);

    let path = "";
    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            if (qr.modules.get(row, col)) path += `M${col + QR_QUIET_MODULES} ${row + QR_QUIET_MODULES}h1v1h-1z`;
        }
    }
    return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${total} ${total}" width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges" role="img" aria-label="${escapeAttr(text)}"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

function escapeAttr(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
