// =============================================
// CUSTOMER DOMAIN TYPES
// Centralized type definitions for all customer-related entities
// =============================================

import type { Order } from './order';

export type TagColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'orange' | 'red' | 'gray';

export type CustomerStatus = 'new' | 'regular' | 'vip';

export interface CustomerTag {
    id: string;
    name: string;
    color: TagColor;
    created_at: string;
}

export interface CustomerNote {
    id: string;
    customer_phone: string;
    note: string;
    created_at: string;
    updated_at?: string;
    /** Who wrote it; null for notes from before authors were kept. */
    created_by?: string | null;
}

export interface CustomerMetadata {
    customer_phone: string;
    birthday?: string;
    manual_status?: CustomerStatus;
    created_at: string;
    updated_at?: string;
}

export interface CustomerTagAssignment {
    id: string;
    customer_phone: string;
    tag_id: string;
    created_at: string;
    tag?: CustomerTag;
}

// Tag color mappings for UI
export const tagColorClasses: Record<TagColor, { bg: string; text: string }> = {
    yellow: { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-800 dark:text-amber-200' },
    green: { bg: 'bg-green-100 dark:bg-green-500/15', text: 'text-green-800 dark:text-green-200' },
    blue: { bg: 'bg-blue-100 dark:bg-blue-500/15', text: 'text-blue-800 dark:text-blue-200' },
    pink: { bg: 'bg-pink-100 dark:bg-pink-500/15', text: 'text-pink-800 dark:text-pink-200' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-500/15', text: 'text-purple-800 dark:text-purple-200' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-800 dark:text-orange-200' },
    red: { bg: 'bg-red-100 dark:bg-red-500/15', text: 'text-red-800 dark:text-red-200' },
    gray: { bg: 'bg-gray-100 dark:bg-white/10', text: 'text-gray-800 dark:text-gray-200' },
};

// Aggregate customer entity (computed from orders)
export interface Customer {
    id: string;
    name: string;
    phone: string;
    city?: string;
    governorate?: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderDate: string;
    firstOrderDate: string;
    orders: Order[];
    status: CustomerStatus;
    favoriteProducts: { name: string; count: number }[];
    tags?: CustomerTag[];
    metadata?: CustomerMetadata;
    isBlacklisted?: boolean;
}

export interface CustomerFilters {
    status?: CustomerStatus | "all";
    city?: string;
    dateRange?: { start: string; end: string };
    minSpend?: number;
    maxSpend?: number;
    productName?: string;
    search?: string;
    sortBy?: "name" | "orders" | "spent" | "lastOrder";
    sortOrder?: "asc" | "desc";
}

export interface GeoDistribution {
    city: string;
    count: number;
    revenue: number;
}

export interface CustomerGrowth {
    date: string;
    newCustomers: number;
    totalCustomers: number;
}

// Trust tier system (replaces risk levels for display)
export type TrustTier = 'platinum' | 'gold' | 'silver' | 'bronze' | 'new' | 'watch' | 'risky' | 'critical' | 'blocked';

export interface TrustScoreBreakdownItem {
    label: string;
    value: number;
    type: 'positive' | 'negative' | 'neutral';
}

export interface TrustAuditEvent {
    id: string;
    event_date: string;
    event_type: string;
    reason: string | null;
    score_change: number;
    score_before: number;
    score_after: number;
    source: string;
    order_id: string | null;
    edited_at: string | null;
    edited_by: string | null;
    edited_reason: string | null;
    original_reason: string | null;
}

export interface CommunityRating {
    id: string;
    customer_phone: string;
    order_id: string | null;
    rater_id: string | null;
    rater_store_id: string | null;
    trust_stars: number;
    communication_stars: number;
    behavior_stars: number;
    overall_type: 'positive' | 'neutral' | 'warning';
    comment: string | null;
    quick_tags: string[];
    is_anonymous: boolean;
    created_at: string;
    disputed: boolean;
    dispute_reason: string | null;
}

export interface CustomerLink {
    id: string;
    phone_a: string;
    phone_b: string;
    relationship_type: 'same_address' | 'family' | 'coworker' | 'duplicate';
    similarity_hint: string | null;
    linked_by: string | null;
    created_at: string;
}

export interface TrustTierConfig {
    labelKey: string;
    labelAr: string;
    color: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    glowClass: string;
    ringColor: string;
}

export const TRUST_TIER_CONFIG: Record<TrustTier, TrustTierConfig> = {
    platinum: {
        labelKey: 'customers.tier.platinum',
        labelAr: 'بلاتيني',
        color: '#A855F7',
        bgClass: 'bg-purple-100',
        textClass: 'text-purple-700',
        borderClass: 'border-purple-300',
        glowClass: 'shadow-[0_0_20px_rgba(168,85,247,0.3)]',
        ringColor: '#A855F7',
    },
    gold: {
        labelKey: 'customers.tier.gold',
        labelAr: 'ذهبي',
        color: '#F59E0B',
        bgClass: 'bg-amber-100',
        textClass: 'text-amber-700',
        borderClass: 'border-amber-300',
        glowClass: 'shadow-[0_0_15px_rgba(245,158,11,0.25)]',
        ringColor: '#F59E0B',
    },
    silver: {
        labelKey: 'customers.tier.silver',
        labelAr: 'فضي',
        color: '#94A3B8',
        bgClass: 'bg-slate-100',
        textClass: 'text-slate-600',
        borderClass: 'border-slate-300',
        glowClass: '',
        ringColor: '#94A3B8',
    },
    bronze: {
        labelKey: 'customers.tier.bronze',
        labelAr: 'برونزي',
        color: '#D97706',
        bgClass: 'bg-orange-100',
        textClass: 'text-orange-700',
        borderClass: 'border-orange-300',
        glowClass: '',
        ringColor: '#D97706',
    },
    new: {
        labelKey: 'customers.tier.new',
        labelAr: 'جديد',
        color: '#3B82F6',
        bgClass: 'bg-blue-100',
        textClass: 'text-blue-700',
        borderClass: 'border-blue-300',
        glowClass: '',
        ringColor: '#3B82F6',
    },
    watch: {
        labelKey: 'customers.tier.watch',
        labelAr: 'مراقبة',
        color: '#EAB308',
        bgClass: 'bg-yellow-100',
        textClass: 'text-yellow-700',
        borderClass: 'border-yellow-400',
        glowClass: '',
        ringColor: '#EAB308',
    },
    risky: {
        labelKey: 'customers.tier.risky',
        labelAr: 'خطر',
        color: '#EF4444',
        bgClass: 'bg-red-100',
        textClass: 'text-red-700',
        borderClass: 'border-red-400',
        glowClass: '',
        ringColor: '#EF4444',
    },
    critical: {
        labelKey: 'customers.tier.critical',
        labelAr: 'حرج',
        color: '#991B1B',
        bgClass: 'bg-red-900',
        textClass: 'text-white',
        borderClass: 'border-red-800',
        glowClass: '',
        ringColor: '#991B1B',
    },
    blocked: {
        labelKey: 'customers.tier.blocked',
        labelAr: 'محظور',
        color: '#1F2937',
        bgClass: 'bg-gray-900',
        textClass: 'text-white',
        borderClass: 'border-gray-700',
        glowClass: '',
        ringColor: '#1F2937',
    },
};
