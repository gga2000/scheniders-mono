function evaluateAutoAssignments(orders, rules, currentAssignments) {
    const newAssignments = [];
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

    for (const order of orders) {
        let needsConfirmation = ['new', 'contacted'].includes(order.status) &&
            !currentAssignments.some(a => a.order_id === order.id && a.duty === 'confirmation') &&
            !newAssignments.some(a => a.order_id === order.id && a.duty === 'confirmation');

        let needsFulfillment = order.status === 'confirmed' &&
            !currentAssignments.some(a => a.order_id === order.id && a.duty === 'fulfillment') &&
            !newAssignments.some(a => a.order_id === order.id && a.duty === 'fulfillment');

        if (!needsConfirmation && !needsFulfillment) continue;

        for (const rule of sortedRules) {
            if (!rule.is_active) continue;

            if (rule.duty === 'confirmation' && !needsConfirmation) continue;
            if (rule.duty === 'fulfillment' && !needsFulfillment) continue;

            const matchesAll = rule.conditions.every(condition => {
                const orderValue = String((order)[condition.field] || '').toLowerCase();
                const targetValue = condition.value.toLowerCase();

                switch (condition.operator) {
                    case 'equals': return orderValue === targetValue;
                    case 'contains': return orderValue.includes(targetValue);
                    case 'any': return true;
                    default: return false;
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

self.onmessage = (event) => {
    const { type, payload } = event.data;

    if (type === 'EVALUATE_ASSIGNMENTS') {
        const { orders, rules, currentAssignments } = payload;

        try {
            const result = evaluateAutoAssignments(orders, rules, currentAssignments);
            self.postMessage({ type: 'ASSIGNMENTS_RESULT', payload: result });
        } catch (error) {
            self.postMessage({ type: 'ERROR', payload: error.message });
        }
    }
};
