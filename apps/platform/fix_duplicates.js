const fs = require('fs');

// 1. Fix use-orders.ts
let useOrders = fs.readFileSync('hooks/use-orders.ts', 'utf8');

useOrders = useOrders.replace(
    'orders.filter((order) => normalizePhoneForSearch(order.phone) === normalizedPhone)',
    'orders.filter((order) => normalizePhoneForSearch(order.phone) === normalizedPhone && !order.is_return)'
);

useOrders = useOrders.replace(
    '        orders.forEach((order) => {\n            if (order.is_archived) return;\n\n            const normalizedPhone = normalizePhoneForSearch(order.phone);',
    '        orders.forEach((order) => {\n            if (order.is_archived || order.is_return) return;\n\n            const normalizedPhone = normalizePhoneForSearch(order.phone);'
);

fs.writeFileSync('hooks/use-orders.ts', useOrders);

// 2. Fix app/orders/page.tsx
let pageTsx = fs.readFileSync('app/orders/page.tsx', 'utf8');

pageTsx = pageTsx.replace(
    '                                                                    normalizePhone(o.phone) === normalizePhone(order.phone)\n                                                            );',
    '                                                                    normalizePhone(o.phone) === normalizePhone(order.phone) &&\n                                                                    !o.is_return\n                                                            );'
);

fs.writeFileSync('app/orders/page.tsx', pageTsx);
