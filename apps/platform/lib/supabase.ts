import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import { diag } from '@/lib/diag';
import { perfTrace } from '@/lib/perf-trace';

// =============================================
// JWT UTILITIES
// =============================================

/**
 * Decode a JWT's `exp` claim without any library.
 * Returns the expiry as a Unix timestamp in SECONDS, or null if decoding fails.
 */
export function getJwtExpiry(token: string): number | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const payload = JSON.parse(atob(b64));
        return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
}

// =============================================
// STORED SESSION ACCESS
// =============================================

/**
 * Read the Supabase session directly from localStorage, bypassing the
 * client's potentially-hung initialization. Used to bootstrap auth state
 * and inject auth headers before _initialize() completes.
 */
export function getStoredSupabaseSession(): {
    user: { id: string; email?: string };
    access_token: string;
    refresh_token: string;
} | null {
    // Sessions moved from localStorage to cookies (createBrowserClient), so there
    // is no synchronously-readable token here anymore. Auth now bootstraps via
    // supabase.auth.onAuthStateChange (INITIAL_SESSION). Kept as a no-op export so
    // the auth-provider's optional fast-path simply skips and relies on the event.
    return null;
}

// =============================================
// SUPABASE BROWSER CLIENT (cookie-based @supabase/ssr)
// =============================================

//
// Cookie-based sessions make the session visible to the Next.js server
// (middleware, Server Components, Route Handlers), enabling server-side auth +
// token refresh. supabase-js still attaches the access token as an Authorization
// header on data requests, so the existing token-based API routes keep working.
//
// The old localStorage band-aids were removed with this migration:
//   • auth-header injection from localStorage (createBrowserClient handles auth)
//   • the connection pre-warm HEAD (it 401'd and cost ~400ms)
//   • the /auth/v1/token fast-retry (token refresh now happens server-side in
//     middleware, off the client's stale socket)

// Global fetch timeout — still useful to keep a request from hanging forever on
// a stale TCP connection after device sleep.
const SUPABASE_FETCH_TIMEOUT_MS = 10_000;

export const supabase = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
        global: {
            fetch: (url, options) => {
                const _t = performance.now();
                const urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : 'unknown');
                const shortUrl = urlStr.split('?')[0].replace(/https?:\/\/[^/]+/, '');

                const controller = new AbortController();
                const callerSignal = options?.signal;
                if (callerSignal) {
                    if (callerSignal.aborted) controller.abort();
                    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
                }
                const timeoutId = setTimeout(() => {
                    diag.warn(`[Supabase:Fetch] TIMEOUT after ${SUPABASE_FETCH_TIMEOUT_MS}ms url=${shortUrl}`);
                    controller.abort();
                }, SUPABASE_FETCH_TIMEOUT_MS);

                diag.log(`[Supabase:Fetch] START url=${shortUrl} method=${options?.method ?? 'GET'}`);
                const traceId = perfTrace.requestStart(urlStr, options);

                return fetch(url, { ...options, signal: controller.signal, cache: 'no-store' as RequestCache })
                    .then(response => {
                        perfTrace.requestDone(traceId, response);
                        diag.log(`[Supabase:Fetch] DONE url=${shortUrl} status=${response.status} took=${(performance.now() - _t).toFixed(1)}ms`);
                        return response;
                    })
                    .catch(err => {
                        perfTrace.requestDone(traceId, null);
                        diag.error(`[Supabase:Fetch] FAILED url=${shortUrl} err=${err instanceof Error ? err.message : err} took=${(performance.now() - _t).toFixed(1)}ms`);
                        throw err;
                    })
                    .finally(() => clearTimeout(timeoutId));
            }
        }
    }
);

// =============================================
// CONNECTION HEALTH MONITORING
// =============================================

/**
 * Monitors Supabase connection health to detect stale connections
 * after device sleep/wake cycles or prolonged inactivity.
 */
export class SupabaseConnectionMonitor {
    private static lastHealthCheck: number = 0;

    static async checkConnectionHealth(): Promise<{
        isHealthy: boolean;
        latency: number;
        timestamp: number;
        error?: string;
    }> {
        const startTime = performance.now();
        const HEALTH_CHECK_TIMEOUT = 5000;

        try {
            const queryPromise = supabase
                .from('user_profiles')
                .select('id')
                .limit(1);

            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    const latency = performance.now() - startTime;
                    diag.error(`[Diag:ConnHealth] PING_TIMEOUT latency=${latency.toFixed(1)}ms timeout=${HEALTH_CHECK_TIMEOUT}ms`);
                    reject(new Error(`Health check timed out after ${HEALTH_CHECK_TIMEOUT}ms`));
                }, HEALTH_CHECK_TIMEOUT);
            });

            const { error } = await Promise.race([queryPromise, timeoutPromise]);

            const latency = performance.now() - startTime;
            const timeSinceLastCheck = Date.now() - this.lastHealthCheck;

            diag.log(`[Diag:ConnHealth] PING latency=${latency.toFixed(1)}ms success=${!error} timeSinceLastCheck=${timeSinceLastCheck}ms`);

            this.lastHealthCheck = Date.now();

            if (latency > 1000 && !error) {
                diag.warn(`[Diag:ConnHealth] SLOW_CONNECTION latency=${latency.toFixed(1)}ms threshold=1000ms`);
            }

            return {
                isHealthy: !error,
                latency,
                timestamp: Date.now(),
                error: error?.message
            };
        } catch (err) {
            const latency = performance.now() - startTime;
            diag.error(`[Diag:ConnHealth] PING_FAILED latency=${latency.toFixed(1)}ms err=${err instanceof Error ? err.message : err}`);

            return {
                isHealthy: false,
                latency,
                timestamp: Date.now(),
                error: err instanceof Error ? err.message : 'Unknown error'
            };
        }
    }
}

// =============================================
// RE-EXPORTS FROM CENTRALIZED TYPES
// =============================================
export type {
    Order,
    OrderItem,
    OrderStatus,
    OrderPriority,
    PaymentStatus,
    Blacklist,
    RejectionReason,
    OrderNote,
    OrderStatusHistory,
    FilterPreset,
    OrderFilters,
    MessageTemplate,
    FollowUpReminder,
    PrintBatch,
    RiskMetadata,
    DeliverySlot,
    OrderSource,
    OrderTagColor,
    AddressStatus,
    RiskLevel,
} from '@/types/order';

export type {
    Product,
    ProductVariant,
    ProductPriceHistory,
    QCItem,
    StockStatus,
} from '@/types/product';

export { getStockStatus } from '@/types/product';
