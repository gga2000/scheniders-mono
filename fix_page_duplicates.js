const fs = require('fs');
let pageTsx = fs.readFileSync('app/orders/page.tsx', 'utf8');

pageTsx = pageTsx.replace(
    '                                o.phone === duplicateOrder.phone\n                            )}',
    '                                o.phone === duplicateOrder.phone &&\n                                !o.is_return\n                            )}'
);

fs.writeFileSync('app/orders/page.tsx', pageTsx);
