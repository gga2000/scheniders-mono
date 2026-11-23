/** Prime's statuses are read this often: the prime-sync cron runs every 5 minutes and reads them when due. */
export const PRIME_STATUS_EVERY_MS = 15 * 60 * 1000;

/**
 * Past this, Prime's statuses are late, not just between reads: reads land
 * 15 to 20 minutes apart, so two of them in a row have failed. A failed read
 * keeps the old time on prime_connections.last_synced_at.
 */
export const PRIME_SYNC_LATE_MS = 45 * 60 * 1000;

/**
 * Minutes since Prime's statuses were last read, when that is late; null
 * while they are fresh, and for a link never read yet (the demo store, or a
 * link made minutes ago), where there is nothing to call late.
 */
export function primeSyncLateMinutes(syncedAt: string | null, now: number): number | null {
    if (!syncedAt) return null;
    const at = Date.parse(syncedAt);
    if (!Number.isFinite(at)) return null;
    const age = now - at;
    return age > PRIME_SYNC_LATE_MS ? Math.round(age / 60_000) : null;
}

/** How long a wait reads on screen: minutes under an hour, hours under two days, then days. */
export function primeWaitUnit(minutes: number): { key: "prime.wait.minutes" | "prime.wait.hours" | "prime.wait.days"; count: number } {
    if (minutes < 60) return { key: "prime.wait.minutes", count: minutes };
    if (minutes < 48 * 60) return { key: "prime.wait.hours", count: Math.floor(minutes / 60) };
    return { key: "prime.wait.days", count: Math.floor(minutes / (24 * 60)) };
}
