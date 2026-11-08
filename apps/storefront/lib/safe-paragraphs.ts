/**
 * Convert merchant-authored HTML (legacy `about.body`) into plain-text
 * paragraphs. Block boundaries (</p>, <br>, blank lines) become paragraph
 * splits; all remaining tags are removed and a few common entities decoded.
 * Output is rendered as React text (escaped), so no HTML is ever interpreted:
 * this closes the stored-XSS hole on every page that shows the about text.
 */
export function htmlToSafeParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}
