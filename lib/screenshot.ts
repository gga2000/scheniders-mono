/**
 * Screenshot Utility
 * Generate shareable images from DOM elements using html2canvas
 */

async function loadHtml2Canvas() {
    const { default: html2canvas } = await import("html2canvas");
    return html2canvas;
}

export interface ScreenshotOptions {
    filename?: string;
    scale?: number;
    backgroundColor?: string;
}

/**
 * Capture a DOM element as an image and download it
 */
export async function captureAndDownload(
    element: HTMLElement,
    options: ScreenshotOptions = {}
): Promise<boolean> {
    const {
        filename = "screenshot.png",
        scale = 2,
        backgroundColor = "#ffffff"
    } = options;

    try {
        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(element, {
            scale,
            backgroundColor,
            useCORS: true,
            allowTaint: true,
            logging: false,
        });

        // Create download link
        const link = document.createElement("a");
        link.download = filename;
        link.href = canvas.toDataURL("image/png");
        link.click();

        return true;
    } catch (error) {
        console.error("Failed to capture screenshot:", error);
        return false;
    }
}

/**
 * Capture a DOM element as a blob for sharing
 */
export async function captureAsBlob(
    element: HTMLElement,
    options: ScreenshotOptions = {}
): Promise<Blob | null> {
    const {
        scale = 2,
        backgroundColor = "#ffffff"
    } = options;

    try {
        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(element, {
            scale,
            backgroundColor,
            useCORS: true,
            allowTaint: true,
            logging: false,
        });

        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, "image/png");
        });
    } catch (error) {
        console.error("Failed to capture screenshot:", error);
        return null;
    }
}

/**
 * Share an image using the Web Share API (mobile-friendly)
 */
export async function shareImage(
    blob: Blob,
    title: string,
    text?: string
): Promise<boolean> {
    if (!navigator.share) {
        console.log("Web Share API not supported");
        return false;
    }

    try {
        const file = new File([blob], "order-confirmation.png", { type: "image/png" });

        await navigator.share({
            title,
            text: text || title,
            files: [file],
        });

        return true;
    } catch (error) {
        // User cancelled or share failed
        console.log("Share cancelled or failed:", error);
        return false;
    }
}

/**
 * Copy image to clipboard
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
    try {
        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob })
        ]);
        return true;
    } catch (error) {
        console.error("Failed to copy image to clipboard:", error);
        return false;
    }
}
