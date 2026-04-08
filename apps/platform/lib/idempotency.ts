// =============================================
// IDEMPOTENCY GUARD
// Prevents double-execution of mutations from
// double-clicks, network retries, or React
// StrictMode double-effect runs.
// =============================================

/**
 * Generate a unique idempotency key for a mutation.
 * Includes a prefix for debugging.
 */
export function generateIdempotencyKey(prefix: string = "mut"): string {
    return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * IdempotencyGuard ensures a mutation with a given key
 * only executes once, even if called multiple times.
 * 
 * - Keys are stored in memory with a TTL (default 5 minutes)
 * - Thread-safe via synchronous Set operations
 * - Automatically cleans expired keys
 */
export class IdempotencyGuard {
    private executedKeys = new Map<string, number>(); // key → timestamp
    private ttlMs: number;
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(ttlMs: number = 5 * 60 * 1000) { // 5 minutes default
        this.ttlMs = ttlMs;

        // Periodic cleanup of expired keys (every 60s)
        if (typeof window !== "undefined") {
            this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
        }
    }

    /**
     * Check if a mutation with this key has already been executed.
     * If not, mark it as executed and return true (proceed).
     * If yes, return false (skip).
     */
    tryExecute(key: string): boolean {
        // Check if already executed and not expired
        const executedAt = this.executedKeys.get(key);
        if (executedAt !== undefined) {
            const age = Date.now() - executedAt;
            if (age < this.ttlMs) {
                console.warn(`[Idempotency] Skipping duplicate mutation: ${key}`);
                return false; // Already executed
            }
            // Expired — allow re-execution
        }

        this.executedKeys.set(key, Date.now());
        return true; // Proceed
    }

    /**
     * Remove a key (e.g., if the mutation failed and should be retried).
     */
    release(key: string): void {
        this.executedKeys.delete(key);
    }

    /**
     * Clean up expired keys to prevent memory leaks.
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [key, timestamp] of this.executedKeys) {
            if (now - timestamp > this.ttlMs) {
                this.executedKeys.delete(key);
            }
        }
    }

    /**
     * Destroy the guard (cleanup interval).
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.executedKeys.clear();
    }
}

// Singleton instance for the app
let _guard: IdempotencyGuard | null = null;

export function getIdempotencyGuard(): IdempotencyGuard {
    if (!_guard) {
        _guard = new IdempotencyGuard();
    }
    return _guard;
}
