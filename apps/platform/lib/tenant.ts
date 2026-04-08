import { createSupabaseServiceClient, createSupabaseServerClientWithToken } from '@/lib/supabase-server';

// =============================================
// TYPES
// =============================================

export type PlanTier = 'starter' | 'growth' | 'professional' | 'enterprise';
export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled';
export type MemberStatus = 'pending' | 'active' | 'suspended';

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
    contact_email: string | null;
    contact_phone: string | null;
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

export interface WalletInfo {
    balance_iqd: number;
    threshold_iqd: number;
    total_charged_iqd: number;
    total_topped_up_iqd: number;
}

// =============================================
// SLUG GENERATION
// =============================================

/**
 * Generate a URL-safe slug from a business name.
 * "Acme Perfumes" → "acme-perfumes"
 */
export function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .trim()
        // Replace Arabic/special chars with latin equivalents where possible
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        || `tenant-${Date.now()}`;
}

/**
 * Ensure the slug is unique by appending a number if needed.
 * Uses service role to bypass RLS.
 */
export async function ensureUniqueSlug(baseSlug: string): Promise<string> {
    const adminClient = createSupabaseServiceClient();
    let slug = baseSlug;
    let attempt = 0;

    while (true) {
        const { data } = await adminClient
            .from('tenants')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();

        if (!data) return slug;

        attempt++;
        slug = `${baseSlug}-${attempt}`;
    }
}

// =============================================
// TENANT RESOLUTION
// =============================================

/**
 * Get the tenant that a user currently belongs to.
 * Uses the user's access token to enforce RLS.
 */
export async function getUserTenant(accessToken: string): Promise<Tenant | null> {
    const client = createSupabaseServerClientWithToken(accessToken);

    const { data: profile } = await client
        .from('user_profiles')
        .select('current_tenant_id')
        .single();

    if (!profile?.current_tenant_id) return null;

    const { data: tenant } = await client
        .from('tenants')
        .select('*')
        .eq('id', profile.current_tenant_id)
        .single();

    return tenant;
}

/**
 * Get a tenant by slug (service role — for signup/admin use only).
 */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
    const adminClient = createSupabaseServiceClient();
    const { data } = await adminClient
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .single();
    return data;
}

/**
 * Get a tenant by ID (service role — for internal use).
 */
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
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
export async function getPlanLimits(plan: PlanTier): Promise<PlanLimits | null> {
    const adminClient = createSupabaseServiceClient();
    const { data } = await adminClient
        .from('plan_limits')
        .select('*')
        .eq('plan', plan)
        .single();
    return data;
}

/**
 * Get all plan limits (for pricing page, upgrade modal, etc.)
 */
export async function getAllPlanLimits(): Promise<PlanLimits[]> {
    const adminClient = createSupabaseServiceClient();
    const { data } = await adminClient
        .from('plan_limits')
        .select('*')
        .order('base_price_iqd', { ascending: true });
    return data ?? [];
}

// =============================================
// USAGE TRACKING
// =============================================

/**
 * Get the current month's usage for a tenant.
 */
export async function getCurrentUsage(tenantId: string): Promise<TenantUsage> {
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
export async function canCreateOrder(tenantId: string): Promise<{
    allowed: boolean;
    reason?: string;
    warning?: string;
}> {
    const adminClient = createSupabaseServiceClient();

    // Check tenant status
    const tenant = await getTenantById(tenantId);
    if (!tenant) return { allowed: false, reason: 'Tenant not found' };

    if (tenant.status === 'suspended') {
        return { allowed: false, reason: 'Account is suspended. Please contact support.' };
    }

    if (tenant.status === 'cancelled') {
        return { allowed: false, reason: 'Subscription has been cancelled.' };
    }

    // Check trial expiry
    if (tenant.status === 'trial' && tenant.trial_ends_at) {
        if (new Date(tenant.trial_ends_at) < new Date()) {
            return { allowed: false, reason: 'Your trial has expired. Please subscribe to continue.' };
        }
    }

    const limits = await getPlanLimits(tenant.plan);
    if (!limits) return { allowed: true }; // No limits found, allow

    // Unlimited plan
    if (limits.max_orders_per_month === -1) return { allowed: true };

    const usage = await getCurrentUsage(tenantId);
    const hardLimit = Math.ceil(limits.max_orders_per_month * 1.1); // 110% hard block

    if (usage.orders_count >= hardLimit) {
        return {
            allowed: false,
            reason: `Monthly order limit exceeded (${usage.orders_count}/${limits.max_orders_per_month}). Upgrade your plan to continue.`,
        };
    }

    if (usage.orders_count >= limits.max_orders_per_month) {
        return {
            allowed: true,
            warning: `You've reached your monthly order limit (${limits.max_orders_per_month}). Additional orders are charged at ${limits.overage_price_iqd} IQD each.`,
        };
    }

    if (usage.orders_count >= limits.max_orders_per_month * 0.9) {
        return {
            allowed: true,
            warning: `You've used ${Math.round((usage.orders_count / limits.max_orders_per_month) * 100)}% of your monthly order limit.`,
        };
    }

    return { allowed: true };
}

// =============================================
// WALLET
// =============================================

/**
 * Get wallet info for a tenant (service role).
 */
export async function getWallet(tenantId: string): Promise<WalletInfo | null> {
    const adminClient = createSupabaseServiceClient();
    const { data } = await adminClient
        .from('wallet')
        .select('balance_iqd, threshold_iqd, total_charged_iqd, total_topped_up_iqd')
        .eq('tenant_id', tenantId)
        .maybeSingle();
    return data;
}

/**
 * Deduct from wallet for order charges (service role).
 * Returns the new balance, or throws if insufficient funds.
 */
export async function chargeWallet(
    tenantId: string,
    amountIqd: number,
    description: string,
    referenceId?: string
): Promise<{ newBalance: number }> {
    const adminClient = createSupabaseServiceClient();

    // Get current balance
    const { data: wallet, error: walletError } = await adminClient
        .from('wallet')
        .select('balance_iqd')
        .eq('tenant_id', tenantId)
        .single();

    if (walletError || !wallet) throw new Error('Wallet not found');

    const newBalance = wallet.balance_iqd - amountIqd;

    // Update balance
    const { error: updateError } = await adminClient
        .from('wallet')
        .update({
            balance_iqd: newBalance,
            total_charged_iqd: adminClient.rpc('increment', { row_id: tenantId, amount: amountIqd }),
            updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId);

    if (updateError) throw new Error(`Failed to charge wallet: ${updateError.message}`);

    // Log the transaction
    await adminClient.from('wallet_transactions').insert({
        tenant_id: tenantId,
        type: 'charge',
        amount_iqd: -amountIqd,
        balance_after_iqd: newBalance,
        description,
        reference_id: referenceId,
    });

    return { newBalance };
}

// =============================================
// TENANT VALIDATION HELPERS
// =============================================

/**
 * Verify that a user is a member of a tenant.
 * Returns the member's role or null if not a member.
 */
export async function getUserTenantRole(
    userId: string,
    tenantId: string
): Promise<string | null> {
    const adminClient = createSupabaseServiceClient();
    const { data } = await adminClient
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
    return data?.role ?? null;
}
