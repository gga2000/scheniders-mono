const fs = require('fs');
let code = fs.readFileSync('components/orders/virtualized-order-table.tsx', 'utf8');

const gridColsClass = "grid grid-cols-[48px_40px_100px_160px_110px_110px_100px_minmax(150px,1.5fr)_minmax(180px,2fr)_100px_120px_80px_100px_40px]";

// Replace table to div
code = code.replace(
    '<table className="w-full relative border-separate border-spacing-0">',
    '<div className="w-full relative flex flex-col min-w-[1350px]" role="table">'
);
code = code.replace('</table>', '</div>');

// Replace thead and its inner tr
code = code.replace(
    '<thead className="bg-[#f8f9fa] border-b border-gray-200 sticky top-0 z-30 shadow-sm">\n                        <tr>',
    `<div className={cn("bg-[#f8f9fa] border-b border-gray-200 sticky top-0 z-30 shadow-sm", "${gridColsClass}")} role="row">\n                        <div className="contents">`
);
code = code.replace('</tr>\n                    </thead>', '</div>\n                    </div>');

// Replace tbody
code = code.replace(
    '<tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: \'relative\' }}>',
    '<div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: \'relative\' }} role="rowgroup">'
);
code = code.replace('</tbody>', '</div>');

// Replace standard th with div
code = code.replace(/<th /g, '<div role="columnheader" ');
code = code.replace(/<\/th>/g, '</div>');

// Replace td with div
code = code.replace(/<td /g, '<div role="cell" ');
code = code.replace(/<td\n/g, '<div role="cell"\n');
code = code.replace(/<\/td>/g, '</div>');

// Replace body group header tr
code = code.replace(
    /<tr\n\s+key=\{virtualRow\.key\}\n\s+style=\{\{\n\s+position: 'absolute', top: 0, left: 0, width: '100%',\n\s+height: `\$\{virtualRow\.size\}px`,\n\s+transform: `translateY\(\$\{virtualRow\.start\}px\)`\n\s+\}\}\n\s+className="bg-white\/95 backdrop-blur-sm z-20 sticky-group-header shadow-\[0_1px_2px_rgba\(0,0,0,0.02\)\] border-b border-gray-200"/,
    `<div\n                                        key={virtualRow.key}\n                                        style={{\n                                            position: 'absolute', top: 0, left: 0, width: '100%',\n                                            height: \`\${virtualRow.size}px\`,\n                                            transform: \`translateY(\${virtualRow.start}px)\`\n                                        }}\n                                        className="bg-white/95 backdrop-blur-sm z-20 sticky-group-header shadow-[0_1px_2px_rgba(0,0,0,0.02)] border-b border-gray-200 flex items-center"`
);
// Replace end of header tr
code = code.replace(
    /<\/tr>\n\s+\);\n\s+\}/g,
    '</div>\n                                );\n                            }'
);

// Replace body item tr
code = code.replace(
    /<tr\n\s+key=\{virtualRow\.key\}\n\s+data-index=\{virtualRow\.index\}\n\s+style=\{\{\n\s+position: 'absolute', top: 0, left: 0, width: '100%',\n\s+height: `\$\{virtualRow\.size\}px`,\n\s+transform: `translateY\(\$\{virtualRow\.start\}px\)`\n\s+\}\}\n\s+className=\{cn\(/,
    `<div\n                                    key={virtualRow.key}\n                                    data-index={virtualRow.index}\n                                    style={{\n                                        position: 'absolute', top: 0, left: 0, width: '100%',\n                                        height: \`\${virtualRow.size}px\`,\n                                        transform: \`translateY(\${virtualRow.start}px)\`\n                                    }}\n                                    role="row"\n                                    className={cn(\n                                        "${gridColsClass}",\n                                        "items-center",`
);

code = code.replace(/<\/tr>/g, '</div>');

fs.writeFileSync('components/orders/virtualized-order-table.tsx', code);
console.log('Table structure transformed to grid div structure');
