export interface RetryOptions {
    maxRetries?: number;
    delayMs?: number;
    timeoutMs?: number;
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
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`)), timeoutMs)
            );

            // Race the actual operation against the timeout
            const result = await Promise.race([operation(), timeoutPromise]);
            return result;
        } catch (err) {
            lastError = err;
            console.warn(`[withRetry] ${operationName} attempt ${attempt + 1}/${maxRetries + 1} failed:`, err instanceof Error ? err.message : err);
            
            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    console.error(`[withRetry] ${operationName} failed after ${maxRetries + 1} attempts`);
    throw lastError;
}
