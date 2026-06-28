/**
 * Sanitize merchant-authored CSS before injecting it into a <style> tag.
 * Neutralizes the only real breakout vector (an HTML closing/comment tag start)
 * while preserving valid CSS — notably the `>` child combinator. Also strips the
 * rare legacy CSS script vectors (expression(), javascript:, behavior:, @import),
 * remote `url()` (data-exfiltration / pixel-tracking), and `position: fixed`
 * (clickjack overlay of the storefront's CTA). Merchants load media via the
 * brand kit / image fields, not custom CSS, so blocking remote url() is safe.
 */
export function sanitizeCustomCss(css: string | null | undefined): string {
  if (!css) return "";
  return css
    .replace(/<\s*\/\s*/g, "\\/ ")            // any "</" closing-tag start (the breakout vector)
    .replace(/<\s*!/g, "/* */")               // "<!" comment / CDATA start
    .replace(/@import\b[^;]*;?/gi, "")         // remote @import
    .replace(/expression\s*\(/gi, "blocked(")  // IE expression()
    .replace(/javascript\s*:/gi, "blocked:")   // javascript: urls
    .replace(/behavior\s*:/gi, "blocked:")     // IE behavior:
    .replace(/-moz-binding\b/gi, "blocked")    // XBL binding
    // Remote url(...) — http(s) or protocol-relative — fires a network request
    // when the rule applies, leaking visits / data. Relative + data: URIs stay.
    .replace(
      /url\(\s*(['"]?)\s*(?:https?:)?\/\/[^)]*\)/gi,
      "url($1blocked$1)",
    )
    // position: fixed lets merchant CSS float an element over the real CTA
    // (clickjack). Neutralize to static; sticky/absolute remain allowed.
    .replace(/position\s*:\s*fixed/gi, "position:static");
}
