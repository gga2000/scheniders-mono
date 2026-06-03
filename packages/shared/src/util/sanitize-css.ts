/**
 * Sanitize merchant-authored CSS before injecting it into a <style> tag.
 * Neutralizes the only real breakout vector (an HTML closing/comment tag start)
 * while preserving valid CSS — notably the `>` child combinator. Also strips the
 * rare legacy CSS script vectors (expression(), javascript:, behavior:, @import).
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
    .replace(/-moz-binding\b/gi, "blocked");   // XBL binding
}
