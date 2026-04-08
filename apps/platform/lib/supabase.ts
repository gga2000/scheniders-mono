import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { diag } from '@/lib/diag';

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
    try {
        const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
        const projectRef = url.hostname.split('.')[0];
        const storageKey = `sb-${projectRef}-auth-token`;
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.user?.id && parsed?.access_token) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Get a valid (non-expired) access token from localStorage.
 * Returns null if no token exists or if the token expires within 30 seconds.
 */
function getValidStoredToken(): string | null {
    const stored = getStoredSupabaseSession();
    if (!stored?.access_token) return null;
    const exp = getJwtExpiry(stored.access_token);
    if (exp === null) return null;
    // Only use if token has > 30s remaining
    if (exp > Math.floor(Date.now() / 1000) + 30) {
        return stored.access_token;
    }
    return null;
}

// =============================================
// CONNECTION PRE-WARM
// =============================================

// Detect stale TCP sockets from device sleep BEFORE createClient starts
// _initialize(). This fires a lightweight HEAD request so the browser's
// network stack can discover and discard dead connections early.
if (typeof window !== 'undefined') {
    const _tPrewarm = performance.now();
    fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
        headers: { 'apikey': env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        cache: 'no-store',
    }).then(() => {
        diag.log(`[Supabase:Prewarm] OK took=${(performance.now() - _tPrewarm).toFixed(1)}ms`);
    }).catch(() => {
        diag.warn(`[Supabase:Prewarm] FAILED took=${(performance.now() - _tPrewarm).toFixed(1)}ms — stale connection detected`);
    });
}

// =============================================
// SUPABASE CLIENT
// =============================================

// Global fetch timeout — prevents requests from hanging forever on stale
// TCP connections after device sleep.
const SUPABASE_FETCH_TIMEOUT_MS = 10_000;

// Fast retry threshold for auth token refresh endpoints.
// If the first attempt takes longer than this, abort and retry on a fresh connection.
const AUTH_FAST_RETRY_MS = 2_000;

export const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
        global: {
            fetch: (url, options) => {
                const _t = performance.now();
                const urlStr = typeof url === 'string' ? url : (url instanceof Request ? url.url : 'unknown');
                const shortUrl = urlStr.split('?')[0].replace(/https?:\/\/[^/]+/, '');
                const isAuthTokenEndpoint = shortUrl.includes('/auth/v1/token');
                const isAuthEndpoint = shortUrl.includes('/auth/');

                // ── Auth header injection ──
                // Before _initialize() completes, the Supabase client sends requests
                // without user auth (only anon key). For non-auth requests (PostgREST,
                // Storage), inject the user's access token from localStorage so RLS
                // works immediately on page load.
                let mergedHeaders: HeadersInit | undefined = options?.headers;

                if (typeof window !== 'undefined' && !isAuthEndpoint) {
                    const token = getValidStoredToken();
                    if (token) {
                        // Check if the client hasn't set a user token yet
                        const existing = new Headers(options?.headers);
                        const currentAuth = existing.get('Authorization');
                        if (!currentAuth || currentAuth === `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`) {
                            existing.set('Authorization', `Bearer ${token}`);
                            mergedHeaders = existing;
                            diag.log(`[Supabase:Fetch] AUTH_INJECT url=${shortUrl}`);
                        }
                    }
                }

                // ── Abort controller + global timeout ──
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

                const doFetch = (signal: AbortSignal, attempt: number) =>
                    fetch(url, { ...options, headers: mergedHeaders, signal, cache: 'no-store' as RequestCache })
                        .then(response => {
                            diag.log(`[Supabase:Fetch] DONE url=${shortUrl} status=${response.status} attempt=${attempt} took=${(performance.now() - _t).toFixed(1)}ms`);
                            return response;
                        });

                // ── Fast retry for auth token refresh ──
                // After device sleep, the first request on a stale TCP connection
                // hangs for 3-6s while the OS detects the dead socket. If the token
                // refresh takes > 2s, abort and retry — the browser will use a fresh
                // connection for the retry.
                let resultPromise: Promise<Response>;

                if (isAuthTokenEndpoint) {
                    const firstController = new AbortController();
                    controller.signal.addEventListener('abort', () => firstController.abort(), { once: true });

                    resultPromise = new Promise<Response>((resolve, reject) => {
                        let settled = false;
                        let retryFired = false;

                        doFetch(firstController.signal, 1)
                            .then(r => { if (!settled) { settled = true; resolve(r); } })
                            .catch(e => {
                                if (!settled && !retryFired) { settled = true; reject(e); }
                            });

                        setTimeout(() => {
                            if (settled) return;
                            retryFired = true;
                            diag.warn(`[Supabase:Fetch] AUTH_FAST_RETRY — first attempt stalled after ${AUTH_FAST_RETRY_MS}ms, retrying`);
                            firstController.abort();

                            const retryController = new AbortController();
                            controller.signal.addEventListener('abort', () => retryController.abort(), { once: true });

                            doFetch(retryController.signal, 2)
                                .then(r => { if (!settled) { settled = true; resolve(r); } })
                                .catch(e => { if (!settled) { settled = true; reject(e); } });
                        }, AUTH_FAST_RETRY_MS);
                    });
                } else {
                    resultPromise = doFetch(controller.signal, 1);
                }

                return resultPromise
                    .catch(err => {
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
