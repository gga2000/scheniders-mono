// Server-side PDF pages only ever load Google Fonts and inline data. Everything
// else is refused, so a caller cannot make our server fetch internal or
// third-party URLs and read the answer back in the PDF.
const ALLOWED_REQUEST_ORIGINS = new Set(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]);

export function isAllowedPdfRequest(url: string): boolean {
    if (url.startsWith("data:") || url === "about:blank") return true;
    try {
        return ALLOWED_REQUEST_ORIGINS.has(new URL(url).origin);
    } catch {
        return false;
    }
}
