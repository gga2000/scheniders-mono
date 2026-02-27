import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

// Create a single supabase client for the entire app with proper auth persistence
export const supabase = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
