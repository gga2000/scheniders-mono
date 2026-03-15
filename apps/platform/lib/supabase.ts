import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// Create a single supabase client for the entire app.
//
// IMPORTANT: We use `createClient` from `@supabase/supabase-js` instead of
// `createBrowserClient` from `@supabase/ssr`. The SSR client uses
// `navigator.locks` internally for auth token management, which causes
// DEADLOCKS when concurrent requests compete for the lock (e.g., a background
// `fetchOrders` refetch running while a user-initiated status mutation fires).
// The mutation's Supabase call hangs forever waiting for a lock held by the
// refetch, the optimistic UI reverts, and the status change appears lost.
//
// `createClient` uses localStorage for auth persistence (the default) and
// has no locking mechanism, so concurrent requests work correctly.
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
                return fetch(url, { ...options, cache: "no-store" });
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

  /**
   * Performs a lightweight health check by querying a single row.
   * Returns connection health metrics including latency and error state.
   */
  static async checkConnectionHealth(): Promise<{
    isHealthy: boolean;
    latency: number;
    timestamp: number;
    error?: string;
  }> {
    const startTime = performance.now();
    const HEALTH_CHECK_TIMEOUT = 5000;

    try {
      // Use Promise.race for reliable timeout (AbortSignal.timeout doesn't work on stale connections)
      const queryPromise = supabase
        .from('user_profiles')
        .select('id')
        .limit(1);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const latency = performance.now() - startTime;
          console.error(`[Diag:ConnHealth] PING_TIMEOUT latency=${latency.toFixed(1)}ms timeout=${HEALTH_CHECK_TIMEOUT}ms`);
          reject(new Error(`Health check timed out after ${HEALTH_CHECK_TIMEOUT}ms`));
        }, HEALTH_CHECK_TIMEOUT);
      });

      const { error } = await Promise.race([queryPromise, timeoutPromise]);

      const latency = performance.now() - startTime;
      const timeSinceLastCheck = Date.now() - this.lastHealthCheck;

      console.log(`[Diag:ConnHealth] PING latency=${latency.toFixed(1)}ms success=${!error} timeSinceLastCheck=${timeSinceLastCheck}ms`);

      this.lastHealthCheck = Date.now();

      if (latency > 1000 && !error) {
        console.warn(`[Diag:ConnHealth] SLOW_CONNECTION latency=${latency.toFixed(1)}ms threshold=1000ms`);
      }

      return {
        isHealthy: !error,
        latency,
        timestamp: Date.now(),
        error: error?.message
      };
    } catch (err) {
      const latency = performance.now() - startTime;
      console.error(`[Diag:ConnHealth] PING_FAILED latency=${latency.toFixed(1)}ms err=${err instanceof Error ? err.message : err}`);

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
// All types that were previously defined here are now in @/types/
// These re-exports maintain backward compatibility for all existing imports.
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
