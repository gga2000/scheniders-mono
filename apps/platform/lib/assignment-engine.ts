import { Order } from './supabase';
import { AssignmentRule, OrderAssignment } from './team-types';

/**
 * Runs the assignment rules engine against a list of orders.
 * Rules are evaluated in order of priority (highest first).
 * An order is only assigned to a duty if it doesn't already have an assignment for that duty 
 * (unless we want to build a re-assignment feature later).
 */
export function evaluateAutoAssignments(
    orders: Order[],
    rules: AssignmentRule[],
    currentAssignments: OrderAssignment[]
): OrderAssignment[] {
    const newAssignments: OrderAssignment[] = [];

    // Sort rules by priority descending
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    for (const order of orders) {
        // Evaluate each requested duty type needed for the order
        // For standard flow, 'new'/contacted orders might need confirmation
        // 'confirmed' orders might need fulfillment

        let needsConfirmation = ['new', 'contacted'].includes(order.status) &&
            !currentAssignments.some(a => a.order_id === order.id && a.duty === 'confirmation') &&
            !newAssignments.some(a => a.order_id === order.id && a.duty === 'confirmation');

        let needsFulfillment = order.status === 'confirmed' &&
            !currentAssignments.some(a => a.order_id === order.id && a.duty === 'fulfillment') &&
            !newAssignments.some(a => a.order_id === order.id && a.duty === 'fulfillment');

        if (!needsConfirmation && !needsFulfillment) continue;

        for (const rule of sortedRules) {
            if (!rule.is_active) continue;

            // Only check rule if we still need this duty filled
            if (rule.duty === 'confirmation' && !needsConfirmation) continue;
            if (rule.duty === 'fulfillment' && !needsFulfillment) continue;

            // Check if order matches ALL conditions of the rule
            const matchesAll = rule.conditions.every(condition => {
                const orderValue = String((order as any)[condition.field] || '').toLowerCase();
                const targetValue = condition.value.toLowerCase();

                switch (condition.operator) {
                    case 'equals':
                        return orderValue === targetValue;
                    case 'contains':
                        return orderValue.includes(targetValue);
                    case 'any':
                        return true;
                    default:
                        return false;
                }
            });

            if (matchesAll) {
                newAssignments.push({
                    id: crypto.randomUUID(),
                    order_id: order.id,
                    employee_id: rule.employee_id,
                    duty: rule.duty,
                    assigned_at: new Date().toISOString(),
                    status: 'pending'
                });

                if (rule.duty === 'confirmation') needsConfirmation = false;
                if (rule.duty === 'fulfillment') needsFulfillment = false;
            }
        }
    }

    return newAssignments;
}
