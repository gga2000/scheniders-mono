/** What a member's pay would be if every order now with the courier is completed. */
export interface InTransitProjection {
    /** Genuine orders now in transit or delivered (not yet completed) for this member. */
    orders: number;
    /** Order pay those orders would add at the member's per-order rate. */
    extraOrderBonus: number;
    /** Net pay if they all complete, after the same deductions; never below 0. */
    projectedNet: number;
}

/** Statuses of orders that have left the store but are not completed (money not collected). */
export const IN_TRANSIT_STATUSES = ["in_transit", "delivered"] as const;

/**
 * A what-if only: actual pay counts completed orders. Replacements and refunds are left out
 * by the caller because they never earn order pay.
 */
export function projectInTransit(
    calc: { grossSalary: number; carriedIn?: number; absenceDeduction: number; advancesTotal: number; penaltiesTotal: number },
    inTransitOrders: number,
    perOrderBonus: number,
): InTransitProjection {
    const extraOrderBonus = Math.round(inTransitOrders * perOrderBonus);
    const projectedNet = Math.max(
        0,
        calc.grossSalary + (calc.carriedIn ?? 0) + extraOrderBonus - calc.absenceDeduction - calc.advancesTotal - calc.penaltiesTotal,
    );
    return { orders: inTransitOrders, extraOrderBonus, projectedNet };
}
