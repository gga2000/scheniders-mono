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
