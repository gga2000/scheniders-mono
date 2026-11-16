import { createSupabaseServiceClient } from '@/lib/supabase-server';
import { isBillingExempt } from "@/lib/billing-exempt";
import { looksLikePlatformHost, slugRejection } from "@/lib/tenant-slug";

// =============================================
// TYPES
// =============================================

/** `internal` is the operator's own house tier — never billed, never suspended. */
export type PlanTier = 'starter' | 'growth' | 'professional' | 'enterprise' | 'internal';
export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled';
export type MemberStatus = 'pending' | 'active' | 'suspended';

export type TemplateName = 'fashion' | 'beauty' | 'electronics' | 'general' | 'clean';

export interface StoreConfig {
    template?: TemplateName;
    hero?: {
        title?: string;
        subtitle?: string;
        cta_text?: string;
        image_url?: string | null;
    };
    about?: {
        enabled?: boolean;
        title?: string;
        body?: string;
    };
    contact?: {
        whatsapp_number?: string | null;
        instagram?: string | null;
        facebook?: string | null;
        tiktok?: string | null;
    };
    sections_order?: string[];
    enable_whatsapp_order?: boolean;
}

export interface Tenant {
    id: string;
    business_name: string;
    slug: string;
    plan: PlanTier;
    status: TenantStatus;
    trial_ends_at: string | null;
    branding: {
        logo_url: string | null;
        primary_color: string;
        secondary_color: string;
    };
    settings: {
        timezone: string;
        language: string;
        currency: string;
    };
    store_config: StoreConfig;
    contact_email: string | null;
    contact_phone: string | null;
    address: string | null;
    city: string | null;
    created_at: string;
}

export interface PlanLimits {
    plan: PlanTier;
    max_orders_per_month: number;
    max_team_members: number;
    order_price_iqd: number;
    overage_price_iqd: number;
    base_price_iqd: number;
    features: {
        whatsapp_automation: boolean;
        custom_branding: boolean;
        api_access: boolean;
        priority_support: boolean;
        advanced_analytics: boolean;
        custom_storefront: boolean;
    };
}

export interface TenantUsage {
    orders_count: number;
    orders_charged: number;
    team_members_count: number;
}

// =============================================
// SLUG GENERATION
// =============================================

export { generateSlug } from "@/lib/tenant-slug";

/**
 * Ensure the slug is unique by appending a number if needed.
 * Uses service role to bypass RLS.
 *
 * A slug is held by a current tenant OR by a renamed tenant's
 * tenant_slug_history row. The storefront resolves tenants before history,
 * so a new store on a renamed store's old slug would silently take every
 * link that store already shared. The tenants trigger from
 * 20261022090000_tenant_slug_claim.sql refuses such an insert; skipping
 * those slugs here picks a free one instead of failing the signup.
 */
export async function ensureUniqueSlug(requested: string): Promise<string> {
    // A store named "Support" or "Scheniders" must not become
    // support.<root> / scheniders.<root>, which read as platform pages. The
    // handle-claim route already refuses these; signup lands here instead.
    const baseSlug = looksLikePlatformHost(requested) ? `store-${requested}` : requested;
    let slug = baseSlug;
    let attempt = 0;

    while (!(await isSlugFree(slug))) {
        attempt++;
        slug = `${baseSlug}-${attempt}`;
    }
    return slug;
}

/**
 * True when no store holds this slug, now or as a renamed store's old
 * address (see ensureUniqueSlug). Throws when the lookup fails, so a caller
 * never takes "couldn't check" for "free".
 */
export async function isSlugFree(slug: string): Promise<boolean> {
    const adminClient = createSupabaseServiceClient();
    const [current, history] = await Promise.all([
        adminClient.from('tenants').select('id').eq('slug', slug).maybeSingle(),
        adminClient
            .from('tenant_slug_history')
            .select('tenant_id')
            .eq('old_slug', slug)
            .maybeSingle(),
    ]);
    const lookupError = current.error ?? history.error;
    if (lookupError) {
        throw new Error(`Slug availability lookup failed for "${slug}": ${lookupError.message}`);
    }
    return !current.data && !history.data;
}

/**
 * A free address close to one the merchant wanted that is taken or
 * reserved: "noor" → "noor-2", "store" → "store-store". Always a valid
 * address to claim (3–30 characters), unlike ensureUniqueSlug's.
 */
export async function suggestFreeSlug(wanted: string): Promise<string> {
    const start = looksLikePlatformHost(wanted) ? `store-${wanted}` : wanted;
    // Room for "-99" within the 30-character limit.
    const base = start.slice(0, 27).replace(/-+$/, "");
    for (let n = 2; n < 100; n++) {
        const candidate = `${base}-${n}`;
        if (slugRejection(candidate) === null && (await isSlugFree(candidate))) return candidate;
    }
    throw new Error(`No free address near "${wanted}"`);
}


// =============================================
// TENANT RESOLUTION
// =============================================

/**
 * Get a tenant by ID (service role — for internal use).
 */
async function getTenantById(tenantId: string): Promise<Tenant | null> {
    const adminClient = createSupabaseServiceClient();
    const { data } = await adminClient
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();
    return data;
}

// =============================================
// PLAN LIMITS
// =============================================

/**
 * Get the plan limits for a given tier.
 */
async function getPlanLimits(plan: PlanTier): Promise<PlanLimits | null> {
    const adminClient = createSupabaseServiceClient();
    const { data } = await adminClient
        .from('plan_limits')
        .select('*')
        .eq('plan', plan)
        .single();
    return data;
}

// =============================================
// USAGE TRACKING
// =============================================

/**
 * Get the current month's usage for a tenant.
 */
async function getCurrentUsage(tenantId: string): Promise<TenantUsage> {
    const adminClient = createSupabaseServiceClient();
    const now = new Date();

    const { data } = await adminClient
        .from('usage_tracking')
        .select('orders_count, orders_charged, team_members_count')
        .eq('tenant_id', tenantId)
        .eq('year', now.getFullYear())
        .eq('month', now.getMonth() + 1)
        .maybeSingle();

    return data ?? { orders_count: 0, orders_charged: 0, team_members_count: 0 };
}

/**
 * Check if a tenant can create another order.
 * Returns { allowed, reason, warning }
 */
/**
 * Why an order can't be made, or what to warn about. The UI shows the message
 * for the code in the merchant's language; `reason` / `warning` keep an
 * English line for logs and server callers.
 */
export type OrderLimitCode =
    | "tenant_not_found"
    | "suspended"
    | "cancelled"
    | "monthly_limit_exceeded"
    | "monthly_limit_reached"
    | "monthly_limit_near";

export type OrderLimitCheck = {
    allowed: boolean;
    reason?: string;
    warning?: string;
    code?: OrderLimitCode;
    params?: Record<string, number>;
};

export async function canCreateOrder(tenantId: string): Promise<OrderLimitCheck> {
    // Check tenant status
    const tenant = await getTenantById(tenantId);
    if (!tenant) return { allowed: false, code: 'tenant_not_found', reason: 'Tenant not found' };

    // The house tier is never billed, so no billing state may block its orders.
    if (isBillingExempt(tenant.plan)) return { allowed: true };

    if (tenant.status === 'suspended') {
        return { allowed: false, code: 'suspended', reason: 'Account is suspended. Please contact support.' };
    }

    if (tenant.status === 'cancelled') {
        return { allowed: false, code: 'cancelled', reason: 'Subscription has been cancelled.' };
    }

    // An ended, unpaid trial is LOCKED, not closed (handoff A1): orders the
    // shop types in by hand still go through. Only the storefront has a limit
    // in the lock (create_storefront_order / take_lock_order_slot).

    const limits = await getPlanLimits(tenant.plan);
    if (!limits) return { allowed: true }; // No limits found, allow

    // Unlimited plan
    if (limits.max_orders_per_month === -1) return { allowed: true };

    const usage = await getCurrentUsage(tenantId);
    const hardLimit = Math.ceil(limits.max_orders_per_month * 1.1); // 110% hard block

    if (usage.orders_count >= hardLimit) {
        return {
            allowed: false,
            code: 'monthly_limit_exceeded',
            params: { used: usage.orders_count, limit: limits.max_orders_per_month },
            reason: `Monthly order limit exceeded (${usage.orders_count}/${limits.max_orders_per_month}). Upgrade your plan to continue.`,
        };
    }

    if (usage.orders_count >= limits.max_orders_per_month) {
        return {
            allowed: true,
            code: 'monthly_limit_reached',
            params: { limit: limits.max_orders_per_month, price: limits.overage_price_iqd },
            warning: `You've reached your monthly order limit (${limits.max_orders_per_month}). Additional orders are charged at ${limits.overage_price_iqd} IQD each.`,
        };
    }

    if (usage.orders_count >= limits.max_orders_per_month * 0.9) {
        return {
            allowed: true,
            code: 'monthly_limit_near',
            params: { percent: Math.round((usage.orders_count / limits.max_orders_per_month) * 100) },
            warning: `You've used ${Math.round((usage.orders_count / limits.max_orders_per_month) * 100)}% of your monthly order limit.`,
        };
    }

    return { allowed: true };
}

// =============================================
// WALLET
// =============================================
