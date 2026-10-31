// =============================================
// EXPENSE / FINANCE DOMAIN TYPES
// =============================================

export const EXPENSE_CATEGORIES = [
    'product_cost',
    'packaging',
    'sample_vial',
    'sample_perfume',
    'thank_you_cards',
    'sweets',
    'marketing',
    'shipping',
    'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
    id: string;
    created_at: string;
    updated_at?: string;
    expense_date: string;
    category: ExpenseCategory;
    description?: string;
    amount: number;
    order_id?: string;
    notes?: string;
    is_recurring: boolean;
    recurring_period?: string;
}

// Category labels for display
export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
    product_cost: 'Product Cost',
    packaging: 'Packaging',
    sample_vial: 'Sample Vial',
    sample_perfume: 'Sample Perfume',
    thank_you_cards: 'Thank You Cards',
    sweets: 'Sweets',
    marketing: 'Marketing',
    shipping: 'Shipping',
    other: 'Other',
};

// Category colors for charts
export const expenseCategoryColors: Record<ExpenseCategory, string> = {
    product_cost: '#f59e0b',
    packaging: '#8b5cf6',
    sample_vial: '#06b6d4',
    sample_perfume: '#ec4899',
    thank_you_cards: '#10b981',
    sweets: '#f97316',
    marketing: '#3b82f6',
    shipping: '#6366f1',
    other: '#6b7280',
};

// =============================================
// ORDER COST CONSTANTS (IQD)
// =============================================

export const ORDER_FIXED_COSTS = {
    DELIVERY: 5000,
    SWEETS: 125,
    PACKAGING_PER_BAG: 355,
    VIAL_COST: 40,
    VIAL_ML: 1,
} as const;

export interface OrderCostBreakdown {
    orderId: string;
    orderNumber?: number;
    customerName: string;
    orderDate: string;
    revenue: number;
    productCost: number;
    deliveryCost: number;
    packagingCost: number;
    vialCost: number;
    samplePerfumeCost: number;
    sweetsCost: number;
    totalCost: number;
    grossProfit: number;
    profitMargin: number;
    itemCount: number;
    uniqueProductCount: number;
}

export interface ProfitSummary {
    totalRevenue: number;
    totalProductCost: number;
    totalDeliveryCost: number;
    totalPackagingCost: number;
    totalVialCost: number;
    totalSamplePerfumeCost: number;
    totalSweetsCost: number;
    /** Cost of Goods Sold — product cost + sample perfume (the actual goods delivered). */
    totalCOGS: number;
    /** Operational costs excluding COGS — delivery, packaging, vial, sweets. */
    totalOperationalCost: number;
    marketingCost: number;
    totalCost: number;
    /** Revenue − COGS. Standard accounting gross profit. */
    grossProfit: number;
    /** Gross profit − operational (non-COGS) costs. */
    operatingProfit: number;
    /** Operating profit − marketing. Fully-loaded net profit. */
    netProfit: number;
    grossProfitMargin: number;
    operatingProfitMargin: number;
    netProfitMargin: number;
    orderCount: number;
    deliveredCount: number;
    completedCount: number;
    avgProfitPerOrder: number;
}

export interface CustomerAnalytics {
    totalCustomers: number;
    singleOrderCustomers: number;
    repeatCustomers: number;
    singleOrderRevenue: number;
    repeatCustomerRevenue: number;
    avgOrdersPerCustomer: number;
    topCustomers: Array<{
        phone: string;
        name: string;
        orderCount: number;
        totalRevenue: number;
    }>;
}

export interface PipelineSummary {
    orderCount: number;
    confirmedCount: number;
    inTransitCount: number;
    potentialRevenue: number;
    projectedProfit: number;
    projectedProfitMargin: number;
    estimatedCosts: number;
    avgOrderValue: number;
}

export interface FunnelSummary {
    totalOrders: number;
    pendingCount: number;       // new + contacted + pending_checkout
    confirmedCount: number;     // confirmed
    inTransitCount: number;     // in_transit
    deliveredCount: number;     // delivered + completed
    confirmationRate: number;   // (confirmed + inTransit + delivered) / total * 100
    deliveryRate: number;       // delivered / total * 100
    totalRevenue: number;       // all non-negative order prices
    deliveredRevenue: number;   // delivered + completed order prices
}
