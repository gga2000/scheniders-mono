import { SUPPORT_SHOT_MAX_BYTES } from "@/lib/support/schema";

/**
 * A picture of what the merchant sees, for their support message. Drawn by
 * the browser from the page itself (modern-screenshot renders through SVG,
 * so the app's oklch colours come out right; html2canvas cannot read them).
 * The Help chat and its backdrop are left out: they carry `data-support-ui`.
 */

/** Wider screens are scaled down to this, which keeps text readable and the file small. */
const MAX_WIDTH = 1600;
/** Tried in order until the picture fits the upload limit. */
const QUALITIES = [0.75, 0.55, 0.4];

/** The colour behind the page; a transparent one would turn black in a JPEG. */
function pageBackground(): string {
    for (const el of [document.body, document.documentElement]) {
        const colour = getComputedStyle(el).backgroundColor;
        if (colour && colour !== "transparent" && !/rgba\(.*,\s*0\)$/.test(colour)) return colour;
    }
    return "#ffffff";
}

export async function captureScreen(): Promise<Blob> {
    const { domToBlob } = await import("modern-screenshot");
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = Math.min(MAX_WIDTH / width, window.devicePixelRatio || 1, 1.5);
    const backgroundColor = pageBackground();

    for (const quality of QUALITIES) {
        const blob = await domToBlob(document.body, {
            type: "image/jpeg",
            quality,
            scale,
            width,
            height,
            backgroundColor,
            filter: (node) => !(node instanceof HTMLElement && node.dataset.supportUi !== undefined),
        });
        if (blob.size <= SUPPORT_SHOT_MAX_BYTES) return blob;
    }
    throw new Error("support_shot_too_big");
}
