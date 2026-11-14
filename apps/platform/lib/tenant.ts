import { createSupabaseServiceClient } from '@/lib/supabase-server';
import { isBillingExempt } from "@/lib/billing-exempt";
import { RESERVED_SLUGS } from "@/lib/tenant-slug";

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

/**
 * Arabic → Latin transliteration for slugs (UX2-13).
 *
 * Without this every Arabic-named store slugged to `tenant-<timestamp>`,
 * because the `[^a-z0-9-]` strip below deleted the whole name — so the
 * merchant's public, WhatsApp-shared URL was a machine id. Iraqi
 * merchants name their store in Arabic, so this is the common path, not
 * the edge case. Mapping is intentionally simple (no diacritics, no
 * hamza forms) because the output only needs to be readable and stable.
 */
const AR_TO_LATIN: Record<string, string> = {
    'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
    'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
    'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
    'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a', 'ء': '', 'ؤ': 'w',
    'ئ': 'y', 'پ': 'p', 'چ': 'ch', 'ژ': 'zh', 'گ': 'g', 'ڵ': 'l', 'ڕ': 'r',
    'ۆ': 'o', 'ێ': 'e',
};

function transliterateArabic(input: string): string {
    let out = '';
    for (const ch of input) {
        if (ch in AR_TO_LATIN) out += AR_TO_LATIN[ch];
        // Drop Arabic diacritics/tatweel entirely rather than turning them
        // into separators.
        else if (/[ً-ْـ]/.test(ch)) continue;
        else out += ch;
    }
    return out;
}

/**
 * Generate a URL-safe slug from a business name.
 * "Acme Perfumes" → "acme-perfumes"
 * "متجر زهراء"    → "mtjr-zhraa"
 */
export function generateSlug(name: string): string {
    return transliterateArabic(name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        || `tenant-${Date.now()}`;
}

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
    const adminClient = createSupabaseServiceClient();
    // A store named "Support" or "Scheniders" must not become
    // support.<root> / scheniders.<root>, which read as platform pages. The
    // handle-claim route already refuses these; signup lands here instead.
    const baseSlug = looksLikePlatformHost(requested) ? `store-${requested}` : requested;
    let slug = baseSlug;
    let attempt = 0;

    while (true) {
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

        if (!current.data && !history.data) return slug;

        attempt++;
        slug = `${baseSlug}-${attempt}`;
    }
}

/** Reserved platform subdomains, and anything posing as the platform's name. */
function looksLikePlatformHost(slug: string): boolean {
    return RESERVED_SLUGS.has(slug) || slug.startsWith("schenider");
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
export async function canCreateOrder(tenantId: string): Promise<{
    allowed: boolean;
    reason?: string;
    warning?: string;
}> {
    // Check tenant status
    const tenant = await getTenantById(tenantId);
    if (!tenant) return { allowed: false, reason: 'Tenant not found' };

    // The house tier is never billed, so no billing state may block its orders.
    if (isBillingExempt(tenant.plan)) return { allowed: true };

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
