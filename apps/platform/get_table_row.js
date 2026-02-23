const fs = require('fs');
const content = fs.readFileSync('components/orders/virtualized-order-table.tsx', 'utf8');
const startIndex = content.indexOf('// Order row wrapper');
const endIndex = content.indexOf('</div>', content.lastIndexOf('</select>') + 500); // just grab a big chunk
console.log(content.slice(startIndex, startIndex + 15000));
