/**
 * Accept only same-site absolute paths ("/orders?x=1") for post-login redirects.
 * Anything else (full URLs, "//host", "/\host", "@host", control characters) falls
 * back, so a crafted `returnTo` / `next` cannot send a freshly signed-in user, or
 * their session, to another site.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/orders"): string {
    if (!value || !value.startsWith("/")) return fallback;
    if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
    // Control characters are stripped by browsers and can hide a second slash.
    if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
    return value;
}
