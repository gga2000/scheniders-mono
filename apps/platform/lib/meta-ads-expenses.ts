/** One auto-posted marketing expense per day, built from Meta ad spend. */
export const META_EXPENSE_SOURCE = "meta_ads";
export const META_EXPENSE_CATEGORY = "marketing";

export interface DailySpend {
    spendDate: string;
    spendIqd: number;
}

export interface MetaExpenseRow {
    tenant_id: string;
    expense_date: string;
    category: typeof META_EXPENSE_CATEGORY;
    description: string;
    amount: number;
    source: typeof META_EXPENSE_SOURCE;
    external_key: string;
}

export function metaExpenseKey(day: string): string {
    return `${META_EXPENSE_SOURCE}:${day}`;
}

/**
 * Sums campaign rows into one expense per day. A day that already has a manual
 * marketing expense is skipped so the same spend is never counted twice.
 */
export function planMetaExpenses(
    tenantId: string,
    spend: DailySpend[],
    manualMarketingDays: ReadonlySet<string>,
): MetaExpenseRow[] {
    const perDay = new Map<string, number>();
    for (const s of spend) perDay.set(s.spendDate, (perDay.get(s.spendDate) ?? 0) + s.spendIqd);
    return [...perDay.entries()]
        .filter(([day, total]) => total > 0 && !manualMarketingDays.has(day))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, total]) => ({
            tenant_id: tenantId,
            expense_date: day,
            category: META_EXPENSE_CATEGORY,
            description: "Meta ads",
            amount: Math.round(total),
            source: META_EXPENSE_SOURCE,
            external_key: metaExpenseKey(day),
        }));
}
