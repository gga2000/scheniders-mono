/**
 * Dev-only parity check between client-derived and server-derived aggregates.
 *
 * PERF-1 replaces locally-computed status counts and stats with
 * `get_orders_aggregates`. While the page still loads the whole book both are
 * computable, and they MUST agree — the whole premise of windowing the fetch is
 * that the server reproduces the client's semantics exactly.
 *
 * A silent disagreement here is the worst outcome available: the merchant sees a
 * confident, wrong number. This surfaces it loudly in development and compiles
 * to nothing a user pays for in production.
 */

export type AggregateMismatch = { key: string; client: number; server: number };

/**
 * Compare the counts both sides computed. Only keys present on BOTH are checked,
 * so extra server keys are not treated as drift.
 */
export function findAggregateMismatches(
    client: Record<string, number> | undefined,
    server: Record<string, number> | undefined,
): AggregateMismatch[] {
    if (!client || !server) return [];
    const out: AggregateMismatch[] = [];
    for (const [key, clientValue] of Object.entries(client)) {
        if (typeof clientValue !== "number") continue;
        const serverValue = server[key];
        if (typeof serverValue !== "number") continue;
        if (clientValue !== serverValue) {
            out.push({ key, client: clientValue, server: serverValue });
        }
    }
    return out;
}

/**
 * Report mismatches in development only. No-ops in production.
 *
 * `label` distinguishes which aggregate group drifted (status counts vs stats).
 */
export function assertAggregateParity(
    label: string,
    client: Record<string, number> | undefined,
    server: Record<string, number> | undefined,
): void {
    if (process.env.NODE_ENV === "production") return;
    const mismatches = findAggregateMismatches(client, server);
    if (mismatches.length === 0) return;
    console.error(
        `[orders] ${label}: server and client disagree — the windowed fetch would ship wrong numbers.`,
        mismatches,
    );
}
