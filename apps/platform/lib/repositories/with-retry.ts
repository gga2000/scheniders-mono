import { diag } from "@/lib/diag";

export interface RetryOptions {
    maxRetries?: number;
    delayMs?: number;
    timeoutMs?: number;
}

/**
 * A failure that will fail the same way on every attempt, so retrying only
 * makes the user wait: a write the database refused for permission reasons.
 */
export class NonRetryableError extends Error {}

/** Postgres insufficient_privilege, as PostgREST reports an RLS denial. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

function isNonRetryable(err: unknown): boolean {
    if (err instanceof NonRetryableError) return true;
    if (typeof err !== "object" || err === null) return false;
    const code = (err as { code?: unknown }).code;
    // 42501 is a permission refusal; class 23 (unique, foreign key, check) is a
    // data conflict. Both fail the same way on every attempt.
    return code === PG_INSUFFICIENT_PRIVILEGE || (typeof code === "string" && code.startsWith("23"));
}

/**
 * Wraps an async function with retry and timeout logic.
 * Useful for Supabase calls that might hang indefinitely due to network issues.
 */
export async function withRetry<T>(
    operationName: string,
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const { maxRetries = 2, delayMs = 1000, timeoutMs = 15000 } = options;
    const _tStart = performance.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const _tAttempt = performance.now();
        diag.log(`[Diag:Retry] ATTEMPT op=${operationName} attempt=${attempt + 1}/${maxRetries + 1} elapsedSinceStart=${(performance.now() - _tStart).toFixed(1)}ms`);

        try {
            let timeoutId: NodeJS.Timeout;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    diag.error(`[Diag:Retry] TIMEOUT op=${operationName} attempt=${attempt + 1} timeoutMs=${timeoutMs}`);
                    reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            });

            try {
                // Race the actual operation against the timeout
                const result = await Promise.race([operation(), timeoutPromise]);
                clearTimeout(timeoutId!);

                const attemptMs = performance.now() - _tAttempt;
                diag.log(`[Diag:Retry] SUCCESS op=${operationName} attempt=${attempt + 1} attemptMs=${attemptMs.toFixed(1)}ms totalMs=${(performance.now() - _tStart).toFixed(1)}ms`);

                return result;
            } catch (err) {
                clearTimeout(timeoutId!);
                throw err;
            }
        } catch (err) {
            const attemptMs = performance.now() - _tAttempt;
            lastError = err;
            if (isNonRetryable(err)) throw err;
            diag.warn(`[Diag:Retry] FAILED op=${operationName} attempt=${attempt + 1}/${maxRetries + 1} attemptMs=${attemptMs.toFixed(1)}ms err=${err instanceof Error ? err.message : err}`);

            if (attempt < maxRetries) {
                diag.log(`[Diag:Retry] BACKOFF op=${operationName} delayMs=${delayMs}`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    const totalMs = performance.now() - _tStart;
    diag.error(`[Diag:Retry] EXHAUSTED op=${operationName} attempts=${maxRetries + 1} totalMs=${totalMs.toFixed(1)}ms`);
    throw lastError;
}
