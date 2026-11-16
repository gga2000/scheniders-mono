// =====================================================================
// The dashboard's address (Fermi A4): app.usefermi.com
// =====================================================================
// The dashboard moved from schenidersapp.xyz. A page opened on an old address
// moves to the same path and query on the new one. Only pages: the middleware
// never runs on /api, so Prime's and Interakt's webhooks, QStash callbacks,
// crons and the merchant MCP keep answering on the old address.
//
// Off until DASHBOARD_HOST is set. It is set only after the new address can
// sign people in (Supabase Auth redirect URLs and the Turnstile hostname
// list name it); before that, sending everyone there would lock them out.
// =====================================================================

export interface DashboardHosts {
    /** DASHBOARD_HOST: the dashboard's address, e.g. app.usefermi.com. */
    to: string;
    /** DASHBOARD_OLD_HOSTS: comma-separated old addresses that move to it. */
    from: readonly string[];
}

/** The configured move, or null when there is none to make. */
export function dashboardHostsFromEnv(env: { DASHBOARD_HOST?: string; DASHBOARD_OLD_HOSTS?: string }): DashboardHosts | null {
    const to = env.DASHBOARD_HOST?.trim().toLowerCase();
    if (!to) return null;
    const from = (env.DASHBOARD_OLD_HOSTS ?? "")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter((h) => h.length > 0 && h !== to);
    return from.length > 0 ? { to, from } : null;
}

/**
 * Where a page request on an old dashboard address goes, or null to serve it
 * here. Only GET and HEAD move: a form post redirected to another origin
 * would arrive without its body.
 */
export function dashboardRedirectUrl(
    hosts: DashboardHosts | null,
    request: { host: string | null; method: string; pathname: string; search: string },
): string | null {
    if (!hosts || !request.host) return null;
    if (request.method !== "GET" && request.method !== "HEAD") return null;
    const host = request.host.split(":")[0].trim().toLowerCase();
    if (!hosts.from.includes(host)) return null;
    return `https://${hosts.to}${request.pathname}${request.search}`;
}
