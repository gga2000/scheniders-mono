// =============================================
// RE-EXPORTS FROM CENTRALIZED TYPES
// All types that were previously defined here are now in @/types/expense
// These re-exports maintain backward compatibility.
// =============================================
export type {
    ExpenseCategory,
    Expense,
    OrderCostBreakdown,
    ProfitSummary,
    CustomerAnalytics,
    PipelineSummary,
} from '@/types/expense';

export {
    expenseCategoryLabels,
    expenseCategoryColors,
    ORDER_FIXED_COSTS,
} from '@/types/expense';
