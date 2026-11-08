/**
 * Request header the proxy sets on every store request: "1" when the URL
 * carries `?sb_quiet=1`, else "0", so a client-sent value never survives.
 * Kept free of imports so the proxy can use it.
 */
export const QUIET_VIEW_HEADER = "x-sb-quiet";
/** Query flag the platform hub adds to its live-store preview frame. */
export const QUIET_VIEW_PARAM = "sb_quiet";
