const fs = require('fs');
let code = fs.readFileSync('components/orders/virtualized-order-table.tsx', 'utf8');

// Container
code = code.replace(
    'className={cn("bg-[#f8f9fa] border-b border-gray-200 sticky top-0 z-30 shadow-sm", "grid grid-cols-[48px_40px_100px_160px_110px_110px_100px_minmax(150px,1.5fr)_minmax(180px,2fr)_100px_120px_80px_100px_40px]")}',
    'className={cn("bg-[var(--background)] border-b border-[var(--card-border)] sticky top-0 z-30", "grid grid-cols-[48px_40px_100px_160px_110px_110px_100px_minmax(150px,1.5fr)_minmax(180px,2fr)_100px_120px_80px_100px_40px]")}'
);

// Hash Header
code = code.replace(
    '"w-10 px-2 py-3 text-center text-xs font-semibold text-gray-500 border-r border-gray-200 border-b cursor-pointer hover:bg-gray-100 transition-colors"',
    '"w-10 px-2 py-3 text-center text-xs font-semibold text-muted border-r border-gray-100 cursor-pointer hover:bg-gray-50"'
);
code = code.replace(
    /ArrowUp className="w-2 h-2 text-blue-500"/g,
    'ArrowUp className="w-2 h-2 text-primary"'
);
code = code.replace(
    /ArrowDown className="w-2 h-2 text-blue-500"/g,
    'ArrowDown className="w-2 h-2 text-primary"'
);

// Checkbox Header
code = code.replace(
    '"w-10 px-2 py-3 text-center border-b border-gray-200"',
    '"w-10 px-2 py-3 text-center"'
);

// Mapped cols Header
code = code.replace(
    '"px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider relative group border-b border-gray-200"',
    '"px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider relative group"'
);
code = code.replace(
    '!col.noSort && "cursor-pointer hover:bg-gray-100 transition-colors"',
    '!col.noSort && "cursor-pointer hover:bg-gray-50"'
);

// Filter Icon changes (map cols & product filter)
code = code.replace(
    /className={cn\("p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200 text-gray-400", columnFilters\[col\.key\] && "opacity-100 text-blue-600"\)}/g,
    'className={cn("p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200", columnFilters[col.key] && "opacity-100 text-blue-600")}'
);
code = code.replace(
    'className={cn("p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200 text-gray-400", filters.product && "opacity-100 text-blue-600")}',
    'className={cn("p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200", filters.product && "opacity-100 text-blue-600")}'
);


// Products Header
code = code.replace(
    '"min-w-[150px] px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200"',
    '"min-w-[150px] px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider"'
);

// Amount Header
code = code.replace(
    '"w-24 px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group border-b border-gray-200"',
    '"w-24 px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-50 group"'
);

// Status Header
code = code.replace(
    '"w-28 px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200"',
    '"w-28 px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider"'
);

// Source Header
code = code.replace(
    '"w-16 px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200"',
    '"w-16 px-2 py-3 text-center text-xs font-semibold text-muted uppercase tracking-wider"'
);

// Date Header
code = code.replace(
    '"w-24 px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200"',
    '"w-24 px-2 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider"'
);

// Status row dot marker Header
code = code.replace(
    '"w-10 px-2 py-3 text-center text-xs font-semibold text-gray-500 border-b border-gray-200"',
    '"w-10 px-2 py-3 text-center text-xs font-semibold text-muted"'
);

fs.writeFileSync('components/orders/virtualized-order-table.tsx', code);
console.log('Fixed header styles.');
