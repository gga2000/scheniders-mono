/**
 * The shop's logo, made small enough to travel inside a label document. Labels
 * print from a window and from a PDF server that loads no outside images, so the
 * logo goes into the document as a data URL (browser only).
 */

/** Longest side kept: the label prints the logo at most 15 x 9 mm, about 180 px at 300 dpi; twice that stays sharp. */
const LOGO_MAX_SIDE_PX = 360;

function decodeImage(src: string): Promise<HTMLImageElement> {
    const img = new Image();
    img.src = src;
    return img.decode().then(() => img);
}

export async function loadLabelLogo(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Logo request failed (${response.status})`);
    const objectUrl = URL.createObjectURL(await response.blob());
    try {
        const img = await decodeImage(objectUrl);
        if (!img.naturalWidth || !img.naturalHeight) throw new Error("Logo has no size");
        const scale = Math.min(1, LOGO_MAX_SIDE_PX / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is not available");
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
