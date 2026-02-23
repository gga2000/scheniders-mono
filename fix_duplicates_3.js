const fs = require('fs');

let useOrders = fs.readFileSync('hooks/use-orders.ts', 'utf8');

useOrders = useOrders.replace(
    '            // Same phone number\n            if (order.phone !== phone) return false;',
    '            // Same phone number\n            if (order.phone !== phone) return false;\n\n            if (order.is_return) return false;'
);

fs.writeFileSync('hooks/use-orders.ts', useOrders);
