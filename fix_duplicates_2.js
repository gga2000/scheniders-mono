const fs = require('fs');

let useOrders = fs.readFileSync('hooks/use-orders.ts', 'utf8');

useOrders = useOrders.replace(
    '        return orders.filter((o) => {\n            if (o.id === orderId) return false;\n            // Use normalized phone comparison\n            if (normalizePhoneForSearch(o.phone) !== normalizedOrderPhone) return false;',
    '        return orders.filter((o) => {\n            if (o.id === orderId || o.is_return) return false;\n            // Use normalized phone comparison\n            if (normalizePhoneForSearch(o.phone) !== normalizedOrderPhone) return false;'
);

fs.writeFileSync('hooks/use-orders.ts', useOrders);
