import { supabase } from "@/lib/supabase";

// Expense category type
export type ExpenseCategory =
    | 'product_cost'
    | 'packaging'
    | 'sample_vial'
    | 'sample_perfume'
    | 'thank_you_cards'
    | 'sweets'
    | 'marketing'
    | 'shipping'
    | 'other';

// Expense interface
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
    product_cost: '#f59e0b', // amber
    packaging: '#8b5cf6', // violet
    sample_vial: '#06b6d4', // cyan
    sample_perfume: '#ec4899', // pink
    thank_you_cards: '#10b981', // emerald
    sweets: '#f97316', // orange
    marketing: '#3b82f6', // blue
    shipping: '#6366f1', // indigo
    other: '#6b7280', // gray
};

// =============================================
// ORDER COST CONSTANTS (IQD)
// =============================================

/**
 * Fixed costs absorbed per order (in Iraqi Dinars)
 * These are costs we pay but don't charge the customer.
 */
export const ORDER_FIXED_COSTS = {
    /** Free delivery we absorb (paid to courier) */
    DELIVERY: 5000,
    /** Candy/sweets per order */
    SWEETS: 125,
    /** Cost per packaging bag (4260 IQD / 12 bags) */
    PACKAGING_PER_BAG: 355,
    /** Cost per sample vial (40000 IQD / 1000 vials) */
    VIAL_COST: 40,
    /** Milliliters of perfume per sample vial */
    VIAL_ML: 1,
} as const;

/**
 * Detailed breakdown of costs for a single order.
 * Used for profit analysis and reporting.
 */
export interface OrderCostBreakdown {
    orderId: string;
    orderNumber?: number;
    customerName: string;
    orderDate: string;
    /** Total revenue from the order (price paid by customer) */
    revenue: number;
    /** Wholesale cost of products sold */
    productCost: number;
    /** Delivery fee absorbed (5000 IQD) */
    deliveryCost: number;
    /** Packaging bags cost (355 IQD × number of items/bags) */
    packagingCost: number;
    /** Sample vial cost (40 IQD × number of unique products) */
    vialCost: number;
    /** Sample perfume cost (wholesale/100 for each unique product's 1ml sample) */
    samplePerfumeCost: number;
    /** Sweets cost (125 IQD) */
    sweetsCost: number;
    /** Sum of all costs */
    totalCost: number;
    /** Revenue minus total cost */
    grossProfit: number;
    /** Profit margin percentage */
    profitMargin: number;
    /** Number of items in the order */
    itemCount: number;
    /** Number of unique products */
    uniqueProductCount: number;
}

/**
 * Aggregated profit statistics for a period
 */
export interface ProfitSummary {
    totalRevenue: number;
    totalProductCost: number;
    totalDeliveryCost: number;
    totalPackagingCost: number;
    totalVialCost: number;
    totalSamplePerfumeCost: number;
    totalSweetsCost: number;
    totalOperationalCost: number; // All costs except marketing
    marketingCost: number; // Manually added
    totalCost: number; // Including marketing
    grossProfit: number; // Revenue - operational costs
    netProfit: number; // Gross profit - marketing
    grossProfitMargin: number;
    netProfitMargin: number;
    orderCount: number;
    avgProfitPerOrder: number;
}

/**
 * Customer analytics data
 */
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

/**
 * Pipeline summary for orders with potential to be delivered
 * (confirmed + in_transit orders)
 */
export interface PipelineSummary {
    /** Number of orders in the pipeline */
    orderCount: number;
    /** Confirmed orders count */
    confirmedCount: number;
    /** In transit orders count */
    inTransitCount: number;
    /** Potential revenue if all pipeline orders deliver */
    potentialRevenue: number;
    /** Projected profit if all deliver (revenue - estimated costs) */
    projectedProfit: number;
    /** Projected profit margin */
    projectedProfitMargin: number;
    /** Estimated total costs for pipeline orders */
    estimatedCosts: number;
    /** Average potential order value */
    avgOrderValue: number;
}
